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
  getMint,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
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
  const { tree, dataHash, creatorHash, leafId } = nft.compression;
  if (!tree || !dataHash || !creatorHash || leafId == null) {
    throw new Error('cNFT missing compression metadata');
  }

  // All 32-byte hashes are base58-encoded — reuse PublicKey.toBytes() for decoding
  const toBytes32 = (b58) => Array.from(new PublicKey(b58).toBytes());

  const attempt = async () => {
    const proof = await getAssetProof(nft.id);
    if (!proof?.root || !Array.isArray(proof?.proof)) {
      throw new Error('Invalid Merkle proof from Helius');
    }
    await burnCompressed(umi, {
      leafOwner:   publicKey(wallet.publicKey.toBase58()),
      merkleTree:  publicKey(tree),
      root:        toBytes32(proof.root),
      dataHash:    toBytes32(dataHash),
      creatorHash: toBytes32(creatorHash),
      nonce:       leafId,
      index:       leafId,
      proof:       proof.proof.map(p => publicKey(p)),
    }).sendAndConfirm(umi);
  };

  try {
    await attempt();
  } catch (err) {
    const msg = String(err?.message ?? err);
    // ConcurrentMerkleTreeError (0x1771 / 6001) => proof is stale, refetch + retry once
    if (/0x1771|ConcurrentMerkleTreeError|Invalid root/i.test(msg)) {
      await attempt();
    } else {
      throw err;
    }
  }
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

// Fallback for scam/non-standard NFTs with no valid Metaplex metadata.
// Defensive: verify this really is an NFT-shaped asset before burning.
async function burnRawTokenAccount(wallet, mintAddress) {
  const connection = getConnection();
  const owner = wallet.publicKey;
  const mint = new PublicKey(mintAddress);

  // 1) Find the user's token account(s) for this mint. Query both token programs.
  let accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint, programId: TOKEN_PROGRAM_ID });
  let programId = TOKEN_PROGRAM_ID;
  if (accounts.value.length === 0) {
    accounts = await connection.getParsedTokenAccountsByOwner(owner, { mint, programId: TOKEN_2022_PROGRAM_ID });
    programId = TOKEN_2022_PROGRAM_ID;
  }
  if (accounts.value.length === 0) throw new Error('No token account found for this NFT');

  // 2) Pick the first account with a positive balance.
  const match = accounts.value.find(a => {
    const amt = a.account.data?.parsed?.info?.tokenAmount?.amount;
    return amt && BigInt(amt) > 0n;
  });
  if (!match) throw new Error('All token accounts for this mint are empty');

  const info = match.account.data.parsed.info;
  const balance = BigInt(info.tokenAmount.amount);
  const decimals = info.tokenAmount.decimals;

  // 3) Verify NFT shape via mint: decimals=0 AND supply=1 (standard NFT invariants).
  //    Refuse to burn arbitrary fungibles through this path.
  const mintInfo = await getMint(connection, mint, 'confirmed', programId);
  if (mintInfo.decimals !== 0 || decimals !== 0) {
    throw new Error('Refusing raw-burn: token is not decimals=0');
  }
  if (mintInfo.supply !== 1n) {
    throw new Error(`Refusing raw-burn: mint supply is ${mintInfo.supply}, not 1`);
  }

  const tokenAccount = match.pubkey;
  const tx = new Transaction();
  tx.add(createBurnInstruction(tokenAccount, mint, owner, balance, [], programId));
  tx.add(createCloseAccountInstruction(tokenAccount, owner, owner, [], programId));

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = owner;

  const signed = await wallet.signTransaction(tx);
  const txid = await connection.sendRawTransaction(signed.serialize());
  const conf = await connection.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, 'confirmed');
  if (conf.value.err) throw new Error(`Raw burn failed: ${JSON.stringify(conf.value.err)}`);
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
