import React, { useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import App from './App';
import { RPC_URL } from './config';
import './index.css';
import '@solana/wallet-adapter-react-ui/styles.css';

// Wallet Standard auto-discovery handles every Wallet-Standard-compliant
// wallet — Phantom, Solflare, Backpack, Jupiter (mobile in-app browser),
// Glow, Trust, Coinbase, etc. — without us listing them explicitly.
//
// Why an empty legacy wallets array instead of `new PhantomWalletAdapter()`
// + `new SolflareWalletAdapter()` like the previous version:
//
// 1. Mobile wallet in-app browsers (Jupiter, Phantom, Solflare) inject
//    their Standard wallet object asynchronously after page load. With
//    explicit legacy adapters listed, the modal shows Phantom + Solflare
//    rows even when the user is inside Jupiter's browser — confusing and
//    breaks connect (Jupiter never appears, the listed adapters target
//    a wallet that isn't there).
// 2. Empty array → Wallet Standard auto-discovery is the only path.
//    The modal lists exactly the wallets actually present in the user's
//    browser environment, including any in-app wallet provider.
// 3. Legacy adapters re-instantiated on every render caused subscription
//    thrash; the useMemo'd empty array is a stable reference.
// 4. Future-proof: new Standard-compliant wallets appear in the modal
//    automatically with no code changes.
//
// Reference: @solana/wallet-adapter-react v0.15.30+ README:
//   "If you only need Wallet Standard wallets, you can use an empty array."
const Root = () => {
  const wallets = useMemo(() => [], []);

  return (
    <React.StrictMode>
      <ConnectionProvider endpoint={RPC_URL}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            <App />
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </React.StrictMode>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<Root />);
