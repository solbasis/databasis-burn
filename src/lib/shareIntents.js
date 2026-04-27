// Brag-copy templates + Twitter/Telegram intent URL builders.
//
// Neither X intent (https://twitter.com/intent/tweet) nor Telegram share
// (https://t.me/share/url) accepts an image attachment via URL — image has
// to be on the user's clipboard or drag-from-downloads. Pattern: copy the
// generated card to clipboard first, then open the intent. User pastes
// (Ctrl+V) and posts. Fallback to auto-download for browsers without
// Clipboard.write support.

const SITE_URL    = 'https://burn.databasis.info';
const TWITTER_TAG = '@solbasis';

/**
 * Compose a context-aware brag tweet. Adapts to:
 *   - cNFT-only burns (no SOL recovered, just spam removed)
 *   - tier unlocks (e.g. "just hit centurion")
 *   - regular SOL recovery (default)
 */
export function buildBragText({ recoveredLamports, succeeded, tier }) {
  const SOL_PER_LAMPORT = 1e-9;
  const sol = (Number(recoveredLamports || 0) * SOL_PER_LAMPORT).toFixed(4);

  const cnfts = succeeded?.cnfts?.length || 0;
  const empty = succeeded?.empty?.length || 0;
  const tokens = succeeded?.tokens?.length || 0;
  const nfts = succeeded?.nfts?.length || 0;
  const cnftOnly = empty === 0 && tokens === 0 && nfts === 0 && cnfts > 0;

  if (cnftOnly) {
    return `just torched ${cnfts} spam cNFT${cnfts === 1 ? '' : 's'} with ${TWITTER_TAG} BASIS BURN — wallet's clean now 🔥 ${SITE_URL}`;
  }

  // Tier-mention copy fires only when a tier is present (we always pass
  // the *currently highest unlocked* tier, so this fires for every burn
  // by a holder with at least one tier).
  if (tier?.label) {
    return `just recovered ${sol} SOL with ${TWITTER_TAG} BASIS BURN — ${tier.label.toLowerCase()} tier unlocked 🔥 ${SITE_URL}`;
  }

  return `just recovered ${sol} SOL with ${TWITTER_TAG} BASIS BURN — wallet's lighter, bag's heavier 🔥 ${SITE_URL}`;
}

/** Open Twitter/X compose in a new tab with the brag text pre-filled. */
export function openTwitterIntent(text) {
  const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Open Telegram share in a new tab with the brag text + URL pre-filled. */
export function openTelegramIntent(text) {
  const url = `https://t.me/share/url?url=${encodeURIComponent(SITE_URL)}&text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}
