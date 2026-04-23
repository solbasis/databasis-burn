export function AutoBuyToggle({ enabled, onChange, recoveredSol }) {
  return (
    <label className={`autobuy-toggle ${enabled ? 'on' : ''}`}>
      <input
        type="checkbox"
        checked={enabled}
        onChange={e => onChange(e.target.checked)}
      />
      <div className="autobuy-content">
        <span className="autobuy-label">auto-buy $BASIS with recovered SOL</span>
        {recoveredSol > 0 && (
          <span className="autobuy-amount">~{recoveredSol.toFixed(4)} SOL → $BASIS</span>
        )}
      </div>
      <div className={`toggle-pill ${enabled ? 'on' : ''}`} />
    </label>
  );
}
