import { useState } from 'react';
import { AccountRow } from './AccountRow';

export function ResultsTabs({ empty, tokens, nfts, cnfts, selected, onToggle, onSelectAll, onClearAll }) {
  const [tab, setTab] = useState('empty');

  const tabs = [
    { id: 'empty',  label: 'Empty',  count: empty.length,  items: empty,  type: 'empty' },
    { id: 'tokens', label: 'Tokens', count: tokens.length, items: tokens, type: 'token' },
    { id: 'nfts',   label: 'NFTs',   count: nfts.length,   items: nfts,   type: 'nft'   },
    { id: 'cnfts',  label: 'cNFTs',  count: cnfts.length,  items: cnfts,  type: 'nft'   },
  ];

  const active = tabs.find(t => t.id === tab);

  return (
    <div className="results-tabs">
      <div className="tab-bar">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? 'active' : ''} ${t.count === 0 ? 'empty-tab' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <span className="tab-count">{t.count}</span>
          </button>
        ))}
        <div className="tab-actions">
          <button className="btn-ghost small" onClick={() => onSelectAll(active.items, active.type)}>all</button>
          <button className="btn-ghost small" onClick={() => onClearAll(active.items, active.type)}>none</button>
        </div>
      </div>

      <div className="tab-content">
        {active.items.length === 0 ? (
          <p className="empty-state">no {active.label.toLowerCase()} found</p>
        ) : (
          active.items.map(item => {
            const key = active.type === 'nft' ? item.id : item.address;
            return (
              <AccountRow
                key={key}
                item={item}
                type={active.type}
                selected={selected.has(key)}
                onToggle={item => onToggle(item, active.type)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
