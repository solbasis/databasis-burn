import { SOL_PER_LAMPORT } from '../config';

export function AccountRow({ item, type, selected, onToggle }) {
  const rentSol = (item.rentLamports * SOL_PER_LAMPORT).toFixed(6);

  return (
    <label className={`account-row ${selected ? 'selected' : ''}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(item)}
      />
      <div className="account-row-info">
        {type === 'nft' ? (
          <>
            {item.image && <img src={item.image} alt={item.name} className="nft-thumb" />}
            <span className="account-name">{item.name}</span>
            <span className="account-tag">{item.interface === 'MplCoreAsset' ? 'core' : item.interface === 'ProgrammableNFT' ? 'pNFT' : 'NFT'}</span>
          </>
        ) : (
          <>
            <span className="account-mint">{item.mint.slice(0, 8)}…{item.mint.slice(-4)}</span>
            {type === 'token' && (
              <span className="account-balance">{item.uiAmount.toLocaleString()} tokens</span>
            )}
          </>
        )}
      </div>
      {type !== 'nft' && (
        <span className="account-rent">+{rentSol} SOL</span>
      )}
    </label>
  );
}
