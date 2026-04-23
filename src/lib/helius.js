import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { RPC_URL, HELIUS_DAS } from '../config';

export function getConnection() {
  return new Connection(RPC_URL, 'confirmed');
}

export async function scanTokenAccounts(walletAddress) {
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
    } else {
      withBalance.push(entry);
    }
  }

  // Enrich tokens with metadata + USD price
  if (withBalance.length > 0) {
    const mints = [...new Set(withBalance.map(t => t.mint))];
    const [metaMap, priceMap] = await Promise.all([
      fetchTokenMetadata(mints),
      fetchTokenPrices(mints),
    ]);
    for (const t of withBalance) {
      const meta = metaMap[t.mint] ?? {};
      t.logo   = meta.logo ?? null;
      t.symbol = meta.symbol ?? null;
      t.name   = meta.name ?? null;
      t.usdPrice  = priceMap[t.mint] ?? null;
      t.usdValue  = t.usdPrice != null ? t.uiAmount * t.usdPrice : null;
    }
  }

  return { empty, withBalance };
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
  try {
    const res = await fetch(
      `https://lite-api.jup.ag/price/v2?ids=${mints.join(',')}`
    );
    const json = await res.json();
    const map = {};
    for (const [mint, data] of Object.entries(json.data ?? {})) {
      if (data?.price) map[mint] = parseFloat(data.price);
    }
    return map;
  } catch {
    return {};
  }
}

export async function scanNFTs(walletAddress) {
  const body = {
    jsonrpc: '2.0',
    id: 'get-assets',
    method: 'getAssetsByOwner',
    params: {
      ownerAddress: walletAddress,
      page: 1,
      limit: 1000,
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
  const items = json.result?.items ?? [];

  return items
    .filter(a => a.interface === 'V1_NFT' || a.interface === 'ProgrammableNFT' || a.interface === 'MplCoreAsset')
    .map(a => ({
      id: a.id,
      name: a.content?.metadata?.name ?? 'Unknown NFT',
      image: a.content?.links?.image ?? null,
      interface: a.interface,
      collection: a.grouping?.find(g => g.group_key === 'collection')?.group_value ?? null,
      compressed: a.compression?.compressed ?? false,
    }));
}
