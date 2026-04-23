import { useState, useCallback } from 'react';
import { closeEmptyAccounts, burnTokenAccounts } from '../lib/solana';
import { burnNFTs } from '../lib/burnNFTs';
import { swapSolForBasis } from '../lib/jupiter';
import { getConnection } from '../lib/helius';
import { SOL_PER_LAMPORT } from '../config';

export function useBurn() {
  const [status, setStatus] = useState({
    running: false,
    step: null,
    progress: 0,
    done: false,
    error: null,
    recoveredLamports: 0,
    txids: [],
  });

  const execute = useCallback(async ({
    wallet,
    selectedEmpty,
    selectedTokens,
    selectedNFTs,
    autoBuy,
  }) => {
    setStatus({ running: true, step: 'preparing', progress: 0, done: false, error: null, recoveredLamports: 0, txids: [] });

    const allTxids = [];
    let totalRentLamports = 0;

    try {
      const connection = getConnection();
      const balanceBefore = await connection.getBalance(wallet.publicKey);

      if (selectedEmpty.length > 0) {
        setStatus(s => ({ ...s, step: 'closing', progress: 0 }));
        const txids = await closeEmptyAccounts(wallet, selectedEmpty, p =>
          setStatus(s => ({ ...s, progress: p }))
        );
        allTxids.push(...txids);
        totalRentLamports += selectedEmpty.reduce((sum, a) => sum + a.rentLamports, 0);
      }

      if (selectedTokens.length > 0) {
        setStatus(s => ({ ...s, step: 'burning-tokens', progress: 0 }));
        const txids = await burnTokenAccounts(wallet, selectedTokens, p =>
          setStatus(s => ({ ...s, progress: p }))
        );
        allTxids.push(...txids);
        totalRentLamports += selectedTokens.reduce((sum, a) => sum + a.rentLamports, 0);
      }

      if (selectedNFTs.length > 0) {
        setStatus(s => ({ ...s, step: 'burning-nfts', progress: 0 }));
        await burnNFTs(wallet, selectedNFTs, p =>
          setStatus(s => ({ ...s, progress: p }))
        );
      }

      const balanceAfter = await connection.getBalance(wallet.publicKey);
      const recoveredLamports = Math.max(0, balanceAfter - balanceBefore + 5000);

      if (autoBuy && recoveredLamports > 10_000_000) {
        setStatus(s => ({ ...s, step: 'buying-basis', progress: 0 }));
        const txid = await swapSolForBasis(wallet, recoveredLamports);
        allTxids.push(txid);
      }

      setStatus({
        running: false,
        step: null,
        progress: 1,
        done: true,
        error: null,
        recoveredLamports: totalRentLamports,
        txids: allTxids,
      });
    } catch (err) {
      setStatus(s => ({ ...s, running: false, error: err.message }));
    }
  }, []);

  const reset = useCallback(() => {
    setStatus({ running: false, step: null, progress: 0, done: false, error: null, recoveredLamports: 0, txids: [] });
  }, []);

  return { ...status, execute, reset };
}
