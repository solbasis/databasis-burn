import { useEffect, useState } from 'react';
import { subscribeToUserStats } from '../lib/userStats';

// Live subscription to the connected wallet's personal burn counter. Returns
// { lamports, burns, firstBurnAt, lastBurnAt } — re-subscribes automatically
// when the wallet address changes so switching wallets flips the display to
// the new wallet's history.
//
// Pass `null`/`undefined` for the walletAddress when no wallet is connected;
// the hook will return an empty-stats snapshot and not attach any listeners.
export function useUserStats(walletAddress) {
  const [stats, setStats] = useState({
    lamports:    0,
    burns:       0,
    firstBurnAt: null,
    lastBurnAt:  null,
    history:     [],
  });

  useEffect(() => {
    const unsub = subscribeToUserStats(walletAddress ?? null, setStats);
    return unsub;
  }, [walletAddress]);

  return stats;
}
