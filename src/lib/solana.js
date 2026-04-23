import {
  Transaction,
  PublicKey,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  createCloseAccountInstruction,
  createBurnInstruction,
} from '@solana/spl-token';
import { getConnection } from './helius';

const PRIORITY_FEE_MICROLAMPORTS = 5000;
// Legacy Transaction size cap is 1232 bytes. Conservative batch caps leave
// headroom for signatures, blockhash, fee-payer, compute-budget ixs, and
// the extra account metas Token-2022 accounts can require.
const MAX_CLOSE_PER_TX = 12;
const MAX_BURN_CLOSE_PER_TX = 6;
const MAX_TX_BYTES = 1232;
// ~20k CU covers one close; ~35k covers burn+close. Cap at 1.4M total.
const CU_PER_CLOSE = 20_000;
const CU_PER_BURN_CLOSE = 35_000;
const CU_CEILING = 1_400_000;

function computeBudgetIxs(cuLimit) {
  return [
    ComputeBudgetProgram.setComputeUnitLimit({ units: Math.min(cuLimit, CU_CEILING) }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: PRIORITY_FEE_MICROLAMPORTS }),
  ];
}

// Build a tx, shrinking the batch until it fits under MAX_TX_BYTES.
// Returns { tx, used } where `used` is how many items from `batch` the tx covers.
function buildSizedTx({ batch, owner, blockhash, cuPerItem, addItems }) {
  let lo = 1;
  let hi = batch.length;
  let best = null;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const slice = batch.slice(0, mid);
    const tx = new Transaction().add(...computeBudgetIxs(cuPerItem * mid));
    addItems(tx, slice);
    tx.recentBlockhash = blockhash;
    tx.feePayer = owner;

    // serializeMessage() omits signatures (64 bytes * numSigners).
    // 1 signer (owner) = +64 bytes, plus 3 bytes for the signature count + padding.
    const size = tx.serializeMessage().length + 64 + 3;
    if (size <= MAX_TX_BYTES) {
      best = { tx, used: mid };
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (!best) throw new Error('Cannot fit even a single instruction in one tx');
  return best;
}

async function sendAndConfirm(connection, wallet, tx, { blockhash, lastValidBlockHeight }, label) {
  const signed = await wallet.signTransaction(tx);
  const txid = await connection.sendRawTransaction(signed.serialize());
  const conf = await connection.confirmTransaction(
    { signature: txid, blockhash, lastValidBlockHeight },
    'confirmed'
  );
  if (conf.value.err) throw new Error(`${label} failed: ${JSON.stringify(conf.value.err)}`);
  return txid;
}

export async function closeEmptyAccounts(wallet, accounts, onProgress) {
  const connection = getConnection();
  const owner = wallet.publicKey;
  const txids = [];

  let remaining = accounts.slice();
  const total = remaining.length;

  while (remaining.length > 0) {
    const batch = remaining.slice(0, MAX_CLOSE_PER_TX);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    const { tx, used } = buildSizedTx({
      batch,
      owner,
      blockhash,
      cuPerItem: CU_PER_CLOSE,
      addItems: (tx, items) => {
        for (const acc of items) {
          tx.add(createCloseAccountInstruction(
            new PublicKey(acc.address),
            owner,
            owner,
            [],
            new PublicKey(acc.programId)
          ));
        }
      },
    });

    const txid = await sendAndConfirm(connection, wallet, tx, { blockhash, lastValidBlockHeight }, 'Close');
    txids.push(txid);

    remaining = remaining.slice(used);
    onProgress?.((total - remaining.length) / total);
  }

  return txids;
}

export async function burnTokenAccounts(wallet, accounts, onProgress) {
  const connection = getConnection();
  const owner = wallet.publicKey;
  const txids = [];

  let remaining = accounts.slice();
  const total = remaining.length;

  while (remaining.length > 0) {
    const batch = remaining.slice(0, MAX_BURN_CLOSE_PER_TX);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

    const { tx, used } = buildSizedTx({
      batch,
      owner,
      blockhash,
      cuPerItem: CU_PER_BURN_CLOSE,
      addItems: (tx, items) => {
        for (const acc of items) {
          const programId = new PublicKey(acc.programId);
          const accPubkey = new PublicKey(acc.address);
          const mintPubkey = new PublicKey(acc.mint);
          tx.add(createBurnInstruction(accPubkey, mintPubkey, owner, acc.amount, [], programId));
          tx.add(createCloseAccountInstruction(accPubkey, owner, owner, [], programId));
        }
      },
    });

    const txid = await sendAndConfirm(connection, wallet, tx, { blockhash, lastValidBlockHeight }, 'Burn');
    txids.push(txid);

    remaining = remaining.slice(used);
    onProgress?.((total - remaining.length) / total);
  }

  return txids;
}
