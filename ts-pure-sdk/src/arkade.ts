/**
 * Arkade VHTLC query utilities.
 *
 * Provides functions for querying VHTLC state from the Arkade indexer.
 */

import {
  ArkAddress,
  type IndexerProvider,
  RestIndexerProvider,
} from "@arkade-os/sdk";
import { hex } from "@scure/base";

/** Default Arkade server URLs by network */
const DEFAULT_ARKADE_URLS: Record<string, string> = {
  bitcoin: "https://arkade.computer",
  signet: "https://signet.arkade.computer",
};

/** VHTLC amounts breakdown */
export interface VhtlcAmounts {
  /** Amount that can be spent (in satoshis) */
  spendable: number;
  /** Amount already spent (in satoshis) */
  spent: number;
  /** Amount that can be recovered via refund (in satoshis) */
  recoverable: number;
}

/** Parameters for querying VHTLC amounts */
export interface GetVhtlcAmountsParams {
  /** The Arkade VHTLC address */
  vhtlcAddress: string;
  /** The Bitcoin network (e.g. "bitcoin", "signet") */
  network: string;
}

/**
 * Queries the Arkade indexer for spendable, spent, and recoverable balances
 * at a VHTLC address.
 *
 * @param params - The VHTLC address and network to query.
 * @returns The VHTLC amounts in satoshis.
 */
export async function getVhtlcAmounts(
  params: GetVhtlcAmountsParams,
): Promise<VhtlcAmounts> {
  const { vhtlcAddress, network } = params;

  // Decode the Arkade address to get the pkScript for indexer queries
  const decoded = ArkAddress.decode(vhtlcAddress);
  const pkScript = hex.encode(decoded.pkScript);

  // Determine Arkade server URL from network
  const serverUrl = DEFAULT_ARKADE_URLS[network];
  if (!serverUrl) {
    throw new Error(`Unknown network for Arkade: ${network}`);
  }

  const indexerProvider: IndexerProvider = new RestIndexerProvider(serverUrl);

  // Query each category separately
  const [spendableResult, spentResult, recoverableResult] = await Promise.all([
    indexerProvider.getVtxos({ scripts: [pkScript], spendableOnly: true }),
    indexerProvider.getVtxos({ scripts: [pkScript], spentOnly: true }),
    indexerProvider.getVtxos({ scripts: [pkScript], recoverableOnly: true }),
  ]);

  const sum = (vtxos: { value: number }[]) =>
    vtxos.reduce((acc, v) => acc + v.value, 0);

  return {
    spendable: sum(spendableResult.vtxos),
    spent: sum(spentResult.vtxos),
    recoverable: sum(recoverableResult.vtxos),
  };
}
