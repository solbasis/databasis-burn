import { useRecoveredStats } from '../hooks/useRecoveredStats';
import { SOL_PER_LAMPORT } from '../config';

// Formats lamports → SOL with sensible precision. Big numbers lose decimals
// so the display stays readable (123.4567 SOL is fine; 12,345.6789 is noisy).
function formatSol(lamports) {
  const sol = lamports * SOL_PER_LAMPORT;
  if (sol >= 1000) return sol.toFixed(2);
  if (sol >= 10)   return sol.toFixed(3);
  return sol.toFixed(4);
}

function formatBurns(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

// Two rendering modes:
//   variant="hero"    — prominent card for the disconnected landing view
//   variant="compact" — small inline chip for the scan bar
export function RecoveredCounter({ variant = 'hero' }) {
  const { lamports, burns, loading } = useRecoveredStats();

  if (loading && lamports === 0 && burns === 0) {
    // Don't flash zeros before first snapshot — just render nothing.
    return null;
  }

  if (variant === 'compact') {
    return (
      <span className="recovered-counter compact" title={`${burns} burns`}>
        <span className="rc-label">all-time</span>
        <span className="rc-value">{formatSol(lamports)} SOL</span>
        <span className="rc-burns">· {formatBurns(burns)} burns</span>
      </span>
    );
  }

  return (
    <div className="recovered-counter hero">
      <div className="rc-flame">🔥</div>
      <div className="rc-main">
        <div className="rc-sol">{formatSol(lamports)} <span className="rc-unit">SOL</span></div>
        <div className="rc-sub">recovered across {formatBurns(burns)} burns</div>
      </div>
    </div>
  );
}
