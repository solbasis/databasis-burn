// Generates the Open Graph / Twitter / Telegram preview card for
// burn.databasis.info as a 1200×630 PNG.
//
// Usage:
//   node scripts/build-social-card.mjs
//
// Run locally whenever the brand visuals change. The generated PNG is
// committed to the repo so CI doesn't need the @resvg/resvg-js dependency.
//
// Design language matches the in-app aesthetic:
//   - black phosphor-CRT background with subtle scanline texture
//   - bracketed corner frame echoing the in-app counter chrome
//   - big display-mono headline with a red "BURN" accent
//   - flame mark on the left, supporting copy on the right
//   - status row at the top (live · burn.databasis.info)
//
// Fonts: we use the generic `monospace` and `serif` families so resvg
// substitutes whatever's available locally. The output is rendered ONCE
// on the dev's machine and committed; CI just serves the PNG.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const W = 1200;
const H = 630;

// Brand tokens — kept in sync with src/index.css :root variables so the
// preview reads as the same product as the live site.
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
};

// Single-path stylized flame — same shape language as favicon.svg, scaled up.
const flamePath = `
  M250 80
  C 200 200, 150 250, 150 360
  C 150 415, 175 455, 200 470
  C 175 430, 195 380, 230 360
  C 215 430, 250 470, 270 510
  C 295 460, 330 420, 345 360
  C 380 395, 390 450, 380 510
  C 415 485, 450 440, 450 365
  C 450 245, 320 195, 250 80 Z
`;

// Build the SVG markup. Long template literal so it's easy to tweak the
// design without leaving this file. Coordinates are in 1200×630 space.
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bgGlow" cx="30%" cy="30%" r="70%">
      <stop offset="0%"  stop-color="${C.bg2}"/>
      <stop offset="60%" stop-color="${C.bg}"/>
      <stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <linearGradient id="flameGrad" x1="50%" y1="100%" x2="50%" y2="0%">
      <stop offset="0%"  stop-color="${C.green}"/>
      <stop offset="55%" stop-color="${C.greenBri}"/>
      <stop offset="100%" stop-color="${C.greenHot}"/>
    </linearGradient>
    <filter id="flameGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="14"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <pattern id="scan" width="6" height="6" patternUnits="userSpaceOnUse">
      <rect width="6" height="1" fill="rgba(120,177,90,0.04)"/>
    </pattern>
  </defs>

  <!-- Background field -->
  <rect width="${W}" height="${H}" fill="url(#bgGlow)"/>
  <rect width="${W}" height="${H}" fill="url(#scan)"/>

  <!-- Outer bracket frame (cheap terminal flavor — four corner L-shapes) -->
  <g stroke="${C.border}" stroke-width="2" fill="none">
    <!-- TL --><path d="M 36 86 L 36 36 L 86 36"/>
    <!-- TR --><path d="M ${W - 86} 36 L ${W - 36} 36 L ${W - 36} 86"/>
    <!-- BL --><path d="M 36 ${H - 86} L 36 ${H - 36} L 86 ${H - 36}"/>
    <!-- BR --><path d="M ${W - 86} ${H - 36} L ${W - 36} ${H - 36} L ${W - 36} ${H - 86}"/>
  </g>

  <!-- Status strip — top-left -->
  <g font-family="monospace" font-size="20" letter-spacing="3">
    <circle cx="80" cy="80" r="6" fill="${C.greenHot}"/>
    <text x="98" y="86" fill="${C.greenBri}" font-weight="500">LIVE</text>
    <text x="160" y="86" fill="${C.textMute}">·</text>
    <text x="180" y="86" fill="${C.textDim}">SOLANA MAINNET</text>
    <text x="395" y="86" fill="${C.textMute}">·</text>
    <text x="415" y="86" fill="${C.textDim}">FEE 0%</text>
  </g>

  <!-- URL — top-right -->
  <text x="${W - 60}" y="86" text-anchor="end"
        font-family="monospace" font-size="22" letter-spacing="2"
        fill="${C.greenBri}" font-weight="500">
    burn.databasis.info
  </text>

  <!-- Flame mark — left side. Translated and scaled to fill ~480px of vertical space. -->
  <g transform="translate(60, 130)" filter="url(#flameGlow)">
    <path d="${flamePath}" fill="url(#flameGrad)"/>
  </g>
  <!-- Flame inner highlight (no glow filter so it stays crisp) -->
  <g transform="translate(60, 130)">
    <path d="
      M 250 200
      C 220 270, 210 300, 215 340
      C 220 360, 240 365, 245 360
      C 235 330, 255 290, 280 270
      C 280 320, 305 340, 305 320
      C 305 270, 285 230, 250 200 Z
    " fill="#ffffff" fill-opacity="0.45"/>
  </g>

  <!-- Headline — right side block. Anchor at left edge x=580. -->
  <g font-family="monospace">
    <!-- Eyebrow -->
    <text x="580" y="232" fill="${C.textMute}"
          font-size="22" letter-spacing="6">
      TERMINAL · V1
    </text>

    <!-- Big headline. "BASIS" green, "BURN" red — matches the in-app accent. -->
    <text x="580" y="320" fill="${C.greenBri}"
          font-size="92" letter-spacing="4" font-weight="600">
      BASIS
    </text>
    <text x="580" y="408" fill="${C.red}"
          font-size="92" letter-spacing="4" font-weight="600"
          style="filter: drop-shadow(0 0 24px ${C.redGlow});">
      BURN
    </text>

    <!-- Tagline -->
    <text x="580" y="465" fill="${C.greenBri}"
          font-size="26" letter-spacing="6">
      CLOSE · BURN · RECOVER
    </text>

    <!-- Sub tagline -->
    <text x="580" y="510" fill="${C.textDim}"
          font-size="22" letter-spacing="1">
      reclaim SOL locked in empty accounts, dust, and unwanted NFTs
    </text>
  </g>

  <!-- Feature pills — bottom, right column -->
  <g font-family="monospace" font-size="18" letter-spacing="3" font-weight="500">
    <g transform="translate(580, 540)">
      <rect width="170" height="42" rx="21" fill="rgba(120,177,90,0.08)" stroke="${C.border}"/>
      <text x="85" y="28" text-anchor="middle" fill="${C.greenBri}">100% FREE</text>
    </g>
    <g transform="translate(770, 540)">
      <rect width="170" height="42" rx="21" fill="rgba(120,177,90,0.08)" stroke="${C.border}"/>
      <text x="85" y="28" text-anchor="middle" fill="${C.greenBri}">NO FEES</text>
    </g>
    <g transform="translate(960, 540)">
      <rect width="180" height="42" rx="21" fill="rgba(120,177,90,0.08)" stroke="${C.border}"/>
      <text x="90" y="28" text-anchor="middle" fill="${C.greenBri}">OPEN SOURCE</text>
    </g>
  </g>
</svg>
`;

const outDir = resolve(ROOT, 'public');
mkdirSync(outDir, { recursive: true });

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: W },
  background: C.bg,
  font: {
    // Generic-family fallback. resvg uses fontconfig (Linux) or the system
    // font enumerator (Windows/Mac) to substitute. Output uses whatever
    // monospace happens to be available on the dev machine.
    defaultFontFamily: 'monospace',
    loadSystemFonts: true,
  },
});

const png = resvg.render().asPng();
writeFileSync(resolve(outDir, 'preview.png'), png);
console.log(`✓ wrote public/preview.png (${(png.length / 1024).toFixed(1)} KB)`);

// Also emit a 32×32 PNG fallback favicon for platforms that prefer raster
// (some social previews + older browsers without SVG-favicon support).
const favSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" ry="14" fill="${C.bg2}"/>
  <rect x="2.5" y="2.5" width="59" height="59" rx="12" ry="12" fill="none" stroke="${C.green}" stroke-opacity="0.30" stroke-width="1"/>
  <path fill="${C.greenHot}" d="M32 8 C 27 18, 22 22, 22 31 C 22 35, 24 38, 26 39 C 24 36, 25 32, 28 30 C 27 36, 30 39, 32 42 C 34 38, 37 35, 38 30 C 41 33, 42 38, 41 42 C 44 40, 47 36, 47 31 C 47 22, 38 17, 32 8 Z"/>
</svg>`;
const favPng = new Resvg(favSvg, { fitTo: { mode: 'width', value: 32 } }).render().asPng();
writeFileSync(resolve(outDir, 'favicon.png'), favPng);
console.log(`✓ wrote public/favicon.png (${(favPng.length / 1024).toFixed(1)} KB)`);
