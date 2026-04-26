// Per-user cumulative burn tracker.
//
// Why localStorage instead of Firestore:
//   Firestore would sync across devices, but we'd need either (a) wallet-sig
//   verification on every write (complex, gas-free signing flow) or (b) trust
//   the client — in which case anyone could inflate anyone else's number by
//   writing to their doc. For a "your personal counter" feature the right
//   tradeoff is localStorage: per-browser, griefer-proof (nobody else can
//   write your key), no auth, no extra RPC.
//
// Data model: one JSON blob per wallet, under a namespaced key so this
// never collides with other Basis apps sharing localStorage:
//   basis-burn:user-stats:<walletAddress> → {
//     lamports:    int (cumulative)
//     burns:       int (cumulative count)
//     firstBurnAt: epoch-ms
//     lastBurnAt:  epoch-ms
//     history:     [{ t: epoch-ms, lamports: int }, ...] (capped, newest last)
//   }
//
// `history` powers the per-user sparkline + tier achievements without ever
// hitting RPC or Firestore. Capped to HISTORY_MAX entries so a wallet with
// thousands of burns can't blow up localStorage (typical quota is 5–10MB
// per origin and we're sharing it with the recoveryStats subscription).

const KEY_PREFIX = 'basis-burn:user-stats:';
const HISTORY_MAX = 60;

function storageKey(walletAddress) {
  return `${KEY_PREFIX}${walletAddress}`;
}

const EMPTY_STATS = Object.freeze({
  lamports:    0,
  burns:       0,
  firstBurnAt: null,
  lastBurnAt:  null,
  history:     [],
});

// In-memory pub-sub so same-tab updates (burn just succeeded) trigger a
// re-render. The native `storage` event only fires cross-tab.
const listeners = new Map(); // walletAddress → Set<(stats) => void>

function emit(walletAddress) {
  const set = listeners.get(walletAddress);
  if (!set || set.size === 0) return;
  const stats = getUserStats(walletAddress);
  for (const fn of set) {
    try { fn(stats); } catch (err) {
      console.warn('[userStats] listener threw:', err);
    }
  }
}

export function getUserStats(walletAddress) {
  if (!walletAddress) return { ...EMPTY_STATS, history: [] };
  try {
    const raw = localStorage.getItem(storageKey(walletAddress));
    if (!raw) return { ...EMPTY_STATS, history: [] };
    const parsed = JSON.parse(raw);
    // Defensive: old/corrupt values shouldn't crash the UI.
    return {
      lamports:    Number(parsed.lamports ?? 0) || 0,
      burns:       Number(parsed.burns    ?? 0) || 0,
      firstBurnAt: parsed.firstBurnAt ?? null,
      lastBurnAt:  parsed.lastBurnAt  ?? null,
      // Migrate gracefully: pre-history blobs return [].
      history: Array.isArray(parsed.history)
        ? parsed.history
            .filter(e => e && Number.isFinite(e.t) && Number.isFinite(e.lamports))
            .slice(-HISTORY_MAX)
        : [],
    };
  } catch (err) {
    console.warn('[userStats] getUserStats failed:', err?.message ?? err);
    return { ...EMPTY_STATS, history: [] };
  }
}

// Fire-and-forget write called from the burn pipeline. Mirrors recordRecovery
// in recoveryStats.js — swallows its own errors so a localStorage hiccup
// (e.g. quota exceeded, private-mode Safari) can never surface as a burn
// failure. The on-chain burn has already succeeded by the time this runs.
export function recordUserBurn(walletAddress, lamports) {
  if (!walletAddress) return;
  if (!Number.isFinite(lamports) || lamports <= 0) return;
  try {
    const current = getUserStats(walletAddress);
    const now = Date.now();
    const flooredLamports = Math.floor(lamports);
    const next = {
      lamports:    current.lamports + flooredLamports,
      burns:       current.burns + 1,
      firstBurnAt: current.firstBurnAt ?? now,
      lastBurnAt:  now,
      // Append newest entry, drop oldest if cap exceeded. Keeps the array
      // bounded at HISTORY_MAX so localStorage usage stays predictable.
      history: [
        ...current.history.slice(-(HISTORY_MAX - 1)),
        { t: now, lamports: flooredLamports },
      ],
    };
    localStorage.setItem(storageKey(walletAddress), JSON.stringify(next));
    emit(walletAddress);
  } catch (err) {
    console.warn('[userStats] recordUserBurn failed:', err?.message ?? err);
  }
}

// Subscribe to updates for a single wallet. Immediately emits the current
// value, then re-emits after every recordUserBurn call (same tab) and after
// `storage` events (other tab touched the same key). Returns an unsub fn.
export function subscribeToUserStats(walletAddress, onChange) {
  if (!walletAddress) {
    // Still emit an empty snapshot so consumers can clear their UI on
    // disconnect without special-casing the null path.
    onChange({ ...EMPTY_STATS, history: [] });
    return () => {};
  }

  let set = listeners.get(walletAddress);
  if (!set) {
    set = new Set();
    listeners.set(walletAddress, set);
  }
  set.add(onChange);

  // Prime with current value.
  onChange(getUserStats(walletAddress));

  // Cross-tab: another tab on the same origin wrote to our key.
  const storageHandler = (e) => {
    if (e.key === storageKey(walletAddress)) {
      onChange(getUserStats(walletAddress));
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', storageHandler);
  }

  return () => {
    set.delete(onChange);
    if (set.size === 0) listeners.delete(walletAddress);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', storageHandler);
    }
  };
}
