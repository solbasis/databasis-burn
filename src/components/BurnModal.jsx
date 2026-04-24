import { SOL_PER_LAMPORT } from '../config';

const STEP_LABELS = {
  preparing: 'Preparing…',
  closing: 'Closing empty accounts…',
  'burning-tokens': 'Burning tokens…',
  'burning-nfts': 'Burning NFTs…',
  'burning-cnfts': 'Burning cNFTs…',
};

export function BurnModal({ status, onClose }) {
  const { running, step, progress, done, error, recoveredLamports, txids, failures = [] } = status;

  return (
    <div className="modal-overlay" onClick={done || error ? onClose : undefined}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        {running && (
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
