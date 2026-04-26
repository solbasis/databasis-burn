import { SOL_PER_LAMPORT } from '../config';

// Tiered burn achievements. Each tier defines a `test(stats)` predicate.
// Order matters — we render in this order, and we take the rightmost
// *achieved* tier as the user's "current rank" for highlighting purposes.
//
// Picked thresholds that feel earnable without being trivial:
//   • first burn  →  any user who's used the app once
//   • 10 burns   →   regular user; 1× per week for ~2 months
//   • 0.1 SOL   →    meaningful recovery (≈$15-25 at common SOL prices)
//   • 50 burns  →    power user
//   • 1 SOL     →    rare; legitimate "whale" of dust burning
//
// We surface ALL tiers at all times — locked tiers render dim with a target
// description so users see what's next. That's the gamification hook
// (Tomás-tier dopamine) without being pushy.
const TIERS = [
  { id: 'first',  icon: '✦',   label: 'first burn',   test: s => s.burns >= 1,                 hint: 'complete your first burn' },
  { id: 'ten',    icon: '✦✦',  label: 'veteran',      test: s => s.burns >= 10,                hint: '10 burns' },
  { id: 'point1', icon: '◈',   label: 'tenth-sol',    test: s => s.lamports >= 0.1 / SOL_PER_LAMPORT, hint: 'recover 0.1 SOL total' },
  { id: 'fifty',  icon: '✦✦✦', label: 'centurion',    test: s => s.burns >= 50,                hint: '50 burns' },
  { id: 'whole',  icon: '◈◈',  label: 'whole-sol',    test: s => s.lamports >= 1   / SOL_PER_LAMPORT, hint: 'recover 1 SOL total' },
];

export function Achievements({ stats }) {
  if (!stats) return null;

  return (
    <ul className="achievements" aria-label="burn achievements">
      {TIERS.map(tier => {
        const unlocked = tier.test(stats);
        return (
          <li
            key={tier.id}
            className={`achievement ${unlocked ? 'unlocked' : 'locked'}`}
            title={unlocked ? `unlocked — ${tier.label}` : `locked — ${tier.hint}`}
          >
            <span className="ach-icon" aria-hidden="true">{tier.icon}</span>
            <span className="ach-label">{tier.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
