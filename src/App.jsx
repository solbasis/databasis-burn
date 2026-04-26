import { useState, useCallback, useMemo, useEffect } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletButton } from './components/WalletButton';
import { ResultsTabs } from './components/ResultsTabs';
import { BurnModal } from './components/BurnModal';
import { RecoveredCounter } from './components/RecoveredCounter';
import { UserStatsCard } from './components/UserStatsCard';
import { UserHistoryPanel } from './components/UserHistoryPanel';
import { useScanner } from './hooks/useScanner';
import { useBurn } from './hooks/useBurn';
import { useWalletBalance } from './hooks/useWalletBalance';
import { SOL_PER_LAMPORT } from './config';

// Selection keys are namespaced as `${type}:${id}` so an NFT mint and a token
// account address can never collide in the selection Set.
function makeKey(item, type) {
  const id = (type === 'nft' || type === 'cnft') ? item.id : item.address;
  return `${type}:${id}`;
}

// Three plain-language steps for the disconnected hero. Numbered so the
// reading order is unambiguous even when the grid stacks on mobile.
const HOW_IT_WORKS = [
  {
    n: '01',
    title: 'connect your wallet',
    desc: 'Phantom, Solflare, Backpack — any Solana wallet. Read-only by default; we never touch your keys.',
  },
  {
    n: '02',
    title: 'scan for dust',
    desc: 'We find empty token accounts, scam tokens, and unwanted NFTs locking up rent in your wallet.',
  },
  {
    n: '03',
    title: 'burn & recover',
    desc: 'Pick what to nuke — SOL flows back to your wallet. cNFTs (free spam mints) are removed but recover no rent.',
  },
];

// True when the focused element is one where keystrokes mean "type characters",
// not "trigger shortcut". We bail out of shortcut handling in those cases so
// the user can search/sort without firing scan/select-all/burn.
function isTypingTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return false;
}

export default function App() {
  const wallet = useWallet();
  const { loading, scanned, error: scanError, empty, tokens, nfts, cnfts, scan, prune } = useScanner();
  const burnState = useBurn();
  const walletAddress = wallet.publicKey?.toBase58() ?? null;
  const balanceLamports = useWalletBalance(walletAddress);

  const [selected, setSelected] = useState(new Set());
  const [showModal, setShowModal] = useState(false);
  // `pendingReview` holds the batch that's been queued for burn but NOT
  // yet sent to the wallet for signing. While it's set, the modal shows a
  // confirmation stage; only after the user confirms do we call execute().
  // This is a defense-in-depth UX layer — the wallet still asks for each
  // signature, but a misclick can't reach the wallet popup directly.
  const [pendingReview, setPendingReview] = useState(null);

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

  // Open the review modal. Does NOT trigger any signing — the user must
  // explicitly confirm in the next stage before any wallet popup appears.
  const handleBurn = useCallback(() => {
    const { empty: selectedEmpty, tokens: selectedTokens, nfts: selectedNFTs, cnfts: selectedCNFTs } = selectedLists;
    if (selectedEmpty.length + selectedTokens.length + selectedNFTs.length + selectedCNFTs.length === 0) return;

    const recoverableLamports = [...selectedEmpty, ...selectedTokens]
      .reduce((sum, a) => sum + (a.rentLamports ?? 0), 0);

    setPendingReview({
      selectedEmpty, selectedTokens, selectedNFTs, selectedCNFTs,
      recoverableLamports,
    });
    setShowModal(true);
  }, [selectedLists]);

  // Per-row "burn just this one" — also goes through the review stage so a
  // single misclick on the row-burn button doesn't reach the wallet either.
  const handleBurnOne = useCallback((item, type) => {
    const batch = {
      selectedEmpty:  type === 'empty' ? [item] : [],
      selectedTokens: type === 'token' ? [item] : [],
      selectedNFTs:   type === 'nft'   ? [item] : [],
      selectedCNFTs:  type === 'cnft'  ? [item] : [],
    };
    const recoverableLamports = [...batch.selectedEmpty, ...batch.selectedTokens]
      .reduce((sum, a) => sum + (a.rentLamports ?? 0), 0);
    setPendingReview({ ...batch, recoverableLamports });
    setShowModal(true);
  }, []);

  // User confirmed in the review modal — proceed to actual signing.
  const confirmBurn = useCallback(async () => {
    if (!pendingReview) return;
    const review = pendingReview;
    setPendingReview(null);  // clear so the modal transitions to running
    await burnState.execute({ wallet, ...review });
  }, [pendingReview, wallet, burnState]);

  // User cancelled the review modal — close without any side effects.
  const cancelBurn = useCallback(() => {
    setPendingReview(null);
    setShowModal(false);
  }, []);

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

  // ── Keyboard shortcuts ─────────────────────────────────────────────────
  // S → rescan, A → select-all (active tab handled by ResultsTabs, so we
  // approximate by selecting all currently-visible items across all tabs),
  // B → initiate burn. Power-user nicety; ignored when typing in a field
  // and when no wallet is connected.
  useEffect(() => {
    if (!wallet.connected) return;
    const handler = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;     // don't hijack browser shortcuts
      if (isTypingTarget(e.target)) return;
      if (showModal) return;                               // modal owns the keys

      const key = e.key.toLowerCase();
      if (key === 's') {
        e.preventDefault();
        if (!loading) handleScan();
      } else if (key === 'a' && scanned) {
        e.preventDefault();
        // Select every visible item across every tab. Users who want a
        // narrower select-all can still use the ResultsTabs "all" button.
        handleSelectAll(empty,  'empty');
        handleSelectAll(tokens, 'token');
        handleSelectAll(nfts,   'nft');
        handleSelectAll(cnfts,  'cnft');
      } else if (key === 'b') {
        e.preventDefault();
        if (selectedCount > 0 && !burnState.running) handleBurn();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    wallet.connected, showModal, loading, scanned, selectedCount, burnState.running,
    empty, tokens, nfts, cnfts,
    handleScan, handleSelectAll, handleBurn,
  ]);

  const hasResults = scanned && (empty.length > 0 || tokens.length > 0 || nfts.length > 0 || cnfts.length > 0);

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <span className="logo">
            <span className="logo-flame" aria-hidden="true">🔥</span>BASIS&nbsp;BURN
          </span>
          <span className="tagline">close · burn · recover</span>
        </div>
        <WalletButton />
      </header>

      {/* Status strip — gives the app a "live operator console" feel and tells
          power users exactly what RPC/network we're on. When connected, the
          wallet's current SOL balance gets surfaced here too — useful context
          for a "recover SOL" tool. */}
      <div className="status-strip" aria-label="system status">
        <span className="status-item">
          <span className="status-dot" aria-hidden="true" /> <b>live</b>
        </span>
        <span className="status-sep">·</span>
        <span className="status-item">net <b>solana&nbsp;mainnet</b></span>
        <span className="status-sep">·</span>
        <span className="status-item">rpc <b>helius</b></span>
        <span className="status-sep">·</span>
        <span className="status-item">fee <b>0%</b></span>
        {balanceLamports != null && (
          <>
            <span className="status-sep">·</span>
            <span className="status-item">bal <b>{(balanceLamports * SOL_PER_LAMPORT).toFixed(4)} SOL</b></span>
          </>
        )}
      </div>

      <main className="main">
        {!wallet.connected ? (
          <div className="hero">
            <div>
              <span className="hero-eyebrow">terminal · v1</span>
              <h1 className="hero-title">
                clean your wallet.<br />
                recover your <span className="accent">SOL</span>.
              </h1>
            </div>

            {/* Counter is the headline social proof — placed FIRST under the
                title so the all-time number is the first quantitative thing a
                visitor sees. */}
            <RecoveredCounter variant="hero" />

            <p className="hero-desc">
              Every Solana wallet locks rent in empty token accounts, dust, and
              unwanted NFTs. Basis Burn finds them, lets you pick what to torch,
              and refunds the SOL back to you in one signed transaction.
            </p>

            <div className="hero-steps">
              {HOW_IT_WORKS.map(step => (
                <div className="hero-step" key={step.n}>
                  <span className="hero-step-num">{step.n}</span>
                  <div className="hero-step-title">{step.title}</div>
                  <div className="hero-step-desc">{step.desc}</div>
                </div>
              ))}
            </div>

            <div className="hero-cta">
              <WalletButton />
              <span className="hero-cta-note">100% free · no fees · open source</span>
            </div>
          </div>
        ) : (
          <div className="workspace">
            <div className="scan-bar">
              <button className="btn-scan" onClick={handleScan} disabled={loading}>
                {loading ? 'scanning…' : scanned ? '↺ rescan' : 'scan wallet'}
              </button>
              {scanned && !loading && (
                <span className="scan-summary">
                  <b>{empty.length}</b> empty · <b>{tokens.length}</b> tokens · <b>{nfts.length}</b> NFTs · <b>{cnfts.length}</b> cNFTs
                </span>
              )}
              <div className="scan-bar-stats">
                <UserStatsCard
                  walletAddress={walletAddress}
                  variant="compact"
                />
                <RecoveredCounter variant="compact" />
              </div>
            </div>

            {/* Personal history panel — only renders when this wallet has
                burn history saved. Sparkline + tier achievements. */}
            <UserHistoryPanel walletAddress={walletAddress} />

            {scanError && <p className="error-msg">{scanError}</p>}

            {/* Loading state — show ResultsTabs in skeleton mode so the user
                gets immediate visual feedback instead of an empty workspace. */}
            {loading && (
              <ResultsTabs
                empty={[]} tokens={[]} nfts={[]} cnfts={[]}
                selected={selected}
                onToggle={handleToggle}
                onSelectAll={handleSelectAll}
                onClearAll={handleClearAll}
                loading
                disabled
              />
            )}

            {/* Celebratory empty state — when scan returns zero of everything,
                that's a *win* worth saying so out loud instead of showing four
                empty tabs. */}
            {!loading && scanned && !scanError && !hasResults && (
              <div className="clean-state" role="status">
                <div className="clean-state-icon" aria-hidden="true">✓</div>
                <h2 className="clean-state-title">wallet is clean</h2>
                <p className="clean-state-desc">
                  No empty accounts, no dust, no unwanted NFTs. Nothing to burn —
                  your rent is already where it should be: in your wallet.
                </p>
                <button className="btn-ghost" onClick={handleScan} disabled={loading}>
                  ↺ scan again
                </button>
              </div>
            )}

            {!loading && hasResults && (
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
                  onBurnOne={handleBurnOne}
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
                      : `initiate burn — ${selectedCount} item${selectedCount !== 1 ? 's' : ''}`}
                  </button>

                  {/* Keyboard shortcut hint — reads as a help line, not a
                      control. Hidden on small screens where shortcuts don't
                      apply (no physical keyboard). */}
                  <span className="kbd-hint">
                    <kbd>S</kbd> rescan · <kbd>A</kbd> select all · <kbd>B</kbd> burn
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <footer className="footer">
        <a href="https://databasis.info" target="_blank" rel="noopener noreferrer">databasis.info</a>
        <span>·</span>
        <a href="https://orbmarkets.io/token/A5BJBQUTR5sTzkM89hRDuApWyvgjdXpR7B7rW1r9pump" target="_blank" rel="noopener noreferrer">
          $BASIS
        </a>
        <span className="footer-version">
          <span className="footer-pulse" aria-hidden="true" />
          v1.0 · online
        </span>
      </footer>

      {showModal && (
        <BurnModal
          status={burnState}
          review={pendingReview}
          onConfirm={confirmBurn}
          onCancel={cancelBurn}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
