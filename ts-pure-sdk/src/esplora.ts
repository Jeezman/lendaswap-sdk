/**
 * Esplora API utilities for Bitcoin transaction lookups.
 */

/** Esplora UTXO response */
export interface EsploraUtxo {
  txid: string;
  vout: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
  value: number;
}

/** Result of finding an HTLC output */
export interface HtlcOutputResult {
  txid: string;
  vout: number;
  amount: bigint;
}

/**
 * Finds a UTXO at the given address.
 *
 * Queries the Esplora `/address/:address/utxo` endpoint to find
 * unspent outputs. Returns the first UTXO found.
 *
 * @param esploraUrl - The Esplora API base URL
 * @param address - The address to look up UTXOs for
 * @returns The txid, vout, and amount of the first UTXO, or null if none found
 */
export async function findOutputByAddress(
  esploraUrl: string,
  address: string,
): Promise<HtlcOutputResult | null> {
  const response = await fetch(`${esploraUrl}/address/${address}/utxo`);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch UTXOs for address ${address}: ${response.status}`,
    );
  }

  const utxos = (await response.json()) as EsploraUtxo[];

  if (utxos.length === 0) {
    return null;
  }

  const utxo = utxos[0];
  return { txid: utxo.txid, vout: utxo.vout, amount: BigInt(utxo.value) };
}

/**
 * Broadcasts a raw transaction to the Bitcoin network via Esplora API.
 *
 * @param esploraUrl - The Esplora API base URL
 * @param txHex - The raw transaction hex to broadcast
 * @returns The transaction ID on success
 */
export async function broadcastTransaction(
  esploraUrl: string,
  txHex: string,
): Promise<string> {
  const response = await fetch(`${esploraUrl}/tx`, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
    },
    body: txHex,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Broadcast failed: ${response.status} - ${errorText}`);
  }

  return response.text();
}
