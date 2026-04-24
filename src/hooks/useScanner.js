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

  return { ...state, scan };
}
