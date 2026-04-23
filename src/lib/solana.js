import {
  Transaction,
  PublicKey,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import {
  createCloseAccountInstruction,
  createBurnInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { getConnection } from './helius';

const PRIORITY_FEE_MICROLAMPORTS = 5000;
const MAX_INSTRUCTIONS_PER_TX = 20;

function priorityIx() {
  return ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: PRIORITY_FEE_MICROLAMPORTS,
  });
}

export async function closeEmptyAccounts(wallet, accounts, onProgress) {
  const connection = getConnection();
  const owner = wallet.publicKey;
  const txids = [];

  const batches = chunk(accounts, MAX_INSTRUCTIONS_PER_TX);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const tx = new Transaction().add(priorityIx());

    for (const acc of batch) {
      const programId = new PublicKey(acc.programId);
      tx.add(
        createCloseAccountInstruction(
          new PublicKey(acc.address),
          owner,
          owner,
          [],
          programId
        )
      );
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = owner;

    const signed = await wallet.signTransaction(tx);
    const txid = await connection.sendRawTransaction(signed.serialize());
    const conf = await connection.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, 'confirmed');
    if (conf.value.err) throw new Error(`Close tx failed: ${JSON.stringify(conf.value.err)}`);
    txids.push(txid);

    onProgress?.((i + 1) / batches.length);
  }

  return txids;
}

export async function burnTokenAccounts(wallet, accounts, onProgress) {
  const connection = getConnection();
  const owner = wallet.publicKey;
  const txids = [];

  const batches = chunk(accounts, 10);

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const tx = new Transaction().add(priorityIx());

    for (const acc of batch) {
      const programId = new PublicKey(acc.programId);
      const accPubkey = new PublicKey(acc.address);
      const mintPubkey = new PublicKey(acc.mint);

      tx.add(
        createBurnInstruction(accPubkey, mintPubkey, owner, acc.amount, [], programId)
      );
      tx.add(
        createCloseAccountInstruction(accPubkey, owner, owner, [], programId)
      );
    }

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = owner;

    const signed = await wallet.signTransaction(tx);
    const txid = await connection.sendRawTransaction(signed.serialize());
    const conf = await connection.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, 'confirmed');
    if (conf.value.err) throw new Error(`Burn tx failed: ${JSON.stringify(conf.value.err)}`);
    txids.push(txid);

    onProgress?.((i + 1) / batches.length);
  }

  return txids;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
