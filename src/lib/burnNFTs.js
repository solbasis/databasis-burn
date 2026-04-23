import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { burnV1 as burnCoreV1, mplCore } from '@metaplex-foundation/mpl-core';
import {
  burnV1 as burnMetadataV1,
  findMetadataPda,
  mplTokenMetadata,
  TokenStandard,
} from '@metaplex-foundation/mpl-token-metadata';
import { burn as burnCompressed, mplBubblegum } from '@metaplex-foundation/mpl-bubblegum';
import { publicKey } from '@metaplex-foundation/umi';
import { getAssetProof } from './helius';
import {
  Connection,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  createBurnInstruction,
  createCloseAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { RPC_URL } from '../config';
import { getConnection } from './helius';

function makeUmi(wallet) {
  return createUmi(RPC_URL)
    .use(mplCore())
    .use(mplTokenMetadata())
    .use(mplBubblegum())
    .use(walletAdapterIdentity(wallet));
}

export async function burnCNFT(wallet, nft) {
  const umi = makeUmi(wallet);
  const proof = await getAssetProof(nft.id);
  const { tree, dataHash, creatorHash, leafId } = nft.compression;

  // All 32-byte hashes are base58-encoded — reuse PublicKey.toBytes() for decoding
  const toBytes32 = (b58) => Array.from(new PublicKey(b58).toBytes());

  await burnCompressed(umi, {
    leafOwner:   publicKey(wallet.publicKey.toBase58()),
    merkleTree:  publicKey(tree),
    root:        toBytes32(proof.root),
    dataHash:    toBytes32(dataHash),
    creatorHash: toBytes32(creatorHash),
    nonce:       leafId,
    index:       leafId,
    proof:       proof.proof.map(p => publicKey(p)),
  }).sendAndConfirm(umi, { send: { skipPreflight: true } });
}

export async function burnCoreNFT(wallet, nft) {
  const umi = makeUmi(wallet);
  await burnCoreV1(umi, {
    asset: publicKey(nft.id),
    ...(nft.collection ? { collection: publicKey(nft.collection) } : {}),
  }).sendAndConfirm(umi);
}

export async function burnLegacyNFT(wallet, nft) {
  const umi = makeUmi(wallet);
  const collectionMetadata = nft.collection
    ? findMetadataPda(umi, { mint: publicKey(nft.collection) })
    : undefined;
  await burnMetadataV1(umi, {
    mint: publicKey(nft.id),
    tokenStandard: nft.interface === 'ProgrammableNFT'
      ? TokenStandard.ProgrammableNonFungible
      : TokenStandard.NonFungible,
    ...(collectionMetadata ? { collectionMetadata } : {}),
  }).sendAndConfirm(umi);
}

// Fallback for scam/non-standard NFTs with no valid Metaplex metadata
async function burnRawTokenAccount(wallet, mintAddress) {
  const connection = getConnection();
  const owner = wallet.publicKey;
  const mint = new PublicKey(mintAddress);

  // Look up the actual token account — don't assume it's the ATA
  const accounts = await connection.getTokenAccountsByOwner(owner, { mint });
  if (accounts.value.length === 0) throw new Error('No token account found for this NFT');
  const tokenAccount = accounts.value[0].pubkey;

  const tx = new Transaction();
  tx.add(createBurnInstruction(tokenAccount, mint, owner, 1n, [], TOKEN_PROGRAM_ID));
  tx.add(createCloseAccountInstruction(tokenAccount, owner, owner, [], TOKEN_PROGRAM_ID));

  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;

  const signed = await wallet.signTransaction(tx);
  const txid = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(txid, 'confirmed');
  return txid;
}

export async function burnNFTs(wallet, nfts, onProgress) {
  const txids = [];

  for (let i = 0; i < nfts.length; i++) {
    const nft = nfts[i];
    try {
      if (nft.compressed) {
        await burnCNFT(wallet, nft);
      } else if (nft.interface === 'MplCoreAsset') {
        await burnCoreNFT(wallet, nft);
      } else {
        try {
          await burnLegacyNFT(wallet, nft);
        } catch {
          // Scam/non-standard NFT — fall back to raw SPL Token burn
          await burnRawTokenAccount(wallet, nft.id);
        }
      }
    } catch (err) {
      console.error(`Failed to burn NFT ${nft.id}:`, err);
      throw err;
    }
    txids.push(nft.id);
    onProgress?.((i + 1) / nfts.length);
  }

  return txids;
}
