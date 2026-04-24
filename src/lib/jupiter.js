import { VersionedTransaction } from '@solana/web3.js';
import { BASIS_MINT, JUPITER_ULTRA_API } from '../config';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const DEV = import.meta.env.DEV;

// Jupiter Ultra bakes the taker into the transaction at quote time, so unlike
// the old swap/v1 flow we must know the user's pubkey before fetching the quote.
export async function getQuote(lamports, takerBase58) {
  const params = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: BASIS_MINT,
    amount: String(lamports),
    taker: takerBase58,
    slippageBps: '500',
  });

  const res = await fetch(`${JUPITER_ULTRA_API}/order?${params}`);
  const json = await res.json();
  if (DEV) console.log('[jupiter] order response', json);
  if (!res.ok || json.error) {
    throw new Error(json.error ?? `Jupiter Ultra order failed: HTTP ${res.status}`);
  }
  // Sanity: Jupiter must echo back our expected input/output mints
  if (json.inputMint !== SOL_MINT || json.outputMint !== BASIS_MINT) {
    throw new Error('Jupiter order mint mismatch');
  }
  if (!json.transaction || !json.requestId) {
    throw new Error('Jupiter order missing transaction or requestId');
  }
  return json;
}

// Execute an already-quoted swap. Ultra built the transaction; we sign and
// hand it back via /execute — Jupiter relays it, waits for landing, and
// returns the signature. No local sendRaw/confirm loop needed.
export async function executeSwap(wallet, quote) {
  const txBuffer = Buffer.from(quote.transaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuffer);

  // Validate fee payer matches the user — refuse to sign if Jupiter tries to
  // route fees through a different account. First static account key is the fee payer.
  const feePayer = tx.message.staticAccountKeys[0]?.toBase58();
  if (feePayer !== wallet.publicKey.toBase58()) {
    throw new Error(`Fee payer mismatch: tx wants ${feePayer}, wallet is ${wallet.publicKey.toBase58()}`);
  }

  const signed = await wallet.signTransaction(tx);
  const signedB64 = Buffer.from(signed.serialize()).toString('base64');

  const res = await fetch(`${JUPITER_ULTRA_API}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      signedTransaction: signedB64,
      requestId: quote.requestId,
    }),
  });
  const json = await res.json();
  if (DEV) console.log('[jupiter] execute response', json);

  // Ultra signals failure three different ways — HTTP non-2xx, status=Failed,
  // or an `error` field. Handle all three and surface the most informative message.
  if (!res.ok || json.status === 'Failed' || json.error) {
    const msg =
      json.error ??
      json.errorMessage ??
      (json.code != null ? `code ${json.code}` : null) ??
      `HTTP ${res.status}`;
    throw new Error(`Jupiter Ultra execute failed: ${msg}`);
  }
  if (!json.signature) {
    throw new Error('Jupiter Ultra execute returned no signature');
  }
  return json.signature;
}
