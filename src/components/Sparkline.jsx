// Tiny SVG sparkline showing the connected wallet's recent burn history.
// X-axis is index (oldest → newest), Y-axis is lamports recovered per burn.
//
// Renders nothing when there are < 2 points — a single point can't form a
// line and a one-burn wallet doesn't need a chart yet. We deliberately do
// NOT plot against real elapsed time; even spacing reads more clearly at
// 120×28px than a time-axis would, and "your trend" matters more than
// "your cadence" for this audience.

const W = 140;
const H = 30;
const PAD = 3;

export function Sparkline({ history }) {
  if (!Array.isArray(history) || history.length < 2) return null;

  const values = history.map(h => h.lamports);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);  // avoid div-by-zero on flat history

  // Map (index, lamports) → (x, y) in the SVG viewport.
  const points = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
    return [x, y];
  });

  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  // Closed area path under the line for the soft glow fill.
  const areaPath = `${linePath} L${points[points.length - 1][0].toFixed(2)},${H - PAD} L${points[0][0].toFixed(2)},${H - PAD} Z`;

  const lastPoint = points[points.length - 1];

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      role="img"
      aria-label={`burn history sparkline, ${history.length} points`}
    >
      {/* Soft fill under the line — gives the chart presence even at small sizes */}
      <path d={areaPath} className="sparkline-fill" />
      <path d={linePath} className="sparkline-line" />
      {/* Pulsing dot on the most-recent point */}
      <circle cx={lastPoint[0]} cy={lastPoint[1]} r="2" className="sparkline-dot" />
    </svg>
  );
}
