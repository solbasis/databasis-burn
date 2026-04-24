// Minimal Firebase init for the public SOL-recovered counter.
// We only need Firestore — no Auth, no Storage, no App Check. The counter is
// rule-gated at the Firestore level (atomic increments, per-write caps).
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { FIREBASE_CONFIG } from '../config';

// Guard against hot-reload double-init in dev.
const app = getApps()[0] ?? initializeApp(FIREBASE_CONFIG);

export const db = getFirestore(app);
