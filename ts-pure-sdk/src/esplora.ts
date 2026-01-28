/**
 * Esplora API utilities for Bitcoin transaction lookups.
 */

/** Esplora transaction output */
export interface EsploraTxOutput {
  scriptpubkey: string;
  scriptpubkey_address?: string;
  scriptpubkey_type: string;
  value: number;
}

/** Esplora transaction response */
export interface EsploraTx {
  txid: string;
  vout: EsploraTxOutput[];
}

/** Result of finding an HTLC output */
export interface HtlcOutputResult {
  vout: number;
  amount: bigint;
}

/**
 * Finds an output in a transaction that matches the given address.
 *
 * @param esploraUrl - The Esplora API base URL
 * @param txid - The transaction ID to look up
 * @param address - The address to find
 * @returns The vout index and amount, or null if not found
 */
export async function findOutputByAddress(
  esploraUrl: string,
  txid: string,
  address: string,
): Promise<HtlcOutputResult | null> {
  const response = await fetch(`${esploraUrl}/tx/${txid}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch transaction: ${response.status}`);
  }

  const tx = (await response.json()) as EsploraTx;

  for (let i = 0; i < tx.vout.length; i++) {
    if (tx.vout[i].scriptpubkey_address === address) {
      return { vout: i, amount: BigInt(tx.vout[i].value) };
    }
  }

  return null;
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
