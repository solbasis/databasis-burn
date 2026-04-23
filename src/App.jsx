import { useState, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletButton } from './components/WalletButton';
import { ResultsTabs } from './components/ResultsTabs';
import { AutoBuyToggle } from './components/AutoBuyToggle';
import { BurnModal } from './components/BurnModal';
import { useScanner } from './hooks/useScanner';
import { useBurn } from './hooks/useBurn';
import { SOL_PER_LAMPORT } from './config';

export default function App() {
  const wallet = useWallet();
  const { loading, scanned, error: scanError, empty, tokens, nfts, cnfts, scan } = useScanner();
  const burnState = useBurn();

  const [selected, setSelected] = useState(new Set());
  const [autoBuy, setAutoBuy] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const getKey = (item, type) => (type === 'nft' ? item.id : item.address);

  const handleToggle = useCallback((item, type) => {
    const key = getKey(item, type);
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((items, type) => {
    setSelected(prev => {
      const next = new Set(prev);
      items.forEach(item => next.add(getKey(item, type)));
      return next;
    });
  }, []);

  const handleClearAll = useCallback((items, type) => {
    setSelected(prev => {
      const next = new Set(prev);
      items.forEach(item => next.delete(getKey(item, type)));
      return next;
    });
  }, []);

  const handleScan = useCallback(() => {
    if (!wallet.publicKey) return;
    setSelected(new Set());
    scan(wallet.publicKey.toBase58());
  }, [wallet.publicKey, scan]);

  const handleBurn = useCallback(async () => {
    const selectedEmpty  = empty.filter(a  => selected.has(a.address));
    const selectedTokens = tokens.filter(a => selected.has(a.address));
    const selectedNFTs   = nfts.filter(a   => selected.has(a.id));
    const selectedCNFTs  = cnfts.filter(a  => selected.has(a.id));

    if (selectedEmpty.length + selectedTokens.length + selectedNFTs.length + selectedCNFTs.length === 0) return;

    setShowModal(true);
    await burnState.execute({ wallet, selectedEmpty, selectedTokens, selectedNFTs, selectedCNFTs, autoBuy });
  }, [wallet, empty, tokens, nfts, cnfts, selected, autoBuy, burnState]);

  const handleModalClose = useCallback(() => {
    setShowModal(false);
    burnState.reset();
    if (burnState.done && wallet.publicKey) {
      setSelected(new Set());
      scan(wallet.publicKey.toBase58());
    }
  }, [burnState, wallet.publicKey, scan]);

  const recoveredSol = [...empty, ...tokens]
    .filter(a => selected.has(a.address))
    .reduce((sum, a) => sum + a.rentLamports * SOL_PER_LAMPORT, 0);

  const selectedCount = selected.size;
  const totalItems = empty.length + tokens.length + nfts.length + cnfts.length;

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
              Close empty token accounts, burn dust and unwanted NFTs,
              and optionally auto-buy $BASIS with the recovered rent.
            </p>
            <ul className="hero-features">
              <li>↳ recover ~0.002 SOL per empty account</li>
              <li>↳ burn tokens, NFTs & cNFTs in bulk</li>
              <li>↳ optional auto-buy $BASIS</li>
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
                />

                <div className="action-bar">
                  <AutoBuyToggle
                    enabled={autoBuy}
                    onChange={setAutoBuy}
                    recoveredSol={recoveredSol}
                  />

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
