import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { burnV1 as burnCoreV1, mplCore } from '@metaplex-foundation/mpl-core';
import {
  burnV1 as burnMetadataV1,
  mplTokenMetadata,
  TokenStandard,
} from '@metaplex-foundation/mpl-token-metadata';
import { publicKey } from '@metaplex-foundation/umi';
import { RPC_URL } from '../config';

function makeUmi(wallet) {
  return createUmi(RPC_URL)
    .use(mplCore())
    .use(mplTokenMetadata())
    .use(walletAdapterIdentity(wallet));
}

export async function burnCoreNFT(wallet, nft) {
  const umi = makeUmi(wallet);
  await burnCoreV1(umi, {
    asset: publicKey(nft.id),
    ...(nft.collection ? { collection: publicKey(nft.collection) } : {}),
  }).sendAndConfirm(umi);
}

export async function burnLegacyNFT(wallet, nft) {
  const umi = makeUmi(wallet);
  await burnMetadataV1(umi, {
    mint: publicKey(nft.id),
    tokenStandard: nft.interface === 'ProgrammableNFT'
      ? TokenStandard.ProgrammableNonFungible
      : TokenStandard.NonFungible,
  }).sendAndConfirm(umi);
}

export async function burnNFTs(wallet, nfts, onProgress) {
  const txids = [];

  for (let i = 0; i < nfts.length; i++) {
    const nft = nfts[i];
    try {
      if (nft.interface === 'MplCoreAsset') {
        await burnCoreNFT(wallet, nft);
      } else {
        await burnLegacyNFT(wallet, nft);
      }
    } catch (err) {
      console.error(`Failed to burn NFT ${nft.id}:`, err);
      throw err;
    }
    txids.push(nft.id);
    onProgress?.((i + 1) / nfts.length);
  }

  return txids;
}
