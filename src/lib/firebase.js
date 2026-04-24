// Minimal Firebase init for the public SOL-recovered counter.
// We only need Firestore. App Check is REQUIRED because project basis-acfec
// has App Check enforcement ENABLED on Firestore — without an App Check token
// every read/write fails with permission-denied, even with 'allow read: if true'
// rules. Same finding the basis-gov codebase documented (see
// basis-gov/src/firebase.js "Firestore App Check enforcement can block
// unauthenticated reads even with 'allow read: if true' rules").
import { initializeApp, getApps }                      from 'firebase/app';
import { getFirestore }                                from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider }     from 'firebase/app-check';
import { FIREBASE_CONFIG, RECAPTCHA_SITE_KEY }         from '../config';

// Guard against hot-reload double-init in dev.
const app = getApps()[0] ?? initializeApp(FIREBASE_CONFIG);

// ─── App Check ──────────────────────────────────────────────────────────────
// Uses reCAPTCHA v3. The site key is a public identifier (not a secret) — it
// ships in every Firebase web bundle that uses App Check. The corresponding
// *secret* key lives in Google Cloud and is what actually validates tokens.
//
// For this to work, the deploy domain (burn.databasis.info) and localhost (for
// dev) must be in the reCAPTCHA v3 key's allowed-domains list. The key we use
// is shared with basis-gov (dao.databasis.info); both apps live under
// databasis.info so reusing one reCAPTCHA config keeps admin simple.
//
// Dev override: set localStorage.FIREBASE_APPCHECK_DEBUG_TOKEN to 'true' in
// DevTools before first load and the SDK will mint a debug token you can paste
// into Firebase Console → App Check → Apps → Manage debug tokens. That's the
// escape hatch when working on localhost without adding it to reCAPTCHA.
if (typeof window !== 'undefined') {
  // Opt-in debug mode — only enable when the dev explicitly sets the flag, so
  // production users never see App Check debug-token warnings in their console.
  if (localStorage.getItem('FIREBASE_APPCHECK_DEBUG_TOKEN') === 'true') {
    // eslint-disable-next-line no-undef
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    // Double-init (hot reload) throws; ignore. Other errors we swallow too —
    // the counter is non-critical and burning still works without it.
    if (!String(err?.message ?? '').includes('already-initialized')) {
      console.warn('[firebase] App Check init failed:', err?.message ?? err);
    }
  }
}

export const db = getFirestore(app);
