import { VersionedTransaction } from '@solana/web3.js';
import { BASIS_MINT, JUPITER_QUOTE_API, JUPITER_SWAP_API } from '../config';
import { getConnection } from './helius';
import { sendRawWithRetry } from './send';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const DEV = import.meta.env.DEV;

export async function getQuote(lamports) {
  const params = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: BASIS_MINT,
    amount: String(lamports),
    slippageBps: '500',
  });

  const res = await fetch(`${JUPITER_QUOTE_API}?${params}`);
  const json = await res.json();
  if (DEV) console.log('[jupiter] quote response', json);
  if (!res.ok || json.error) throw new Error(json.error ?? 'Failed to get Jupiter quote');
  // Sanity: Jupiter must echo back our expected input/output mints
  if (json.inputMint !== SOL_MINT || json.outputMint !== BASIS_MINT) {
    throw new Error('Jupiter quote mint mismatch');
  }
  return json;
}

export async function swapSolForBasis(wallet, lamports) {
  const quote = await getQuote(lamports);

  const res = await fetch(JUPITER_SWAP_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });

  const swapJson = await res.json();
  if (DEV) console.log('[jupiter] swap response', swapJson);
  if (!res.ok || swapJson.error) {
    throw new Error(swapJson.error ?? 'Failed to get Jupiter swap transaction');
  }
  const { swapTransaction } = swapJson;

  const txBuffer = Buffer.from(swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuffer);

  // Validate fee payer matches the user — refuse to sign if Jupiter tries to
  // route fees through a different account. First static account key is the fee payer.
  const feePayer = tx.message.staticAccountKeys[0]?.toBase58();
  if (feePayer !== wallet.publicKey.toBase58()) {
    throw new Error(`Fee payer mismatch: tx wants ${feePayer}, wallet is ${wallet.publicKey.toBase58()}`);
  }

  const signed = await wallet.signTransaction(tx);

  const connection = getConnection();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const txid = await sendRawWithRetry(connection, signed.serialize());
  if (DEV) console.log('[jupiter] swap sent', txid);
  const confirmation = await connection.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, 'confirmed');
  if (confirmation.value.err) throw new Error(`Swap failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
  return txid;
}
