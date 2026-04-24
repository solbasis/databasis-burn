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
import { fetchMerkleTree } from '@metaplex-foundation/spl-account-compression';
import { publicKey } from '@metaplex-foundation/umi';
import { getAssetProof } from './helius';
import {
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
import { sendRawWithRetry } from './send';

function makeUmi(wallet) {
  return createUmi(RPC_URL)
    .use(mplCore())
    .use(mplTokenMetadata())
    .use(mplBubblegum())
    .use(walletAdapterIdentity(wallet));
}

// Turn whatever weird shape an RPC/Umi/web3js error arrives in into a string
// a human can act on. Umi's sendAndConfirm often wraps errors multiple layers
// deep with a `.cause` chain; SendTransactionError keeps the real reason in
// transaction `logs`. Plain `err?.message ?? String(err)` yields
// "[object Object]" for those — useless in the UI.
function describeError(err) {
  if (err == null) return 'Unknown error';
  if (typeof err === 'string') return err;

  const parts = [];
  const seen = new Set();
  let e = err;
  while (e && typeof e === 'object' && !seen.has(e)) {
    seen.add(e);
    if (typeof e.message === 'string' && e.message) {
      parts.push(e.message);
    } else {
      try {
        const s = JSON.stringify(e);
        if (s && s !== '{}') parts.push(s);
      } catch { /* circular or non-serialisable — skip */ }
    }
    e = e.cause;
  }

  // Bubblegum's real failure reason is almost always in the transaction logs
  // (e.g. "ConcurrentMerkleTreeError" / "0x1771"). Surface them if present.
  const logs = err.logs ?? err.cause?.logs ?? err.transactionLogs;
  if (Array.isArray(logs) && logs.length > 0) {
    const relevant = logs.filter(l => /error|failed|0x[0-9a-f]+/i.test(l)).slice(0, 2);
    if (relevant.length > 0) parts.push(`logs: ${relevant.join(' | ')}`);
  }

  return parts.join(' → ') || String(err);
}

// canopyDepth is a static property of each Merkle tree — it doesn't change
// between cNFT burns on the same tree. Cache per-batch so 50 scam cNFTs from
// one tree don't cost 50 account fetches.
async function getCanopyDepth(umi, treeAddress, cache) {
  if (cache.has(treeAddress)) return cache.get(treeAddress);
  const tree = await fetchMerkleTree(umi, publicKey(treeAddress));
  // Formula from Metaplex's getAssetWithProof: canopy nodes stored on-chain
  // form a subtree of depth canopyDepth rooted at the real root's descendants.
  // length = 2^(canopyDepth+1) - 2, so canopyDepth = log2(length+2) - 1.
  const canopyDepth = Math.log2(tree.canopy.length + 2) - 1;
  cache.set(treeAddress, canopyDepth);
  return canopyDepth;
}

// Two failure modes we need to survive on scam-cNFT trees (e.g. the $GIFT
// airdrop spam) and the corresponding mitigations:
//
// 1. **Canopy truncation (the main bug)**: Bubblegum's on-chain program reads
//    the top `canopyDepth` proof nodes from the tree account itself and
//    expects the caller to send ONLY the remaining (bottom) nodes as remaining
//    accounts. Helius `getAssetProof` returns the FULL proof. If we forward
//    it verbatim the program sees too many siblings, recomputes a different
//    root, and fails with 0x1771 (ConcurrentMerkleTreeError / Invalid root).
//    This is exactly what sol-incinerator does right and naive burns do
//    wrong. Fix: fetch tree, compute canopyDepth, slice(0, -canopyDepth).
//
// 2. **Stale-proof race**: concurrent activity on a busy tree between our
//    proof fetch and the RPC's preflight simulation invalidates the proof.
//    Mitigated by skipPreflight (on-chain tolerates more proof staleness than
//    the literal simulator) + retry on 0x1771 with a fresh proof.
const CNFT_ATTEMPTS = 4;

export async function burnCNFT(umi, wallet, nft, canopyCache) {
  const { tree, dataHash, creatorHash, leafId } = nft.compression;
  if (!tree || !dataHash || !creatorHash || leafId == null) {
    throw new Error('cNFT missing compression metadata');
  }

  // All 32-byte hashes are base58-encoded — reuse PublicKey.toBytes() for decoding
  const toBytes32 = (b58) => Array.from(new PublicKey(b58).toBytes());
  const canopyDepth = await getCanopyDepth(umi, tree, canopyCache);

  const attempt = async () => {
    const proof = await getAssetProof(nft.id);
    if (!proof?.root || !Array.isArray(proof?.proof)) {
      throw new Error('Invalid Merkle proof from Helius');
    }
    const truncatedProof = canopyDepth > 0
      ? proof.proof.slice(0, -canopyDepth)
      : proof.proof;
    await burnCompressed(umi, {
      leafOwner:   publicKey(wallet.publicKey.toBase58()),
      merkleTree:  publicKey(tree),
      root:        toBytes32(proof.root),
      dataHash:    toBytes32(dataHash),
      creatorHash: toBytes32(creatorHash),
      nonce:       leafId,
      index:       leafId,
      proof:       truncatedProof.map(p => publicKey(p)),
    }).sendAndConfirm(umi, { send: { skipPreflight: true } });
  };

  let lastErr;
  for (let i = 0; i < CNFT_ATTEMPTS; i++) {
    try {
      await attempt();
      return;
    } catch (err) {
      lastErr = err;
      const msg = describeError(err);
      // Only retry if the failure looks like a stale-proof race. Anything else
      // (bad metadata, wrong owner, etc.) won't benefit from retrying.
      if (!/0x1771|ConcurrentMerkleTreeError|Invalid root|PublicKeyMismatch/i.test(msg)) {
        throw err;
      }
      // Brief backoff so a fresh getAssetProof sees a stable tree.
      if (i < CNFT_ATTEMPTS - 1) await new Promise(r => setTimeout(r, 400));
    }
  }
  throw lastErr;
}

export async function burnCoreNFT(umi, nft) {
  await burnCoreV1(umi, {
    asset: publicKey(nft.id),
    ...(nft.collection ? { collection: publicKey(nft.collection) } : {}),
  }).sendAndConfirm(umi);
}

export async function burnLegacyNFT(umi, nft) {
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
  const txid = await sendRawWithRetry(connection, signed.serialize());
  const conf = await connection.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, 'confirmed');
  if (conf.value.err) throw new Error(`Raw burn failed: ${JSON.stringify(conf.value.err)}`);
  return txid;
}

// Returns { txids: <successful asset ids>, failures: [{ id, name, error }] }.
// Does NOT throw on per-NFT failure — collects and continues so one bad NFT
// doesn't abort the whole batch and lose successful results.
export async function burnNFTs(wallet, nfts, onProgress) {
  const txids = [];
  const failures = [];

  // One Umi instance per batch (each construction spins up an RPC client and
  // loads multiple plugins — not cheap to redo per NFT).
  const umi = makeUmi(wallet);
  // Shared canopy cache — a batch of scam cNFTs usually originates from one
  // or two trees, so we only pay for the fetchMerkleTree call once per tree.
  const canopyCache = new Map();

  for (let i = 0; i < nfts.length; i++) {
    const nft = nfts[i];
    try {
      if (nft.compressed) {
        await burnCNFT(umi, wallet, nft, canopyCache);
      } else if (nft.interface === 'MplCoreAsset') {
        await burnCoreNFT(umi, nft);
      } else {
        try {
          await burnLegacyNFT(umi, nft);
        } catch (inner) {
          // Scam/non-standard NFT — try raw SPL Token burn fallback.
          // If that also fails, surface the fallback's error (more actionable
          // than Metaplex's generic "missing metadata").
          try {
            await burnRawTokenAccount(wallet, nft.id);
          } catch (fallbackErr) {
            throw fallbackErr ?? inner;
          }
        }
      }
      txids.push(nft.id);
    } catch (err) {
      console.error(`Failed to burn NFT ${nft.id}:`, err);
      failures.push({
        id: nft.id,
        name: nft.name ?? 'Unknown',
        error: describeError(err),
      });
    }
    onProgress?.((i + 1) / nfts.length);
  }

  return { txids, failures };
}
