import { useEffect, useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { getConnection } from '../lib/helius';

// Lightweight wallet-balance hook for the header status strip. One-shot fetch
// on connect, plus an optional `refresh` returner callers can hit after a
// burn so the displayed balance reflects the freshly-recovered SOL.
//
// We deliberately do NOT poll on a timer — the only events that change the
// connected wallet's balance from this app's perspective are (1) connect/
// switch wallet, (2) a burn completing. Polling would burn Helius credits
// for no perceptible benefit.
export function useWalletBalance(walletAddress) {
  const [lamports, setLamports] = useState(null);

  useEffect(() => {
    if (!walletAddress) {
      setLamports(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const conn = getConnection();
        const balance = await conn.getBalance(new PublicKey(walletAddress));
        if (!cancelled) setLamports(balance);
      } catch (err) {
        // Non-fatal — header just hides the balance chip on RPC error.
        console.warn('[useWalletBalance] fetch failed:', err?.message ?? err);
        if (!cancelled) setLamports(null);
      }
    })();
    return () => { cancelled = true; };
  }, [walletAddress]);

  return lamports;
}
