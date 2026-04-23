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
  });

  const scan = useCallback(async (walletAddress) => {
    setState(s => ({ ...s, loading: true, error: null, scanned: false }));

    try {
      const [{ empty, withBalance }, nfts] = await Promise.all([
        scanTokenAccounts(walletAddress),
        scanNFTs(walletAddress),
      ]);

      setState({
        loading: false,
        scanned: true,
        error: null,
        empty,
        tokens: withBalance,
        nfts,
      });
    } catch (err) {
      setState(s => ({ ...s, loading: false, error: err.message }));
    }
  }, []);

  const reset = useCallback(() => {
    setState({ loading: false, scanned: false, error: null, empty: [], tokens: [], nfts: [] });
  }, []);

  return { ...state, scan, reset };
}
