import { useState } from 'react';
import {
  buildShareCardSvg,
  svgToPngBlob,
  downloadBlob,
  copyImageToClipboard,
  highestTier,
} from '../lib/shareCard';
import {
  buildBragText,
  openTwitterIntent,
  openTelegramIntent,
} from '../lib/shareIntents';

// Four-button row shown in the burn-success modal:
//   [↓ download] [tweet] [telegram] [⎘ copy]
//
// The image is regenerated on each click rather than once-up-front, so the
// modal doesn't pay the (~150ms) rasterisation cost unless the user actually
// shares. Generated blobs are short-lived and not retained.
//
// Tweet + Telegram both copy the image to the user's clipboard first (or
// fall back to download if the Clipboard API is unavailable) and then open
// the platform's compose intent. The user pastes (Ctrl+V) and posts.
//
// Reused later for achievement-unlock cards by passing different `tier` data.
export function ShareButtons({ recoveredLamports, succeeded, walletAddress, userStats }) {
  const [working,  setWorking]  = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2400);
  };

  // Stable card data — derived once per render from props.
  const walletShort = walletAddress
    ? `${walletAddress.slice(0, 4)}…${walletAddress.slice(-4)}`
    : null;
  const tier = highestTier(userStats);
  const cardData = { recoveredLamports, succeeded, walletShort, tier };

  // Generate the PNG blob from the SVG. Caches nothing — fresh blob each call.
  const generate = async () => {
    const svg = buildShareCardSvg(cardData);
    return await svgToPngBlob(svg);
  };

  const filename = () => `basis-burn-${Date.now()}.png`;

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleDownload = async () => {
    if (working) return;
    setWorking(true);
    try {
      const blob = await generate();
      downloadBlob(blob, filename());
      showToast('image downloaded ✓');
    } catch (err) {
      console.warn('[share] download failed:', err);
      showToast('couldn’t generate image');
    } finally {
      setWorking(false);
    }
  };

  const handleCopy = async () => {
    if (working) return;
    setWorking(true);
    try {
      const blob = await generate();
      try {
        await copyImageToClipboard(blob);
        showToast('image copied to clipboard ✓');
      } catch {
        // Fallback for browsers without Clipboard API (Safari < 13.4, etc.)
        downloadBlob(blob, filename());
        showToast('clipboard not supported — downloaded instead');
      }
    } catch (err) {
      console.warn('[share] copy failed:', err);
      showToast('couldn’t generate image');
    } finally {
      setWorking(false);
    }
  };

  const handleSocial = async (platform) => {
    if (working) return;
    setWorking(true);
    const text = buildBragText(cardData);
    try {
      const blob = await generate();
      try {
        await copyImageToClipboard(blob);
        showToast('image copied — paste in your post (Ctrl+V)');
      } catch {
        downloadBlob(blob, filename());
        showToast('image downloaded — drag into your post');
      }
    } catch (err) {
      console.warn('[share] generate failed:', err);
      // Even if image generation fails, still open the intent so the user
      // can post the brag text without the image.
    } finally {
      setWorking(false);
    }
    // Slight delay before opening the intent so the toast is readable
    // and the clipboard write definitely landed.
    setTimeout(() => {
      if (platform === 'twitter') openTwitterIntent(text);
      else if (platform === 'telegram') openTelegramIntent(text);
    }, 250);
  };

  return (
    <div className="share-block">
      <div className="share-row" role="group" aria-label="Share burn results">
        <button
          className="share-btn share-btn-dl"
          onClick={handleDownload}
          disabled={working}
          aria-label="Download share image"
          title="Download as PNG"
        >
          <span className="share-icon" aria-hidden="true">↓</span>
          <span className="share-label">image</span>
        </button>

        <button
          className="share-btn share-btn-x"
          onClick={() => handleSocial('twitter')}
          disabled={working}
          aria-label="Share on X (Twitter)"
          title="Tweet — image goes to clipboard, paste in compose"
        >
          <span className="share-icon" aria-hidden="true">𝕏</span>
          <span className="share-label">tweet</span>
        </button>

        <button
          className="share-btn share-btn-tg"
          onClick={() => handleSocial('telegram')}
          disabled={working}
          aria-label="Share on Telegram"
          title="Telegram — image goes to clipboard, paste in chat"
        >
          <span className="share-icon" aria-hidden="true">✈</span>
          <span className="share-label">telegram</span>
        </button>

        <button
          className="share-btn share-btn-cp"
          onClick={handleCopy}
          disabled={working}
          aria-label="Copy image to clipboard"
          title="Copy image to clipboard"
        >
          <span className="share-icon" aria-hidden="true">⎘</span>
          <span className="share-label">copy</span>
        </button>
      </div>

      {toastMsg && (
        <div className="share-toast" role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
