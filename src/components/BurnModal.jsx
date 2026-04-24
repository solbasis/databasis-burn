import { SOL_PER_LAMPORT } from '../config';

const STEP_LABELS = {
  preparing: 'Preparing…',
  closing: 'Closing empty accounts…',
  'burning-tokens': 'Burning tokens…',
  'burning-nfts': 'Burning NFTs…',
  'burning-cnfts': 'Burning cNFTs…',
  'quoting-swap': 'Fetching swap quote…',
  'buying-basis': 'Swapping SOL → $BASIS…',
};

// Compact formatter: tiny balances keep precision, big numbers get grouping.
// Jupiter returns BASIS as a 6-decimal number — raw amount / 1e6 = UI amount.
function fmtBasis(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1) return n.toFixed(4);
  if (n < 1000) return n.toFixed(2);
  return Math.round(n).toLocaleString('en-US');
}

export function BurnModal({ status, onClose, onConfirmSwap, onSkipSwap }) {
  const { running, step, progress, done, error, recoveredLamports, txids, failures = [], pendingSwap } = status;

  // Precedence:
  //   pendingSwap → confirm screen (blocks the progress UI)
  //   running     → progress UI
  //   done/error  → result UI
  // We only let the backdrop dismiss when the flow is actually finished.
  const dismissable = (done || error) && !pendingSwap;

  return (
    <div className="modal-overlay" onClick={dismissable ? onClose : undefined}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {pendingSwap && (
          <>
            <h2 className="modal-title fire">confirm swap</h2>
            <p className="modal-step">review before signing</p>
            <div className="swap-confirm">
              <div className="swap-confirm-row">
                <span className="swap-confirm-label">spend</span>
                <span className="swap-confirm-value">
                  {(pendingSwap.inLamports * SOL_PER_LAMPORT).toFixed(6)} SOL
                </span>
              </div>
              <div className="swap-confirm-row">
                <span className="swap-confirm-label">receive ≈</span>
                <span className="swap-confirm-value pos">
                  {fmtBasis(pendingSwap.outUi)} $BASIS
                </span>
              </div>
              <div className="swap-confirm-row">
                <span className="swap-confirm-label">min (5% slippage)</span>
                <span className="swap-confirm-value">
                  {fmtBasis(pendingSwap.minUi)} $BASIS
                </span>
              </div>
            </div>
            <div className="swap-confirm-actions">
              <button className="btn-secondary" onClick={onSkipSwap}>skip</button>
              <button className="btn-primary" onClick={onConfirmSwap}>approve</button>
            </div>
          </>
        )}

        {!pendingSwap && running && (
          <>
            <h2 className="modal-title fire">burning…</h2>
            <p className="modal-step">{STEP_LABELS[step] ?? step}</p>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="progress-pct">{Math.round(progress * 100)}%</p>
          </>
        )}

        {done && (
          <>
            <h2 className="modal-title success">done ✓</h2>
            <p className="modal-recovered">
              recovered <strong>{(recoveredLamports * SOL_PER_LAMPORT).toFixed(6)} SOL</strong>
            </p>
            {txids.length > 0 && (
              <div className="txid-list">
                {txids.map(id => (
                  <a
                    key={id}
                    href={`https://solscan.io/tx/${id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="txid-link"
                  >
                    {id.slice(0, 8)}…{id.slice(-8)} ↗
                  </a>
                ))}
              </div>
            )}
            {failures.length > 0 && (
              <div className="failure-list">
                <p className="failure-title">{failures.length} failed:</p>
                {failures.map((f, i) => (
                  <div key={`${f.id}-${i}`} className="failure-row">
                    <span className="failure-name">{f.name}</span>
                    <span className="failure-error">{f.error}</span>
                  </div>
                ))}
              </div>
            )}
            <button className="btn-primary" onClick={onClose}>close</button>
          </>
        )}

        {error && (
          <>
            <h2 className="modal-title error">error</h2>
            <p className="modal-error-msg">{error}</p>
            {txids.length > 0 && (
              <>
                <p className="modal-partial">partial success — {txids.length} tx confirmed:</p>
                <div className="txid-list">
                  {txids.map(id => (
                    <a
                      key={id}
                      href={`https://solscan.io/tx/${id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="txid-link"
                    >
                      {id.slice(0, 8)}…{id.slice(-8)} ↗
                    </a>
                  ))}
                </div>
              </>
            )}
            <button className="btn-primary" onClick={onClose}>close</button>
          </>
        )}
      </div>
    </div>
  );
}
