import { useRecoveredStats } from '../hooks/useRecoveredStats';
import { useCountUp } from '../hooks/useCountUp';
import { SOL_PER_LAMPORT } from '../config';

// Big numbers lose decimals so the display stays readable
// (123.4567 SOL is fine; 12,345.6789 is noisy).
function formatSol(lamports) {
  const sol = lamports * SOL_PER_LAMPORT;
  if (sol >= 1000) return sol.toFixed(2);
  if (sol >= 10)   return sol.toFixed(3);
  return sol.toFixed(4);
}

function formatBurns(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

// Two rendering modes:
//   variant="hero"    — prominent card for the disconnected landing view.
//                       Numbers count up smoothly on first paint and after
//                       every increment, so the counter feels alive instead
//                       of teleporting between values.
//   variant="compact" — small inline chip for the scan bar (no animation —
//                       the chip is too small for a count-up to read well).
export function RecoveredCounter({ variant = 'hero' }) {
  const { lamports, burns, loading } = useRecoveredStats();

  // Animate hero variant only — compact chip stays static so the scan bar
  // doesn't visually thrash whenever the global counter ticks.
  const animatedLamports = useCountUp(lamports, { duration: 1100 });
  const animatedBurns    = useCountUp(burns,    { duration: 900 });

  if (loading && lamports === 0 && burns === 0) {
    // Don't flash zeros before first snapshot — just render nothing.
    return null;
  }

  if (variant === 'compact') {
    return (
      <span className="recovered-counter compact" title={`${burns.toLocaleString()} burns total`}>
        <span className="rc-label">all-time</span>
        <span className="rc-value">{formatSol(lamports)} SOL</span>
        <span className="rc-burns">· {formatBurns(burns)} burns</span>
      </span>
    );
  }

  return (
    <div className="recovered-counter hero" role="status" aria-live="polite">
      <div className="rc-flame" aria-hidden="true">🔥</div>
      <div className="rc-main">
        <span className="rc-eyebrow">all-time recovered</span>
        <div className="rc-sol">
          {formatSol(animatedLamports)}<span className="rc-unit">SOL</span>
        </div>
        <div className="rc-sub">
          across <b>{formatBurns(animatedBurns)}</b> burns · network-wide
        </div>
      </div>
      <span className="rc-live" aria-label="live counter">live</span>
    </div>
  );
}
