import { Transaction, VersionedTransaction } from '@solana/web3.js';
import { BASIS_MINT, JUPITER_QUOTE_API, JUPITER_SWAP_API } from '../config';
import { getConnection } from './helius';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

export async function getQuote(lamports) {
  const params = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: BASIS_MINT,
    amount: String(lamports),
    slippageBps: '500',
  });

  const res = await fetch(`${JUPITER_QUOTE_API}?${params}`);
  const json = await res.json();
  console.log('[jupiter] quote response', json);
  if (!res.ok || json.error) throw new Error(json.error ?? 'Failed to get Jupiter quote');
  return json;
}

export async function swapSolForBasis(wallet, lamports) {
  const quote = await getQuote(lamports);

  const res = await fetch(JUPITER_SWAP_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: wallet.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto',
    }),
  });

  const swapJson = await res.json();
  console.log('[jupiter] swap response', swapJson);
  if (!res.ok || swapJson.error) {
    throw new Error(swapJson.error ?? 'Failed to get Jupiter swap transaction');
  }
  const { swapTransaction } = swapJson;

  const txBuffer = Buffer.from(swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuffer);

  const signed = await wallet.signTransaction(tx);

  const connection = getConnection();
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const txid = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: true });
  console.log('[jupiter] swap sent', txid);
  const confirmation = await connection.confirmTransaction({ signature: txid, blockhash, lastValidBlockHeight }, 'confirmed');
  if (confirmation.value.err) throw new Error(`Swap failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
  return txid;
}
