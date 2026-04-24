// All-time SOL-recovered counter.
//
// Data model: single doc `stats/recovered` with
//   lamports:  int (cumulative)
//   burns:     int (cumulative successful-burn count)
//   updatedAt: timestamp
//
// Seed once via the Firebase Console with your historical estimate, then the
// client increments on every successful burn. Firestore rules restrict writes
// to strict atomic increments (+1 burn, bounded lamport delta) so a rogue
// client can't substantively inflate the number — see
// basis-backend/firestore.rules → match /stats/recovered.
import {
  doc,
  onSnapshot,
  updateDoc,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

const STATS_DOC = doc(db, 'stats', 'recovered');

// Per-write cap in the rules. Keep this in sync with firestore.rules. Anything
// larger than this (e.g. a paste-into-DevTools attempt) will be rejected.
const MAX_LAMPORTS_PER_WRITE = 10_000_000_000; // 10 SOL

export function subscribeToRecoveryStats(onChange, onError) {
  return onSnapshot(
    STATS_DOC,
    (snap) => {
      if (!snap.exists()) {
        // Doc not seeded yet — report zeros so UI can still render, and the
        // first successful burn will fail its update (rules require the doc
        // to exist) without blocking the burn itself.
        onChange({ lamports: 0, burns: 0, exists: false });
        return;
      }
      const data = snap.data();
      onChange({
        lamports: Number(data.lamports ?? 0),
        burns:    Number(data.burns    ?? 0),
        exists:   true,
      });
    },
    (err) => {
      console.warn('[recoveryStats] subscription error:', err);
      onError?.(err);
    },
  );
}

// Best-effort write. Swallows errors so a Firestore hiccup doesn't surface as
// a burn failure in the UI — the burn itself already succeeded on-chain.
export async function recordRecovery(lamports) {
  if (!Number.isFinite(lamports) || lamports <= 0) return;
  if (lamports > MAX_LAMPORTS_PER_WRITE) {
    // Should never happen from our own code — individual wallet cleanups
    // recover far less than 10 SOL. But be defensive so the rules don't
    // reject us and leave counts drifting.
    console.warn(`[recoveryStats] capping ${lamports} lamports to ${MAX_LAMPORTS_PER_WRITE}`);
    lamports = MAX_LAMPORTS_PER_WRITE;
  }
  try {
    await updateDoc(STATS_DOC, {
      lamports:  increment(Math.floor(lamports)),
      burns:     increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    // Likely causes: doc not seeded yet, App Check, network. Non-fatal —
    // the user's burn already succeeded, this is only the social-proof
    // counter.
    console.warn('[recoveryStats] recordRecovery failed:', err?.message ?? err);
  }
}
