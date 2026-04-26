import { useUserStats } from '../hooks/useUserStats';
import { SOL_PER_LAMPORT } from '../config';

// Same formatting scale as RecoveredCounter so the two chips in the scan bar
// line up visually and don't fight over decimals.
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

// Personal all-time burn counter for the connected wallet. Data lives in
// localStorage so there's nothing to load — we render as soon as we have an
// address. First-time viewers (no history) see a zero chip, which doubles as
// a subtle nudge to make their first burn.
//
// Placed alongside RecoveredCounter.variant="compact" in the scan bar;
// variant="compact" here uses the same chip chrome with a distinct label so
// the two counters read as "you · all-time" at a glance.
export function UserStatsCard({ walletAddress, variant = 'compact' }) {
  const { lamports, burns } = useUserStats(walletAddress);

  if (!walletAddress) return null;

  if (variant === 'compact') {
    return (
      <span
        className="user-stats compact"
        title={burns === 0
          ? 'no burns yet on this wallet — your first burn will populate this counter'
          : `${burns} burn${burns === 1 ? '' : 's'} from this wallet`}
      >
        <span className="us-label">you</span>
        <span className="us-value">{formatSol(lamports)} SOL</span>
        <span className="us-burns">· {formatBurns(burns)} burn{burns === 1 ? '' : 's'}</span>
      </span>
    );
  }

  // Reserved for a future hero-style view (e.g. a dedicated "your history"
  // panel). Intentionally matches RecoveredCounter's markup so it can be
  // styled with shared rules if we ever want.
  return (
    <div className="user-stats hero">
      <div className="us-flame">🔥</div>
      <div className="us-main">
        <div className="us-sol">{formatSol(lamports)} <span className="us-unit">SOL</span></div>
        <div className="us-sub">you've recovered across {formatBurns(burns)} burn{burns === 1 ? '' : 's'}</div>
      </div>
    </div>
  );
}
