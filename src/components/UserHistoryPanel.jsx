import { useUserStats } from '../hooks/useUserStats';
import { Sparkline } from './Sparkline';
import { Achievements } from './Achievements';
import { SOL_PER_LAMPORT } from '../config';

// Personal burn history for the connected wallet — sparkline of the last N
// burns plus tier-achievement chips. Renders nothing for a brand-new wallet
// (no history yet) so first-time users aren't greeted with an empty panel.
//
// Sits between the scan bar and the results tabs in the workspace; all
// data comes from localStorage so there's no network cost to show it.
export function UserHistoryPanel({ walletAddress }) {
  const stats = useUserStats(walletAddress);

  // Hide entirely when wallet has no history. We could also gate on burns >= 1
  // but checking history length is the strictest "have something to draw" test.
  if (!walletAddress || stats.burns === 0) return null;

  const totalSol = (stats.lamports * SOL_PER_LAMPORT).toFixed(4);

  return (
    <section className="history-panel" aria-label="your burn history">
      <header className="history-panel-head">
        <span className="history-panel-eyebrow">your history</span>
        <span className="history-panel-stat">
          <b>{totalSol}</b> SOL · <b>{stats.burns}</b> burn{stats.burns === 1 ? '' : 's'}
        </span>
      </header>

      <div className="history-panel-body">
        <Sparkline history={stats.history} />
        <Achievements stats={stats} />
      </div>
    </section>
  );
}
