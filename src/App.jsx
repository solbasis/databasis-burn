import { useState, useCallback, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletButton } from './components/WalletButton';
import { ResultsTabs } from './components/ResultsTabs';
import { BurnModal } from './components/BurnModal';
import { RecoveredCounter } from './components/RecoveredCounter';
import { useScanner } from './hooks/useScanner';
import { useBurn } from './hooks/useBurn';
import { SOL_PER_LAMPORT } from './config';

// Selection keys are namespaced as `${type}:${id}` so an NFT mint and a token
// account address can never collide in the selection Set.
function makeKey(item, type) {
  const id = (type === 'nft' || type === 'cnft') ? item.id : item.address;
  return `${type}:${id}`;
}

export default function App() {
  const wallet = useWallet();
  const { loading, scanned, error: scanError, empty, tokens, nfts, cnfts, scan, prune } = useScanner();
  const burnState = useBurn();

  const [selected, setSelected] = useState(new Set());
  const [showModal, setShowModal] = useState(false);

  const handleToggle = useCallback((item, type) => {
    const key = makeKey(item, type);
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((items, type) => {
    setSelected(prev => {
      const next = new Set(prev);
      items.forEach(item => next.add(makeKey(item, type)));
      return next;
    });
  }, []);

  const handleClearAll = useCallback((items, type) => {
    setSelected(prev => {
      const next = new Set(prev);
      items.forEach(item => next.delete(makeKey(item, type)));
      return next;
    });
  }, []);

  const handleScan = useCallback(() => {
    if (!wallet.publicKey) return;
    setSelected(new Set());
    scan(wallet.publicKey.toBase58());
  }, [wallet.publicKey, scan]);

  // Pre-filter selected items once per render, keyed by type so the filter
  // only matches when the type prefix also matches.
  const selectedLists = useMemo(() => ({
    empty:  empty .filter(a => selected.has(`empty:${a.address}`)),
    tokens: tokens.filter(a => selected.has(`token:${a.address}`)),
    nfts:   nfts  .filter(a => selected.has(`nft:${a.id}`)),
    cnfts:  cnfts .filter(a => selected.has(`cnft:${a.id}`)),
  }), [empty, tokens, nfts, cnfts, selected]);

  const recoveredSol = useMemo(
    () => [...selectedLists.empty, ...selectedLists.tokens]
      .reduce((sum, a) => sum + a.rentLamports * SOL_PER_LAMPORT, 0),
    [selectedLists.empty, selectedLists.tokens]
  );

  const selectedCount = selected.size;

  const handleBurn = useCallback(async () => {
    const { empty: selectedEmpty, tokens: selectedTokens, nfts: selectedNFTs, cnfts: selectedCNFTs } = selectedLists;
    if (selectedEmpty.length + selectedTokens.length + selectedNFTs.length + selectedCNFTs.length === 0) return;

    setShowModal(true);
    await burnState.execute({ wallet, selectedEmpty, selectedTokens, selectedNFTs, selectedCNFTs });
  }, [wallet, selectedLists, burnState]);

  const handleModalClose = useCallback(() => {
    // Capture before reset(): setStatus flushes synchronously but relying on
    // that coupling is fragile — read first, then reset.
    const succeeded = burnState.succeeded;
    setShowModal(false);
    burnState.reset();
    // Strip burned items from the UI immediately. We deliberately do NOT
    // auto-rescan here: Helius DAS has a 2–3s indexing lag, so an immediate
    // rescan often returns the burned cNFT as still owned and snaps it back
    // into view. The manual "↺ rescan" button is there when users want an
    // authoritative refresh a few seconds later.
    if (wallet.publicKey) {
      setSelected(new Set());
      prune(succeeded);
    }
  }, [burnState, wallet.publicKey, prune]);

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="logo">🔥 BASIS BURN</span>
          <span className="tagline">close · burn · recover</span>
        </div>
        <WalletButton />
      </header>

      <main className="main">
        {!wallet.connected ? (
          <div className="hero">
            <h1 className="hero-title">clean your wallet.<br />recover your SOL.</h1>
            <p className="hero-desc">
              Close empty token accounts and burn dust, NFTs, and cNFTs
              to reclaim the rent locked in them.
            </p>
            <RecoveredCounter variant="hero" />
            <ul className="hero-features">
              <li>↳ recover ~0.002 SOL per empty account</li>
              <li>↳ burn tokens, NFTs & cNFTs in bulk</li>
              <li>↳ 100% free — no fees</li>
            </ul>
          </div>
        ) : (
          <div className="workspace">
            <div className="scan-bar">
              <button className="btn-scan" onClick={handleScan} disabled={loading}>
                {loading ? 'scanning…' : scanned ? '↺ rescan' : 'scan wallet'}
              </button>
              {scanned && (
                <span className="scan-summary">
                  {empty.length} empty · {tokens.length} tokens · {nfts.length} NFTs · {cnfts.length} cNFTs
                </span>
              )}
              <RecoveredCounter variant="compact" />
            </div>

            {scanError && <p className="error-msg">{scanError}</p>}

            {scanned && (
              <>
                <ResultsTabs
                  empty={empty}
                  tokens={tokens}
                  nfts={nfts}
                  cnfts={cnfts}
                  selected={selected}
                  onToggle={handleToggle}
                  onSelectAll={handleSelectAll}
                  onClearAll={handleClearAll}
                  disabled={burnState.running}
                />

                <div className="action-bar">
                  {recoveredSol > 0 && (
                    <div className="recovered-preview">
                      <span>recoverable</span>
                      <strong>{recoveredSol.toFixed(6)} SOL</strong>
                    </div>
                  )}

                  <button
                    className="btn-burn"
                    onClick={handleBurn}
                    disabled={selectedCount === 0 || burnState.running}
                  >
                    {selectedCount === 0
                      ? 'select items to burn'
                      : `burn ${selectedCount} item${selectedCount !== 1 ? 's' : ''}`}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <a href="https://databasis.info" target="_blank" rel="noopener noreferrer">databasis.info</a>
        <span>·</span>
        <a href="https://solscan.io/token/A5BJBQUTR5sTzkM89hRDuApWyvgjdXpR7B7rW1r9pump" target="_blank" rel="noopener noreferrer">
          $BASIS
        </a>
      </footer>

      {showModal && <BurnModal status={burnState} onClose={handleModalClose} />}
    </div>
  );
}
