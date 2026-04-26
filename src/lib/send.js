// Shared tx-send helpers.
//
// We retry RPC submission (not re-signing) on transient failures. Re-signing
// would change the txid and can cause double-execution; resending the same
// signed bytes is idempotent — the first landed copy wins, later copies are
// rejected as AlreadyProcessed which we treat as success.
//
// AlreadyProcessed handling:
//   The first signature of a signed tx IS the canonical txid (Solana convention).
//   When a retry sees AlreadyProcessed, the original send already landed and
//   has been included in a block — we return that signature so the caller
//   can confirm against it. Returning here (instead of throwing) prevents a
//   class of UX bugs where a real successful burn surfaces as an error.

import bs58 from 'bs58';

const TERMINAL_ERROR_RE = /insufficient funds|custom program error|simulation failed|invalid|0x[0-9a-f]+/i;
const ALREADY_PROCESSED_RE = /AlreadyProcessed|already processed|already been processed/i;

// Extract the canonical signature (== txid) from signed bytes. Layout:
//   [compact-u16 numSigs][sig_0 (64B)][sig_1 (64B)]…[message]
// For our single-signer case (fee payer is sole signer), numSigs = 1
// encoded as one byte 0x01, followed by the 64-byte signature at offset 1.
//
// We compute this from the *raw signed bytes* rather than asking the
// Transaction object so we don't assume a specific web3.js version's getter.
export function txidFromSignedBytes(rawTx) {
  if (!rawTx || rawTx.length < 65) {
    throw new Error('Cannot read signature: signed tx is too short');
  }
  // First byte is the compact-u16 numSigs (0x01 for our one-signer case).
  // Defensive: if the wallet ever produced multi-sig, the txid is still the
  // first signature — slice 1..65 regardless.
  const sig = rawTx.slice(1, 65);
  return bs58.encode(sig);
}

export async function sendRawWithRetry(connection, rawTx, { attempts = 3, baseDelayMs = 400 } = {}) {
  // Pre-compute the canonical txid so we can return it on AlreadyProcessed
  // (RPC throws on AP and never returns a signature, so we have to know it).
  const expectedSig = txidFromSignedBytes(rawTx);

  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await connection.sendRawTransaction(rawTx, { maxRetries: 0, skipPreflight: false });
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message ?? err);

      if (ALREADY_PROCESSED_RE.test(msg)) {
        // Original send already landed on a previous attempt (or somewhere
        // upstream of our retry loop). The signed bytes have a stable txid;
        // return it so the caller can confirmTransaction. Any caller that
        // *does* find a real on-chain failure for this sig will get it from
        // confirmTransaction's err result, not from us.
        return expectedSig;
      }

      if (TERMINAL_ERROR_RE.test(msg)) throw err;

      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, i)));
      }
    }
  }
  throw lastErr;
}
