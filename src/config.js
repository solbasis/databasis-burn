export const BASIS_MINT = 'A5BJBQUTR5sTzkM89hRDuApWyvgjdXpR7B7rW1r9pump';
// pump.fun-lineage tokens: 6 decimals.
export const BASIS_DECIMALS = 6;

const HELIUS_KEY = import.meta.env.VITE_HELIUS_KEY;
export const RPC_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
export const HELIUS_API = `https://api.helius.xyz/v0`;
export const HELIUS_DAS = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

// Jupiter Ultra v1 — the older `quote-api.jup.ag/v6` domain was decommissioned,
// and the replacement `lite-api.jup.ag/swap/v1` filters out pump.fun AMM pools,
// which is where BASIS trades. Ultra keeps pump.fun routes, needs no API key,
// and whitelists CORS for burn.databasis.info. Flow is:
//   GET  /order   → quote + unsigned VersionedTransaction + requestId
//   POST /execute → Jupiter relays & confirms the signed tx for us
export const JUPITER_ULTRA_API = 'https://lite-api.jup.ag/ultra/v1';

export const SOL_PER_LAMPORT = 1e-9;
export const RENT_PER_ACCOUNT = 0.00203928;
