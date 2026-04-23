import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { burnV1 as burnCoreV1, mplCore } from '@metaplex-foundation/mpl-core';
import {
  burnV1 as burnMetadataV1,
  findMetadataPda,
  mplTokenMetadata,
  TokenStandard,
} from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi';
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
    .use(walletAdapterIdentity(wallet));
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
      if (nft.interface === 'MplCoreAsset') {
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
