import { useState, useCallback } from 'react';
import { closeEmptyAccounts, burnTokenAccounts } from '../lib/solana';
import { burnNFTs } from '../lib/burnNFTs';
import { getConnection } from '../lib/helius';
import { recordRecovery } from '../lib/recoveryStats';
import { recordUserBurn } from '../lib/userStats';

// Track what the user asked us to burn, per category, so the modal can phrase
// its result correctly: cNFT-only runs don't recover rent and shouldn't be
// labelled "recovered X SOL".
const EMPTY_COUNTS = { empty: 0, tokens: 0, nfts: 0, cnfts: 0 };
// Separately from `txids` (which the modal renders as solscan links), we also
// need the actual asset addresses / ids that landed, so the UI can strip them
// from the scan state immediately without waiting for DAS to re-index.
const EMPTY_SUCCEEDED = { empty: [], tokens: [], nfts: [], cnfts: [] };

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
    succeeded: EMPTY_SUCCEEDED,
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
    setStatus({ running: true, step: 'preparing', progress: 0, done: false, error: null, recoveredLamports: 0, txids: [], failures: [], attempted, succeeded: EMPTY_SUCCEEDED });

    // Live progress state — committed incrementally so that on error the UI
    // still shows what did succeed.
    const allTxids = [];
    const allFailures = [];
    // Per-category asset-id accumulation (distinct from allTxids, which mixes
    // blockchain tx sigs for empty/tokens with asset ids for NFTs/cNFTs). Used
    // by the UI to prune scan state optimistically post-burn.
    const succeeded = { empty: [], tokens: [], nfts: [], cnfts: [] };

    const commit = (patch) => setStatus(s => ({
      ...s,
      ...patch,
      txids: [...allTxids],
      failures: [...allFailures],
      succeeded: { ...succeeded },
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
        // closeEmptyAccounts throws on any batch failure, so reaching here
        // means every selected account landed — record all as succeeded.
        succeeded.empty = selectedEmpty.map(a => a.address);
      }

      if (selectedTokens.length > 0) {
        commit({ step: 'burning-tokens', progress: 0 });
        const txids = await burnTokenAccounts(wallet, selectedTokens, p =>
          setStatus(s => ({ ...s, progress: p }))
        );
        allTxids.push(...txids);
        succeeded.tokens = selectedTokens.map(a => a.address);
      }

      if (selectedNFTs.length > 0) {
        commit({ step: 'burning-nfts', progress: 0 });
        const { txids, failures } = await burnNFTs(wallet, selectedNFTs, p =>
          setStatus(s => ({ ...s, progress: p }))
        );
        allTxids.push(...txids);
        allFailures.push(...failures);
        // burnNFTs.txids is the list of asset ids that burned successfully.
        succeeded.nfts = [...txids];
      }

      if (selectedCNFTs.length > 0) {
        commit({ step: 'burning-cnfts', progress: 0 });
        const { txids, failures } = await burnNFTs(wallet, selectedCNFTs, p =>
          setStatus(s => ({ ...s, progress: p }))
        );
        allTxids.push(...txids);
        // Tag cNFT failures so the modal can split per-category counts.
        allFailures.push(...failures.map(f => ({ ...f, type: 'cnft' })));
        succeeded.cnfts = [...txids];
      }

      const balanceAfter = await connection.getBalance(wallet.publicKey);
      const recoveredLamports = Math.max(0, balanceAfter - balanceBefore);

      // Fire-and-forget — the on-chain burn has already succeeded, so a
      // stats-write hiccup should never surface in the UI. Both writers
      // swallow their own errors. Only contribute if we actually recovered
      // SOL (e.g. cNFT-only runs don't and shouldn't bump the counter).
      if (recoveredLamports > 0) {
        void recordRecovery(recoveredLamports);
        recordUserBurn(wallet.publicKey.toBase58(), recoveredLamports);
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
        attempted,
        succeeded: { ...succeeded },
      });
    } catch (err) {
      // Preserve partial progress (txids + failures + succeeded) so the modal
      // can show "3 of 5 succeeded, then error X" and the UI can still prune
      // the partial wins from the scan state.
      setStatus(s => ({
        ...s,
        running: false,
        error: err?.message ?? String(err),
        txids: [...allTxids],
        failures: [...allFailures],
        succeeded: { ...succeeded },
      }));
    }
  }, []);

  const reset = useCallback(() => {
    setStatus({ running: false, step: null, progress: 0, done: false, error: null, recoveredLamports: 0, txids: [], failures: [], attempted: EMPTY_COUNTS, succeeded: EMPTY_SUCCEEDED });
  }, []);

  return { ...status, execute, reset };
}
