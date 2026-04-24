const HELIUS_KEY = import.meta.env.VITE_HELIUS_KEY;
export const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
export const HELIUS_API = `https://api.helius.xyz/v0`;
export const HELIUS_DAS = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

export const SOL_PER_LAMPORT = 1e-9;
export const RENT_PER_ACCOUNT = 0.00203928;

// ─── Firebase (shared basis-acfec project) ───────────────────────────────────
// Used only for the public all-time SOL-recovered counter. Hardcoded because
// Firebase web-config values are not secrets — every Firebase web app ships
// them in its client bundle. Security lives in Firestore rules:
// basis-backend/firestore.rules → match /stats/recovered restricts writes to
// strict atomic increments with per-write caps.
export const FIREBASE_CONFIG = {
  apiKey:            'AIzaSyC7OkG3MjuQ55pNw4UEV16BlPXxMSWyfUc',
  authDomain:        'basis-acfec.firebaseapp.com',
  projectId:         'basis-acfec',
  storageBucket:     'basis-acfec.firebasestorage.app',
  messagingSenderId: '884887459105',
  appId:             '1:884887459105:web:cb86a455ffecc7d3271a60',
};

// reCAPTCHA v3 site key for Firebase App Check.
// PUBLIC VALUE — ships in every Firebase web bundle that uses App Check. The
// secret key lives in Google Cloud and is what validates tokens. Shared with
// basis-gov (dao.databasis.info) since both apps live under *.databasis.info;
// add burn.databasis.info to this key's allowed-domains list in the reCAPTCHA
// Admin Console if it isn't already there.
export const RECAPTCHA_SITE_KEY = '6LdtEKIsAAAAAHAHowzhBeoVeNUuALU0WDWxT1lv';
