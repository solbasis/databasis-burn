import { useState, useCallback } from 'react';
import { scanTokenAccounts, scanNFTs } from '../lib/helius';

export function useScanner() {
  const [state, setState] = useState({
    loading: false,
    scanned: false,
    error: null,
    empty: [],
    tokens: [],
    nfts: [],
    cnfts: [],
  });

  const scan = useCallback(async (walletAddress) => {
    setState(s => ({ ...s, loading: true, error: null, scanned: false }));

    try {
      const allNfts = await scanNFTs(walletAddress);
      const nfts  = allNfts.filter(n => !n.compressed);
      const cnfts = allNfts.filter(n =>  n.compressed);
      const nftMints = new Set(allNfts.map(n => n.id));
      const { empty, withBalance } = await scanTokenAccounts(walletAddress, nftMints);

      setState({
        loading: false,
        scanned: true,
        error: null,
        empty,
        tokens: withBalance,
        nfts,
        cnfts,
      });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  // Optimistic client-side removal of just-burned items. Necessary because
  // Helius DAS has a 2–3s indexing lag (per their own docs) — if we rescan
  // immediately after a successful burn, the indexer still returns the asset
  // and it snaps back into the UI. Prune lets us keep the view correct
  // instantly; the manual rescan button refreshes authoritatively later.
  const prune = useCallback((succeeded) => {
    if (!succeeded) return;
    const emptyAddrs = new Set(succeeded.empty  ?? []);
    const tokenAddrs = new Set(succeeded.tokens ?? []);
    const nftIds     = new Set(succeeded.nfts   ?? []);
    const cnftIds    = new Set(succeeded.cnfts  ?? []);
    if (emptyAddrs.size + tokenAddrs.size + nftIds.size + cnftIds.size === 0) return;
    setState(s => ({
      ...s,
      empty:  s.empty .filter(a => !emptyAddrs.has(a.address)),
      tokens: s.tokens.filter(a => !tokenAddrs.has(a.address)),
      nfts:   s.nfts  .filter(n => !nftIds.has(n.id)),
      cnfts:  s.cnfts .filter(n => !cnftIds.has(n.id)),
    }));
  }, []);

  return { ...state, scan, prune };
}
