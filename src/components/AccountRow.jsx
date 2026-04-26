import { SOL_PER_LAMPORT } from '../config';

// Plain-language descriptions surfaced via the tag chip's `title` tooltip.
// These explain what's actually happening on-chain when each asset type is
// burned — useful for users who don't know the SPL ecosystem inside out
// (Jordan-tier helpfulness without bloating the visible UI).
const TAG_TOOLTIPS = {
  cNFT: 'compressed NFT — Merkle-tree leaf, no rent locked. burning removes it from your wallet but no SOL is recovered.',
  core: 'MPL Core asset — single-account NFT standard. burning closes the account and refunds rent.',
  pNFT: 'programmable NFT — has on-chain transfer rules. burning closes the account and refunds rent.',
  NFT:  'standard SPL NFT. burning closes the mint + token accounts and refunds rent.',
};

function getTag(item) {
  if (item.compressed) return 'cNFT';
  if (item.interface === 'MplCoreAsset') return 'core';
  if (item.interface === 'ProgrammableNFT') return 'pNFT';
  return 'NFT';
}

export function AccountRow({ item, type, selected, onToggle, onBurnOne, disabled }) {
  const isNftLike = type === 'nft' || type === 'cnft';
  const rentSol = (item.rentLamports * SOL_PER_LAMPORT).toFixed(6);
  const tag = isNftLike ? getTag(item) : null;

  // Per-row "burn just this" handler. Stops propagation so clicking the
  // button doesn't ALSO toggle the row's checkbox via the wrapping label.
  const handleBurnOne = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    onBurnOne?.();
  };

  return (
    <label className={`account-row ${selected ? 'selected' : ''}`}>
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(item)}
      />
      <div className="account-row-info">
        {isNftLike ? (
          <>
            {item.image && <img src={item.image} alt={item.name} className="nft-thumb" />}
            <span className="account-name">{item.name}</span>
            <span
              className="account-tag"
              title={TAG_TOOLTIPS[tag]}
            >{tag}</span>
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
      {!isNftLike && (
        <span className="account-rent">+{rentSol} SOL</span>
      )}
      {/* Per-row "burn this one" button — appears on hover (CSS) so it never
          competes with the checkbox at rest. Lets users one-shot a single
          row without going through the multi-select flow. */}
      {onBurnOne && (
        <button
          type="button"
          className="row-burn-btn"
          onClick={handleBurnOne}
          disabled={disabled}
          title="burn just this one"
          aria-label="burn just this one"
        >burn ▸</button>
      )}
    </label>
  );
}
