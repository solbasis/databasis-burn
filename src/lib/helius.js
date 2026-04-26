import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { RPC_URL, HELIUS_DAS } from '../config';

export function getConnection() {
  return new Connection(RPC_URL, 'confirmed');
}

export async function scanTokenAccounts(walletAddress, nftMints = new Set()) {
  const connection = getConnection();
  const pubkey = new PublicKey(walletAddress);

  const [splAccounts, token2022Accounts] = await Promise.all([
    connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_PROGRAM_ID }),
    connection.getParsedTokenAccountsByOwner(pubkey, { programId: TOKEN_2022_PROGRAM_ID }),
  ]);

  const all = [...splAccounts.value, ...token2022Accounts.value];

  const empty = [];
  const withBalance = [];

  for (const { pubkey: accPubkey, account } of all) {
    const parsed = account.data.parsed.info;
    const amount = BigInt(parsed.tokenAmount.amount);
    const decimals = parsed.tokenAmount.decimals;
    const mint = parsed.mint;
    const programId = account.owner.toBase58();

    const entry = {
      address: accPubkey.toBase58(),
      mint,
      amount,
      decimals,
      uiAmount: parsed.tokenAmount.uiAmount ?? 0,
      programId,
      rentLamports: account.lamports,
    };

    if (amount === 0n) {
      empty.push(entry);
    } else if (!nftMints.has(mint)) {
      withBalance.push(entry);
    }
  }

  // Enrich BOTH empty + with-balance accounts with token metadata in a
  // single deduped getAssetBatch call. Helius bills per call (not per id)
  // and accepts up to 1000 ids per request, so combining costs nothing
  // extra and gives empty-account rows the same logo/symbol/name UX as
  // tokens-with-balance — users can recognize the USDC/BONK/etc. account
  // they're about to close instead of squinting at "4Gg6…sWXh".
  //
  // USD price is fetched only for tokens-with-balance — empty accounts
  // are always $0 so the Jupiter call would be wasted.
  const allMints = [...new Set([
    ...empty.map(e => e.mint),
    ...withBalance.map(t => t.mint),
  ])];

  if (allMints.length > 0) {
    const [metaMap, priceMap] = await Promise.all([
      fetchTokenMetadata(allMints),
      withBalance.length > 0
        ? fetchTokenPrices(withBalance.map(t => t.mint))
        : Promise.resolve({}),
    ]);

    for (const t of withBalance) {
      const meta = metaMap[t.mint] ?? {};
      t.logo   = meta.logo ?? null;
      t.symbol = meta.symbol ?? null;
      t.name   = meta.name ?? null;
      t.usdPrice  = priceMap[t.mint] ?? null;
      t.usdValue  = t.usdPrice != null ? t.uiAmount * t.usdPrice : null;
    }

    for (const e of empty) {
      const meta = metaMap[e.mint] ?? {};
      e.logo   = meta.logo ?? null;
      e.symbol = meta.symbol ?? null;
      e.name   = meta.name ?? null;
    }
  }

  return { empty, withBalance };
}

export async function getAssetProof(assetId) {
  const res = await fetch(HELIUS_DAS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 'proof', method: 'getAssetProof',
      params: { id: assetId },
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message ?? 'DAS getAssetProof failed');
  if (!json.result) throw new Error('getAssetProof returned no result');
  return json.result;
}

async function fetchTokenMetadata(mints) {
  const body = {
    jsonrpc: '2.0', id: 'meta', method: 'getAssetBatch',
    params: { ids: mints },
  };
  const res = await fetch(HELIUS_DAS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  const map = {};
  for (const asset of json.result ?? []) {
    if (!asset?.id) continue;
    map[asset.id] = {
      logo:   asset.content?.links?.image ?? null,
      symbol: asset.content?.metadata?.symbol ?? null,
      name:   asset.content?.metadata?.name ?? null,
    };
  }
  return map;
}

async function fetchTokenPrices(mints) {
  // Jupiter's price API has a ~100 id limit per request. Chunk to stay under
  // URL length limits and API caps.
  const CHUNK = 100;
  const map = {};
  for (let i = 0; i < mints.length; i += CHUNK) {
    const slice = mints.slice(i, i + CHUNK);
    try {
      const res = await fetch(
        `https://lite-api.jup.ag/price/v2?ids=${slice.join(',')}`
      );
      const json = await res.json();
      for (const [mint, data] of Object.entries(json.data ?? {})) {
        if (data?.price) map[mint] = parseFloat(data.price);
      }
    } catch {
      // swallow — price enrichment is best-effort
    }
  }
  return map;
}

export async function scanNFTs(walletAddress) {
  const LIMIT = 1000;
  const MAX_PAGES = 10; // 10k NFT ceiling; Helius paginates from 1
  const items = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const body = {
      jsonrpc: '2.0',
      id: `get-assets-${page}`,
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: walletAddress,
        page,
        limit: LIMIT,
        displayOptions: {
          showFungible: false,
          showNativeBalance: false,
        },
      },
    };

    const res = await fetch(HELIUS_DAS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    if (json.error) throw new Error(json.error.message ?? 'DAS getAssetsByOwner failed');
    const pageItems = json.result?.items ?? [];
    items.push(...pageItems);
    if (pageItems.length < LIMIT) break; // last page
  }

  return items
    .filter(a => a.interface === 'V1_NFT' || a.interface === 'ProgrammableNFT' || a.interface === 'MplCoreAsset')
    .map(a => ({
      id: a.id,
      name: a.content?.metadata?.name ?? 'Unknown NFT',
      image: a.content?.links?.image ?? null,
      interface: a.interface,
      collection: a.grouping?.find(g => g.group_key === 'collection')?.group_value ?? null,
      compressed: a.compression?.compressed ?? false,
      compression: a.compression?.compressed ? {
        tree:        a.compression.tree,
        dataHash:    a.compression.data_hash,
        creatorHash: a.compression.creator_hash,
        leafId:      a.compression.leaf_id,
      } : null,
    }));
}
