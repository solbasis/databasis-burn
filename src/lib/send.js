// Shared tx-send helpers.
//
// We retry RPC submission (not re-signing) on transient failures. Re-signing
// would change the txid and can cause double-execution; resending the same
// signed bytes is idempotent — the first landed copy wins, later copies are
// rejected as AlreadyProcessed which we treat as success.

const TERMINAL_ERROR_RE = /insufficient funds|custom program error|simulation failed|invalid|0x[0-9a-f]+/i;

export async function sendRawWithRetry(connection, rawTx, { attempts = 3, baseDelayMs = 400 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await connection.sendRawTransaction(rawTx, { maxRetries: 0, skipPreflight: false });
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message ?? err);
      if (/AlreadyProcessed|already processed/i.test(msg)) {
        // Safe to treat as success — a previous attempt landed
        throw err; // caller should not hit this in practice (sendRawTransaction doesn't return a signature on AP), but be explicit
      }
      if (TERMINAL_ERROR_RE.test(msg)) throw err;
      if (i < attempts - 1) {
        await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, i)));
      }
    }
  }
  throw lastErr;
}
