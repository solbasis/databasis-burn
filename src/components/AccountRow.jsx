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
            {item.logo
              ? <img src={item.logo} alt={item.symbol ?? ''} className="token-logo" onError={e => e.target.style.display='none'} />
              : <div className="token-logo-placeholder" />
            }
            <div className="token-info">
              <span className="token-symbol">{item.symbol ?? `${item.mint.slice(0,4)}…${item.mint.slice(-4)}`}</span>
              {item.name && <span className="token-name">{item.name}</span>}
            </div>
            {type === 'token' && (
              <div className="token-amounts">
                <span className="account-balance">{item.uiAmount.toLocaleString()}</span>
                {item.usdValue != null && (
                  <span className="token-usd">${item.usdValue < 0.01 ? item.usdValue.toFixed(6) : item.usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                )}
              </div>
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
