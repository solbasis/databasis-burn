import { useState, useMemo } from 'react';
import { AccountRow } from './AccountRow';

// Threshold below which a token is considered "dust" — useful for the
// bulk-select-dust shortcut on the tokens tab. Picked at $0.01 because
// genuine micro-positions almost never matter at that scale and this maps
// cleanly to "yeah, that's spam / abandoned".
const DUST_USD_THRESHOLD = 0.01;

// Sort modes per tab type. Different types expose different sort fields:
// USD value only matters for tokens; rent only for empty/tokens; name for
// NFT-likes. We keep `default` (the order the scanner returned) as the
// first option for every tab so users always have an "untouched" view.
const SORT_OPTIONS = {
  empty:  [
    { id: 'default', label: 'default' },
    { id: 'rent',    label: 'rent ↓' },
  ],
  token: [
    { id: 'default', label: 'default' },
    { id: 'usd',     label: 'value ↓' },
    { id: 'balance', label: 'balance ↓' },
    { id: 'name',    label: 'name a→z' },
  ],
  nft:   [
    { id: 'default', label: 'default' },
    { id: 'name',    label: 'name a→z' },
  ],
  cnft:  [
    { id: 'default', label: 'default' },
    { id: 'name',    label: 'name a→z' },
  ],
};

function applySort(items, type, mode) {
  if (mode === 'default') return items;
  const sorted = [...items];
  switch (mode) {
    case 'rent':
      sorted.sort((a, b) => (b.rentLamports ?? 0) - (a.rentLamports ?? 0));
      break;
    case 'usd':
      // Tokens without USD pricing fall to the bottom — they're typically
      // spam mints with no market, which is what users want to burn anyway,
      // but they shouldn't dominate a "value desc" sort.
      sorted.sort((a, b) => (b.usdValue ?? -Infinity) - (a.usdValue ?? -Infinity));
      break;
    case 'balance':
      sorted.sort((a, b) => (b.uiAmount ?? 0) - (a.uiAmount ?? 0));
      break;
    case 'name':
      sorted.sort((a, b) => {
        const an = (a.name ?? a.symbol ?? '').toLowerCase();
        const bn = (b.name ?? b.symbol ?? '').toLowerCase();
        return an.localeCompare(bn);
      });
      break;
    default:
      break;
  }
  return sorted;
}

// Skeleton shimmer rows shown while the scanner is fetching. Six rows is
// enough to fill the panel without scrolling, mimicking a typical result.
function SkeletonRows() {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton-thumb" />
          <div className="skeleton-text">
            <div className="skeleton-line" style={{ width: `${50 + (i % 3) * 12}%` }} />
            <div className="skeleton-line short" style={{ width: `${20 + (i % 4) * 8}%` }} />
          </div>
          <div className="skeleton-rent" />
        </div>
      ))}
    </div>
  );
}

export function ResultsTabs({
  empty, tokens, nfts, cnfts,
  selected, onToggle, onSelectAll, onClearAll, onBurnOne,
  loading = false,
  disabled = false,
}) {
  const [tab, setTab] = useState('empty');
  const [query, setQuery] = useState('');
  // One sort-mode key per tab type so switching tabs preserves each tab's
  // chosen sort independently. Reset to default on tab switch would feel
  // arbitrary; preserving feels like settings.
  const [sortByType, setSortByType] = useState({ empty: 'default', token: 'default', nft: 'default', cnft: 'default' });

  const tabs = [
    { id: 'empty',  num: '01', label: 'Empty',  count: empty.length,  items: empty,  type: 'empty' },
    { id: 'tokens', num: '02', label: 'Tokens', count: tokens.length, items: tokens, type: 'token' },
    { id: 'nfts',   num: '03', label: 'NFTs',   count: nfts.length,   items: nfts,   type: 'nft'   },
    { id: 'cnfts',  num: '04', label: 'cNFTs',  count: cnfts.length,  items: cnfts,  type: 'cnft'  },
  ];

  const active = tabs.find(t => t.id === tab);
  const sortMode = sortByType[active.type];

  const rowKey = (item, type) => (type === 'nft' || type === 'cnft') ? item.id : item.address;
  const selectionKey = (item, type) => `${type}:${rowKey(item, type)}`;

  // Compose: filter (search) → sort. Done in one memo so we don't re-allocate
  // arrays unnecessarily when only sort or only query changes.
  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    let items = active.items;
    if (q) {
      items = items.filter(item => {
        const haystack = [item.name, item.symbol, item.mint, item.address, item.id]
          .filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }
    return applySort(items, active.type, sortMode);
  }, [active.items, active.type, query, sortMode]);

  // Count of dust tokens — surfaces the bulk-select affordance only when
  // there's actually something to grab.
  const dustCount = useMemo(() => {
    if (active.type !== 'token') return 0;
    return tokens.filter(t => t.usdValue != null && t.usdValue < DUST_USD_THRESHOLD).length;
  }, [active.type, tokens]);

  const handleSelectDust = () => {
    if (active.type !== 'token') return;
    const dust = tokens.filter(t => t.usdValue != null && t.usdValue < DUST_USD_THRESHOLD);
    onSelectAll(dust, 'token');
  };

  const sortOptions = SORT_OPTIONS[active.type] ?? [];

  return (
    <div className="results-tabs">
      <div className="tab-bar">
        {tabs.map(t => (
          <button
            key={t.id}
            data-num={t.num}
            className={`tab ${tab === t.id ? 'active' : ''} ${t.count === 0 ? 'empty-tab' : ''}`}
            onClick={() => { setTab(t.id); setQuery(''); }}
          >
            {t.label}
            <span className="tab-count">{t.count}</span>
          </button>
        ))}
        <div className="tab-actions">
          {active.type === 'token' && dustCount > 0 && (
            <button
              className="btn-ghost small dust-pick"
              disabled={disabled}
              onClick={handleSelectDust}
              title={`Select all ${dustCount} tokens worth less than $${DUST_USD_THRESHOLD}`}
            >
              dust ({dustCount})
            </button>
          )}
          <button
            className="btn-ghost small"
            disabled={disabled}
            onClick={() => onSelectAll(visibleItems, active.type)}
            title={query ? `Select all ${visibleItems.length} matching` : 'Select all (a)'}
          >all</button>
          <button
            className="btn-ghost small"
            disabled={disabled}
            onClick={() => onClearAll(active.items, active.type)}
          >none</button>
        </div>
      </div>

      {/* Search + sort toolbar — only renders when there's >8 items in the
          active tab. Below that the controls are noise; eyeballing wins. */}
      {!loading && active.items.length > 8 && (
        <div className="tab-toolbar">
          <div className="tab-search">
            <span className="tab-search-prefix">⌕</span>
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={
                active.type === 'token' ? 'filter by symbol, name, mint…' :
                active.type === 'empty' ? 'filter by mint address…' :
                                          'filter by name…'
              }
              className="tab-search-input"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                className="tab-search-clear"
                onClick={() => setQuery('')}
                aria-label="clear search"
              >×</button>
            )}
          </div>
          {sortOptions.length > 1 && (
            <label className="tab-sort">
              <span className="tab-sort-label">sort</span>
              <select
                value={sortMode}
                onChange={e => setSortByType(s => ({ ...s, [active.type]: e.target.value }))}
                className="tab-sort-select"
              >
                {sortOptions.map(opt => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="tab-content">
        {/* cNFTs are Merkle-tree leaves, not rent-locked accounts — burning
            them removes the scam from your wallet but returns no SOL. */}
        {active.type === 'cnft' && active.items.length > 0 && (
          <p className="tab-note">
            cNFTs don't lock rent — burning removes them from your wallet but recovers no SOL
          </p>
        )}

        {loading ? (
          <SkeletonRows />
        ) : visibleItems.length === 0 ? (
          <p className="empty-state">
            {query
              ? `no ${active.label.toLowerCase()} match "${query}"`
              : `no ${active.label.toLowerCase()} found`}
          </p>
        ) : (
          visibleItems.map(item => {
            const rk = rowKey(item, active.type);
            const sk = selectionKey(item, active.type);
            return (
              <AccountRow
                key={rk}
                item={item}
                type={active.type}
                selected={selected.has(sk)}
                onToggle={item => onToggle(item, active.type)}
                onBurnOne={onBurnOne ? () => onBurnOne(item, active.type) : null}
                disabled={disabled}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
