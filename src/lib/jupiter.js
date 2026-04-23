import { Transaction, VersionedTransaction } from '@solana/web3.js';
import { BASIS_MINT, JUPITER_QUOTE_API, JUPITER_SWAP_API } from '../config';
import { getConnection } from './helius';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

export async function getQuote(lamports) {
  const params = new URLSearchParams({
    inputMint: SOL_MINT,
    outputMint: BASIS_MINT,
    amount: String(lamports),
    slippageBps: '100',
  });

  const res = await fetch(`${JUPITER_QUOTE_API}?${params}`);
  if (!res.ok) throw new Error('Failed to get Jupiter quote');
  return res.json();
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

  if (!res.ok) throw new Error('Failed to get Jupiter swap transaction');
  const { swapTransaction } = await res.json();

  const txBuffer = Buffer.from(swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuffer);

  const signed = await wallet.signTransaction(tx);

  const connection = getConnection();
  const txid = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(txid, 'confirmed');
  return txid;
}
