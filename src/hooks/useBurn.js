import { useState, useCallback } from 'react';
import { closeEmptyAccounts, burnTokenAccounts } from '../lib/solana';
import { burnNFTs } from '../lib/burnNFTs';
import { getConnection } from '../lib/helius';

// Track what the user asked us to burn, per category, so the modal can phrase
// its result correctly: cNFT-only runs don't recover rent and shouldn't be
// labelled "recovered X SOL".
const EMPTY_COUNTS = { empty: 0, tokens: 0, nfts: 0, cnfts: 0 };

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
    attempted: EMPTY_COUNTS,
  });

  const execute = useCallback(async ({
    wallet,
    selectedEmpty,
    selectedTokens,
    selectedNFTs,
    selectedCNFTs = [],
  }) => {
    const attempted = {
      empty:  selectedEmpty.length,
      tokens: selectedTokens.length,
      nfts:   selectedNFTs.length,
      cnfts:  selectedCNFTs.length,
    };
    setStatus({ running: true, step: 'preparing', progress: 0, done: false, error: null, recoveredLamports: 0, txids: [], failures: [], attempted });

    // Live progress state — committed incrementally so that on error the UI
    // still shows what did succeed.
    const allTxids = [];
    const allFailures = [];

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
      }

      if (selectedTokens.length > 0) {
        commit({ step: 'burning-tokens', progress: 0 });
        const txids = await burnTokenAccounts(wallet, selectedTokens, p =>
          setStatus(s => ({ ...s, progress: p }))
        );
        allTxids.push(...txids);
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
        // Tag cNFT failures so the modal can split per-category counts.
        allFailures.push(...failures.map(f => ({ ...f, type: 'cnft' })));
      }

      const balanceAfter = await connection.getBalance(wallet.publicKey);
      const recoveredLamports = Math.max(0, balanceAfter - balanceBefore);

      setStatus({
        running: false,
        step: null,
        progress: 1,
        done: true,
        error: null,
        recoveredLamports,
        txids: [...allTxids],
        failures: [...allFailures],
        attempted,
      });
    } catch (err) {
      // Preserve partial progress (txids + failures) so the modal can show
      // "3 of 5 succeeded, then error X" instead of wiping the results.
      setStatus(s => ({
        ...s,
        running: false,
        error: err?.message ?? String(err),
        txids: [...allTxids],
        failures: [...allFailures],
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setStatus({ running: false, step: null, progress: 0, done: false, error: null, recoveredLamports: 0, txids: [], failures: [], attempted: EMPTY_COUNTS });
  }, []);

  return { ...status, execute, reset };
}
