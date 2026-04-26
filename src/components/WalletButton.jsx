import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

export function WalletButton() {
  const { connected, publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  if (connected && publicKey) {
    const addr = publicKey.toBase58();
    const short = `${addr.slice(0, 4)}...${addr.slice(-4)}`;
    return (
      <div className="wallet-connected">
        <span className="wallet-addr">{short}</span>
        <button className="btn-ghost" onClick={disconnect}>disconnect</button>
      </div>
    );
  }

  return (
    <button className="btn-primary" onClick={() => setVisible(true)}>
      ▸ connect wallet
    </button>
  );
}
