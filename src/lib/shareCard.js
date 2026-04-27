// Generates a 1200×630 PNG share card after a successful burn.
//
// Architecture: build an SVG string in memory → load as <img> → draw onto a
// hidden canvas → canvas.toBlob('image/png') → return Blob. All in-browser,
// no deps, ~150ms for the whole pipeline on a modern machine.
//
// We deliberately do NOT use @resvg/resvg-js here — that's a Node-only
// native binding (it lives in our devDeps for the build-time OG preview).
// The browser equivalent (@resvg/resvg-wasm) would add ~1.5MB of WASM for
// something the browser already does natively. Keep the SVG generator a pure
// function so we can swap rasterizers later if we ever want to.
//
// Reused for: post-burn share, future achievement-unlock cards.

import { SOL_PER_LAMPORT } from '../config';

const W = 1200;
const H = 630;

// Brand tokens — match src/index.css :root variables. Hex values inlined so
// the SVG renders identically regardless of CSS-variable scope.
const C = {
  bg:        '#060904',
  bg2:       '#0a1408',
  green:     '#78b15a',
  greenBri:  '#a4e07e',
  greenHot:  '#c2f08e',
  red:       '#ff6a6a',
  redGlow:   'rgba(255,106,106,0.55)',
  border:    'rgba(120,177,90,0.32)',
  borderHi:  'rgba(120,177,90,0.55)',
  textDim:   'rgba(140,190,118,0.66)',
  textMute:  'rgba(130,180,108,0.42)',
  text:      'rgba(176,225,148,0.96)',
  warn:      '#d8a93a',
};

// Tier definitions match src/components/Achievements.jsx so the card stays
// in sync with what the user sees in the dashboard. We only display the
// HIGHEST currently-unlocked tier on the card — keeps the layout clean.
const TIERS = [
  { id: 'whole',  icon: '◈◈',  label: 'WHOLE SOL',  test: s => s.lamports >= 1   / SOL_PER_LAMPORT },
  { id: 'fifty',  icon: '✦✦✦', label: 'CENTURION',  test: s => s.burns >= 50 },
  { id: 'point1', icon: '◈',   label: 'TENTH SOL',  test: s => s.lamports >= 0.1 / SOL_PER_LAMPORT },
  { id: 'ten',    icon: '✦✦',  label: 'VETERAN',    test: s => s.burns >= 10 },
  { id: 'first',  icon: '✦',   label: 'FIRST BURN', test: s => s.burns >= 1 },
];

export function highestTier(stats) {
  if (!stats) return null;
  return TIERS.find(t => t.test(stats)) || null;
}

// Stylized flame path — reuses the favicon shape so the share card and
// favicon read as one product. Coordinates are for a 64×64 viewBox; we
// translate+scale at use site.
const FLAME_PATH = 'M32 8 C 27 18, 22 22, 22 31 C 22 35, 24 38, 26 39 C 24 36, 25 32, 28 30 C 27 36, 30 39, 32 42 C 34 38, 37 35, 38 30 C 41 33, 42 38, 41 42 C 44 40, 47 36, 47 31 C 47 22, 38 17, 32 8 Z';

// Escape user-provided text for safe SVG embedding. Defensive — wallet
// addresses and tier labels are already sanitised upstream, but never trust.
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Build the SVG markup for a post-burn share card.
 *
 * @param {object} input
 * @param {number} input.recoveredLamports — total SOL recovered, in lamports
 * @param {object} input.succeeded — { empty:[], tokens:[], nfts:[], cnfts:[] }
 *                                   from useBurn's status.succeeded
 * @param {string|null} input.walletShort — short-form like "41ic…1rhG", optional
 * @param {object|null} input.tier — { icon, label } from highestTier(), optional
 * @returns {string} SVG markup (UTF-8 string ready to blob)
 */
export function buildShareCardSvg({ recoveredLamports, succeeded, walletShort, tier }) {
  const sol = (Number(recoveredLamports || 0) * SOL_PER_LAMPORT).toFixed(4);

  const counts = {
    empty:  succeeded?.empty?.length  || 0,
    tokens: succeeded?.tokens?.length || 0,
    nfts:   succeeded?.nfts?.length   || 0,
    cnfts:  succeeded?.cnfts?.length  || 0,
  };
  const totalItems = counts.empty + counts.tokens + counts.nfts + counts.cnfts;
  const cnftOnly = counts.empty === 0 && counts.tokens === 0 && counts.nfts === 0 && counts.cnfts > 0;

  // Build the items line (e.g. "12 empty · 3 tokens · 1 NFT")
  const itemPieces = [];
  if (counts.empty)  itemPieces.push(`${counts.empty} empty`);
  if (counts.tokens) itemPieces.push(`${counts.tokens} ${counts.tokens === 1 ? 'token' : 'tokens'}`);
  if (counts.nfts)   itemPieces.push(`${counts.nfts} ${counts.nfts === 1 ? 'NFT' : 'NFTs'}`);
  if (counts.cnfts && !cnftOnly)
                     itemPieces.push(`${counts.cnfts} ${counts.cnfts === 1 ? 'cNFT' : 'cNFTs'}`);
  const itemsLine = itemPieces.join('  ·  ') || '—';

  // Center middle-section content depending on whether SOL was recovered
  const middleSection = cnftOnly
    ? `
      <text x="600" y="270" text-anchor="middle" font-family="monospace" font-size="22" fill="${C.textDim}" letter-spacing="6">REMOVED</text>
      <text x="600" y="395" text-anchor="middle" font-family="monospace" font-size="120" fill="${C.greenHot}" font-weight="700" letter-spacing="2">${counts.cnfts}</text>
      <text x="600" y="445" text-anchor="middle" font-family="monospace" font-size="32" fill="${C.greenBri}" letter-spacing="6">${counts.cnfts === 1 ? 'cNFT' : 'cNFTs'}</text>
      <text x="600" y="495" text-anchor="middle" font-family="monospace" font-size="20" fill="${C.text}" letter-spacing="1">no rent locked — wallet's clean now</text>
    `
    : `
      <text x="600" y="270" text-anchor="middle" font-family="monospace" font-size="22" fill="${C.textDim}" letter-spacing="6">RECOVERED</text>
      <text x="600" y="395" text-anchor="middle" font-family="monospace" font-size="138" fill="${C.greenHot}" font-weight="700" letter-spacing="2">${sol}</text>
      <text x="600" y="445" text-anchor="middle" font-family="monospace" font-size="32" fill="${C.greenBri}" letter-spacing="8">SOL</text>
      <text x="600" y="500" text-anchor="middle" font-family="monospace" font-size="22" fill="${C.text}" letter-spacing="2">${esc(itemsLine)}</text>
    `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bgGlow" cx="30%" cy="25%" r="80%">
      <stop offset="0%"   stop-color="${C.bg2}"/>
      <stop offset="60%"  stop-color="${C.bg}"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <linearGradient id="flameGrad" x1="50%" y1="100%" x2="50%" y2="0%">
      <stop offset="0%"   stop-color="${C.green}"/>
      <stop offset="55%"  stop-color="${C.greenBri}"/>
      <stop offset="100%" stop-color="${C.greenHot}"/>
    </linearGradient>
    <pattern id="scan" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="1" fill="rgba(120,177,90,0.04)"/>
    </pattern>
  </defs>

  <!-- Background -->
  <rect width="${W}" height="${H}" fill="url(#bgGlow)"/>
  <rect width="${W}" height="${H}" fill="url(#scan)"/>

  <!-- Corner brackets — matches the OG preview card's terminal frame -->
  <g stroke="${C.border}" stroke-width="2" fill="none">
    <path d="M 36 86 L 36 36 L 86 36"/>
    <path d="M ${W - 86} 36 L ${W - 36} 36 L ${W - 36} 86"/>
    <path d="M 36 ${H - 86} L 36 ${H - 36} L 86 ${H - 36}"/>
    <path d="M ${W - 86} ${H - 36} L ${W - 36} ${H - 36} L ${W - 36} ${H - 86}"/>
  </g>

  <!-- Top-left: flame mark + BASIS BURN logo -->
  <g transform="translate(60, 70) scale(0.85)">
    <path d="${FLAME_PATH}" fill="url(#flameGrad)"/>
  </g>
  <text x="130" y="100" font-family="monospace" font-size="34" font-weight="600" letter-spacing="3" fill="${C.greenBri}">BASIS</text>
  <text x="262" y="100" font-family="monospace" font-size="34" font-weight="600" letter-spacing="3" fill="${C.red}">BURN</text>
  <text x="130" y="125" font-family="monospace" font-size="13" letter-spacing="4" fill="${C.textDim}">CLOSE · BURN · RECOVER</text>

  <!-- Top-right: URL -->
  <text x="${W - 60}" y="100" text-anchor="end" font-family="monospace" font-size="22" font-weight="500" letter-spacing="2" fill="${C.greenBri}">burn.databasis.info</text>

  <!-- Center: big stat -->
  ${middleSection}

  <!-- Bottom-left: achievement tier -->
  ${tier ? `<g>
    <text x="60" y="572" font-family="monospace" font-size="22" letter-spacing="2" fill="${C.greenHot}">${esc(tier.icon)}</text>
    <text x="100" y="572" font-family="monospace" font-size="16" letter-spacing="3" fill="${C.greenBri}">${esc(tier.label)}</text>
  </g>` : ''}

  <!-- Bottom-right: wallet short (optional) -->
  ${walletShort ? `<text x="${W - 60}" y="572" text-anchor="end" font-family="monospace" font-size="16" letter-spacing="2" fill="${C.textDim}">${esc(walletShort)}</text>` : ''}

  <!-- Bottom-center: subtle status pip -->
  <circle cx="600" cy="570" r="4" fill="${C.greenBri}" opacity="0.7"/>
  <text x="612" y="574" font-family="monospace" font-size="11" letter-spacing="3" fill="${C.textMute}">SOLANA MAINNET</text>
</svg>`;
}

/**
 * Convert SVG markup to a PNG Blob via the browser's native SVG → Canvas
 * pipeline. Resolves with the Blob; rejects on load failure.
 */
export function svgToPngBlob(svgString) {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      reject(new Error('svgToPngBlob requires a browser'));
      return;
    }

    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const objectUrl = URL.createObjectURL(svgBlob);
    const img = new Image();

    // Some browsers refuse to draw cross-origin SVG — set the flag
    // defensively even though we're using an object URL.
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');
        // Paint the bg once before drawImage so the PNG isn't transparent
        // anywhere the SVG paths don't cover.
        ctx.fillStyle = C.bg;
        ctx.fillRect(0, 0, W, H);
        ctx.drawImage(img, 0, 0, W, H);
        URL.revokeObjectURL(objectUrl);
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null')),
          'image/png',
        );
      } catch (err) {
        URL.revokeObjectURL(objectUrl);
        reject(err);
      }
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load SVG into Image: ' + (err?.message ?? err)));
    };
    img.src = objectUrl;
  });
}

/** Trigger a browser download of the given Blob with the given filename. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Cleanup the DOM + object URL after the click handler has fired.
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

/**
 * Copy a PNG Blob to the system clipboard via the modern Clipboard API.
 * Throws if the API is unavailable (Safari < 13.4, some mobile browsers,
 * cross-origin contexts) — caller should fall back to download.
 */
export async function copyImageToClipboard(blob) {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Clipboard API not available in this browser');
  }
  await navigator.clipboard.write([
    new ClipboardItem({ 'image/png': blob }),
  ]);
}
