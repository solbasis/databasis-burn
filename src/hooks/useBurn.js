import { useState, useCallback } from 'react';
import { closeEmptyAccounts, burnTokenAccounts } from '../lib/solana';
import { burnNFTs } from '../lib/burnNFTs';
import { swapSolForBasis } from '../lib/jupiter';
import { getConnection } from '../lib/helius';

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
  });

  const execute = useCallback(async ({
    wallet,
    selectedEmpty,
    selectedTokens,
    selectedNFTs,
    selectedCNFTs = [],
    autoBuy,
  }) => {
    setStatus({ running: true, step: 'preparing', progress: 0, done: false, error: null, recoveredLamports: 0, txids: [], failures: [] });

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
        commit({ step: 'buying-basis', progress: 0 });
        try {
          const txid = await swapSolForBasis(wallet, swapLamports);
          allTxids.push(txid);
        } catch (swapErr) {
          // Swap failure shouldn't void the whole burn — rent is already recovered.
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
    setStatus({ running: false, step: null, progress: 0, done: false, error: null, recoveredLamports: 0, txids: [], failures: [] });
  }, []);

  return { ...status, execute, reset };
}
