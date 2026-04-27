import { SOL_PER_LAMPORT } from '../config';
import { ShareButtons } from './ShareButtons';

const STEP_LABELS = {
  preparing: 'Preparing…',
  closing: 'Closing empty accounts…',
  'burning-tokens': 'Burning tokens…',
  'burning-nfts': 'Burning NFTs…',
  'burning-cnfts': 'Burning cNFTs…',
};

// "Are you sure?" review stage shown BEFORE any wallet popup is requested.
// Lists exactly what's about to happen and the SOL the user will recover,
// then forces an explicit confirmation. Cancel does nothing destructive —
// no wallet prompt is ever issued unless this dialog is confirmed.
//
// This is a defense-in-depth UX layer on top of the wallet provider's own
// signature confirmation. It catches "oh shit I clicked the wrong thing"
// scenarios where the wallet popup details would be too dense to verify
// at a glance (a 12-account close batch, etc.).
function ReviewStage({ review, onConfirm, onCancel }) {
  const { selectedEmpty, selectedTokens, selectedNFTs, selectedCNFTs, recoverableLamports } = review;
  const counts = [
    { n: selectedEmpty.length,  label: 'empty account', verb: 'close' },
    { n: selectedTokens.length, label: 'token',         verb: 'burn'  },
    { n: selectedNFTs.length,   label: 'NFT',           verb: 'burn'  },
    { n: selectedCNFTs.length,  label: 'cNFT',          verb: 'remove' },
  ].filter(c => c.n > 0);

  const totalCount = counts.reduce((s, c) => s + c.n, 0);
  const recoverableSol = recoverableLamports * SOL_PER_LAMPORT;
  const willRecover = recoverableLamports > 0;

  return (
    <>
      <span className="modal-eyebrow">review · pre-flight</span>
      <h2 className="modal-title review">confirm burn</h2>

      <div className="review-summary">
        <p className="review-lead">
          you're about to <b>{totalCount === 1 ? 'process' : 'process'} {totalCount} item{totalCount === 1 ? '' : 's'}</b>:
        </p>
        <ul className="review-list">
          {counts.map((c, i) => (
            <li key={i}>
              <span className="review-verb">{c.verb}</span>
              <span className="review-count">{c.n}</span>
              <span className="review-label">{c.label}{c.n === 1 ? '' : 's'}</span>
            </li>
          ))}
        </ul>
      </div>

      {willRecover ? (
        <div className="review-recover">
          <span>you will recover</span>
          <strong>~{recoverableSol.toFixed(6)} SOL</strong>
        </div>
      ) : (
        <p className="review-no-recover">
          this batch contains only cNFTs — no SOL is recovered (cNFTs don't lock rent).
        </p>
      )}

      <p className="review-warning">
        ⚠ this is irreversible. burned tokens / NFTs cannot be restored.
        your wallet will ask you to sign each transaction.
      </p>

      <div className="review-actions">
        <button className="btn-ghost" onClick={onCancel} autoFocus>cancel</button>
        <button className="btn-burn review-confirm" onClick={onConfirm}>
          ▸ confirm & sign
        </button>
      </div>
    </>
  );
}

export function BurnModal({ status, review, onConfirm, onCancel, onClose, walletAddress, userStats }) {
  const { running, step, progress, done, error, recoveredLamports, txids, failures = [], attempted, succeeded } = status;

  // Stage selection: review (no signing yet) → running → done | error.
  // `review` is set by the parent before any execute() call; once execute
  // begins, status.running becomes true and we transition automatically.
  const inReview = !!review && !running && !done && !error;

  // cNFTs don't lock rent — they're just Merkle-tree leaves. Count how many the
  // user tried to burn vs how many failed, so we can report "N cNFTs removed"
  // without confusingly claiming SOL was recovered from them.
  const cnftAttempted = attempted?.cnfts ?? 0;
  const cnftFailed    = failures.filter(f => f.type === 'cnft').length;
  const cnftBurned    = Math.max(0, cnftAttempted - cnftFailed);
  const rentBearingAttempted =
    (attempted?.empty  ?? 0) +
    (attempted?.tokens ?? 0) +
    (attempted?.nfts   ?? 0);
  const cnftOnly = rentBearingAttempted === 0 && cnftAttempted > 0;

  // Click-outside semantics:
  //  - review stage:  cancels (safe — no signing yet)
  //  - running:       no-op (mid-burn — don't break the user's flow)
  //  - done | error:  closes
  const handleOverlayClick = () => {
    if (inReview) onCancel?.();
    else if (done || error) onClose?.();
  };

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {inReview && (
          <ReviewStage review={review} onConfirm={onConfirm} onCancel={onCancel} />
        )}

        {running && (
          <>
            <span className="modal-eyebrow">ignition sequence</span>
            <h2 className="modal-title fire">burning</h2>
            <p className="modal-step">{STEP_LABELS[step] ?? step}</p>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <p className="progress-pct">{Math.round(progress * 100)}%</p>
          </>
        )}

        {done && (
          <>
            <span className="modal-eyebrow">sequence complete</span>
            <h2 className="modal-title success">
              done ✓
              {/* Pure-CSS spark burst — eight directional sparks at fixed
                  angles play exactly once on mount, then dissolve. */}
              <span className="spark-burst" aria-hidden="true">
                {[...Array(8)].map((_, i) => <span key={i} className="spark" />)}
              </span>
            </h2>
            {cnftOnly ? (
              <p className="modal-recovered">
                removed <strong>{cnftBurned} cNFT{cnftBurned === 1 ? '' : 's'}</strong>
                <span className="modal-note"> — cNFTs don't lock rent, no SOL to recover</span>
              </p>
            ) : (
              <>
                <p className="modal-recovered">
                  recovered <strong>{(recoveredLamports * SOL_PER_LAMPORT).toFixed(6)} SOL</strong>
                </p>
                {cnftBurned > 0 && (
                  <p className="modal-note">
                    +{cnftBurned} cNFT{cnftBurned === 1 ? '' : 's'} removed (no rent recovered from cNFTs)
                  </p>
                )}
              </>
            )}
            {txids.length > 0 && (
              <div className="txid-list">
                {txids.map(id => (
                  <a
                    key={id}
                    href={`https://orbmarkets.io/tx/${id}`}
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

            {/* Brag-share row — generates a 1200×630 PNG card via SVG+Canvas
                and posts to X / Telegram with prefilled text. Reused later
                for achievement-unlock cards. */}
            <ShareButtons
              recoveredLamports={recoveredLamports}
              succeeded={succeeded}
              walletAddress={walletAddress}
              userStats={userStats}
            />

            <button className="btn-primary" onClick={onClose}>close</button>
          </>
        )}

        {error && (
          <>
            <span className="modal-eyebrow">sequence aborted</span>
            <h2 className="modal-title error">error</h2>
            <p className="modal-error-msg">{error}</p>
            {txids.length > 0 && (
              <>
                <p className="modal-partial">partial success — {txids.length} tx confirmed:</p>
                <div className="txid-list">
                  {txids.map(id => (
                    <a
                      key={id}
                      href={`https://orbmarkets.io/tx/${id}`}
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
