import { useState, useCallback, useRef } from 'react';
import { closeEmptyAccounts, burnTokenAccounts } from '../lib/solana';
import { burnNFTs } from '../lib/burnNFTs';
import { getQuote, executeSwap } from '../lib/jupiter';
import { getConnection } from '../lib/helius';
import { BASIS_DECIMALS } from '../config';

export function useBurn() {
  const [status, setStatus] = useState({
    running: false,
    step: null,
    progress: 0,
    done: false,
    error: null,
    recoveredLamports: 0,
    txids: [],
    failures: [],
    // When set, UI shows a swap-confirm screen instead of the progress bar.
    // Shape: { inLamports, outUi, minUi } — UI-ready numbers only; the raw
    // quote stays scoped to execute() so we can't accidentally render it.
    pendingSwap: null,
  });

  // Resolver for the user's swap-confirm decision. Stashed on a ref so
  // execute() can `await` a Promise while confirmSwap/skipSwap resolve it
  // from separate React callbacks.
  const swapDecisionRef = useRef(null);

  const execute = useCallback(async ({
    wallet,
    selectedEmpty,
    selectedTokens,
    selectedNFTs,
    selectedCNFTs = [],
    autoBuy,
  }) => {
    setStatus({ running: true, step: 'preparing', progress: 0, done: false, error: null, recoveredLamports: 0, txids: [], failures: [], pendingSwap: null });

    // Live progress state — committed incrementally so that on error the UI
    // still shows what did succeed.
    const allTxids = [];
    const allFailures = [];
    let totalRentLamports = 0;

    const commit = (patch) => setStatus(s => ({
      ...s,
      ...patch,
      txids: [...allTxids],
      failures: [...allFailures],
    }));

    try {
      const connection = getConnection();
      const balanceBefore = await connection.getBalance(wallet.publicKey);

      if (selectedEmpty.length > 0) {
        commit({ step: 'closing', progress: 0 });
        const txids = await closeEmptyAccounts(wallet, selectedEmpty, p =>
          setStatus(s => ({ ...s, progress: p }))
        );
        allTxids.push(...txids);
        totalRentLamports += selectedEmpty.reduce((sum, a) => sum + a.rentLamports, 0);
      }

      if (selectedTokens.length > 0) {
        commit({ step: 'burning-tokens', progress: 0 });
        const txids = await burnTokenAccounts(wallet, selectedTokens, p =>
          setStatus(s => ({ ...s, progress: p }))
        );
        allTxids.push(...txids);
        totalRentLamports += selectedTokens.reduce((sum, a) => sum + a.rentLamports, 0);
      }

      if (selectedNFTs.length > 0) {
        commit({ step: 'burning-nfts', progress: 0 });
        const { txids, failures } = await burnNFTs(wallet, selectedNFTs, p =>
          setStatus(s => ({ ...s, progress: p }))
        );
        allTxids.push(...txids);
        allFailures.push(...failures);
      }

      if (selectedCNFTs.length > 0) {
        commit({ step: 'burning-cnfts', progress: 0 });
        const { txids, failures } = await burnNFTs(wallet, selectedCNFTs, p =>
          setStatus(s => ({ ...s, progress: p }))
        );
        allTxids.push(...txids);
        allFailures.push(...failures);
      }

      const balanceAfter = await connection.getBalance(wallet.publicKey);
      const recoveredLamports = Math.max(0, balanceAfter - balanceBefore);

      // Swap size is computed from known rent (selected items), NOT balance delta,
      // so unrelated inbound transfers during the burn don't get swept into Jupiter.
      // Subtract a safety buffer for the swap tx fee + WSOL/BASIS ATA rent.
      const SWAP_FEE_BUFFER_LAMPORTS = 5_000_000; // ~0.005 SOL
      const swapLamports = Math.max(0, totalRentLamports - SWAP_FEE_BUFFER_LAMPORTS);

      if (autoBuy && swapLamports > 0) {
        // Two-phase: fetch quote → show preview → user approves → execute.
        // A failed quote/swap shouldn't void the whole burn (rent is recovered
        // already), so we wrap the whole phase and push a failure on any throw.
        commit({ step: 'quoting-swap', progress: 0 });
        try {
          const quote = await getQuote(swapLamports);
          const outUi = Number(quote.outAmount) / 10 ** BASIS_DECIMALS;
          const minUi = Number(quote.otherAmountThreshold) / 10 ** BASIS_DECIMALS;

          setStatus(s => ({
            ...s,
            step: 'awaiting-swap',
            pendingSwap: { inLamports: swapLamports, outUi, minUi },
          }));

          const approved = await new Promise(resolve => {
            swapDecisionRef.current = resolve;
          });
          swapDecisionRef.current = null;

          // Clear the preview so BurnModal returns to the progress UI.
          setStatus(s => ({ ...s, pendingSwap: null }));

          if (approved) {
            commit({ step: 'buying-basis', progress: 0 });
            const txid = await executeSwap(wallet, quote);
            allTxids.push(txid);
          }
          // Skip: user saw the preview and declined — fall through silently.
        } catch (swapErr) {
          allFailures.push({
            id: 'auto-buy',
            name: 'Auto-buy $BASIS',
            error: swapErr?.message ?? String(swapErr),
          });
        }
      }

      setStatus({
        running: false,
        step: null,
        progress: 1,
        done: true,
        error: null,
        recoveredLamports,
        txids: [...allTxids],
        failures: [...allFailures],
        pendingSwap: null,
      });
    } catch (err) {
      // Preserve partial progress (txids + failures) so the modal can show
      // "3 of 5 succeeded, then error X" instead of wiping the results.
      setStatus(s => ({
        ...s,
        running: false,
        pendingSwap: null,
        error: err?.message ?? String(err),
        txids: [...allTxids],
        failures: [...allFailures],
      }));
    }
  }, []);

  const confirmSwap = useCallback(() => {
    swapDecisionRef.current?.(true);
  }, []);

  const skipSwap = useCallback(() => {
    swapDecisionRef.current?.(false);
  }, []);

  const reset = useCallback(() => {
    // Defensive: if the user somehow dismisses while awaiting a swap decision
    // (shouldn't be reachable via UI, but keeps execute() from hanging forever),
    // resolve as "skip" so the finalize path runs.
    if (swapDecisionRef.current) {
      swapDecisionRef.current(false);
      swapDecisionRef.current = null;
    }
    setStatus({ running: false, step: null, progress: 0, done: false, error: null, recoveredLamports: 0, txids: [], failures: [], pendingSwap: null });
  }, []);

  return { ...status, execute, reset, confirmSwap, skipSwap };
}
