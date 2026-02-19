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

/** Overall VTXO lifecycle status */
export type VtxoStatus =
  | "not_funded"
  | "spendable"
  | "recoverable"
  | "spent"
  | "mixed";

/** VHTLC amounts breakdown */
export interface VhtlcAmounts {
  /** Amount that can be spent (in satoshis) */
  spendable: number;
  /** Amount already spent (in satoshis) */
  spent: number;
  /** Amount that can be recovered via refund (in satoshis) */
  recoverable: number;
  /** Overall status derived from VTXO states */
  vtxoStatus: VtxoStatus;
}

/** Parameters for querying VHTLC amounts */
export interface GetVhtlcAmountsParams {
  /** The Arkade VHTLC address */
  vhtlcAddress: string;
  /** The Bitcoin network (e.g. "bitcoin", "signet") */
  network: string;
  /** Optional Arkade server URL override. Falls back to network-based defaults. */
  arkadeServerUrl?: string;
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
  const { vhtlcAddress, network, arkadeServerUrl } = params;
  console.log(`We are here`);

  // Decode the Arkade address to get the pkScript for indexer queries
  const decoded = ArkAddress.decode(vhtlcAddress);
  const pkScript = hex.encode(decoded.pkScript);

  // Determine Arkade server URL: explicit override > network default
  const serverUrl = arkadeServerUrl ?? DEFAULT_ARKADE_URLS[network];
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

  const spendable = sum(spendableResult.vtxos);
  const spent = sum(spentResult.vtxos);
  const recoverable = sum(recoverableResult.vtxos);

  const vtxoStatus: VtxoStatus =
    spendable === 0 && spent === 0 && recoverable === 0
      ? "not_funded"
      : spendable > 0 && recoverable > 0
        ? "mixed"
        : spendable > 0
          ? "spendable"
          : recoverable > 0
            ? "recoverable"
            : "spent";

  return { spendable, spent, recoverable, vtxoStatus };
}
