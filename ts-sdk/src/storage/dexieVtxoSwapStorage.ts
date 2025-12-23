/**
 * Dexie-based VTXO swap storage provider for IndexedDB.
 *
 * This module provides a typed VTXO swap storage implementation using Dexie,
 * which is a wrapper around IndexedDB that provides a simpler API.
 */

import Dexie, { type Table } from "dexie";
import type { ExtendedVtxoSwapStorageData } from "../api.js";

/**
 * Plain interface for VtxoSwapResponse (matches serde serialization).
 */
interface VtxoSwapResponsePlain {
  id: string;
  status: string;
  created_at: string;
  client_vhtlc_address: string;
  client_fund_amount_sats: bigint;
  client_pk: string;
  client_locktime: bigint;
  client_unilateral_claim_delay: bigint;
  client_unilateral_refund_delay: bigint;
  client_unilateral_refund_without_receiver_delay: bigint;
  server_vhtlc_address: string;
  server_fund_amount_sats: bigint;
  server_pk: string;
  server_locktime: bigint;
  server_unilateral_claim_delay: bigint;
  server_unilateral_refund_delay: bigint;
  server_unilateral_refund_without_receiver_delay: bigint;
  arkade_server_pk: string;
  preimage_hash: string;
  fee_sats: bigint;
  network: string;
}

/**
 * Plain interface for SwapParams (matches serde serialization).
 */
interface SwapParamsPlain {
  own_sk: string;
  own_pk: string;
  preimage: string;
  preimage_hash: string;
  user_id: string;
  key_index: number;
}

/**
 * Plain interface for ExtendedVtxoSwapStorageData (matches serde serialization).
 */
interface ExtendedVtxoSwapStorageDataPlain {
  response: VtxoSwapResponsePlain;
  swap_params: SwapParamsPlain;
}

/**
 * Stored VTXO swap record in IndexedDB with primary key.
 */
interface VtxoSwapRecord extends ExtendedVtxoSwapStorageDataPlain {
  id: string;
}

/**
 * Dexie database for storing VTXO swap data.
 */
class LendaswapVtxoSwapDatabase extends Dexie {
  vtxoSwaps!: Table<VtxoSwapRecord, string>;

  constructor(dbName = "lendaswap_vtxo_swaps") {
    super(dbName);
    this.version(1).stores({
      vtxoSwaps: "id", // Primary key only, no additional indexes needed
    });
  }
}

/**
 * Dexie-based VTXO swap storage provider.
 *
 * Stores VTXO swap data as typed objects in IndexedDB using Dexie.
 * This provides better performance and querying capabilities compared
 * to storing serialized JSON strings.
 *
 * @example
 * ```typescript
 * import { DexieVtxoSwapStorageProvider } from '@lendasat/lendaswap-sdk';
 *
 * const vtxoSwapStorage = new DexieVtxoSwapStorageProvider();
 *
 * // Use with the Client
 * const client = await Client.create(
 *   'https://apilendaswap.lendasat.com',
 *   walletStorage,
 *   swapStorage,
 *   vtxoSwapStorage,
 *   'bitcoin',
 *   'https://arkade.computer'
 * );
 * ```
 */
export class DexieVtxoSwapStorageProvider {
  private db: LendaswapVtxoSwapDatabase;

  /**
   * Create a new DexieVtxoSwapStorageProvider.
   *
   * @param dbName - Optional database name (default: "lendaswap_vtxo_swaps")
   */
  constructor(dbName?: string) {
    this.db = new LendaswapVtxoSwapDatabase(dbName);
  }

  /**
   * Get VTXO swap data by swap ID.
   *
   * @param swapId - The swap ID
   * @returns The VTXO swap data, or null if not found
   */
  async get(swapId: string): Promise<ExtendedVtxoSwapStorageData | null> {
    const record = await this.db.vtxoSwaps.get(swapId);
    if (!record) {
      return null;
    }
    // Remove the id field before returning
    const { id: _, ...data } = record;
    return data as ExtendedVtxoSwapStorageData;
  }

  /**
   * Store VTXO swap data.
   *
   * @param swapId - The swap ID
   * @param data - The VTXO swap data to store
   */
  async store(
    swapId: string,
    data: ExtendedVtxoSwapStorageData,
  ): Promise<void> {
    // Data may be a WASM class or plain object - both have same property access
    const record: VtxoSwapRecord = {
      id: swapId,
      response: data.response as VtxoSwapResponsePlain,
      swap_params: data.swap_params as SwapParamsPlain,
    };
    await this.db.vtxoSwaps.put(record);
  }

  /**
   * Delete VTXO swap data by swap ID.
   *
   * @param swapId - The swap ID
   */
  async delete(swapId: string): Promise<void> {
    await this.db.vtxoSwaps.delete(swapId);
  }

  /**
   * List all stored VTXO swap IDs.
   *
   * @returns Array of swap IDs
   */
  async list(): Promise<string[]> {
    return (await this.db.vtxoSwaps.toCollection().primaryKeys()) as string[];
  }

  /**
   * Clear all VTXO swap data.
   */
  async clear(): Promise<void> {
    await this.db.vtxoSwaps.clear();
  }

  /**
   * Get all stored VTXO swaps.
   *
   * @returns Array of all VTXO swap data
   */
  async getAll(): Promise<ExtendedVtxoSwapStorageData[]> {
    const records = await this.db.vtxoSwaps.toArray();
    // Remove the id field from each record
    return records.map(
      ({ id: _, ...data }) => data as ExtendedVtxoSwapStorageData,
    );
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }
}

/**
 * Create a Dexie-based VTXO swap storage provider.
 *
 * This is a convenience function for creating a DexieVtxoSwapStorageProvider.
 *
 * @param dbName - Optional database name (default: "lendaswap_vtxo_swaps")
 * @returns A new DexieVtxoSwapStorageProvider instance
 *
 * @example
 * ```typescript
 * import { createDexieVtxoSwapStorage, Client } from '@lendasat/lendaswap-sdk';
 *
 * const vtxoSwapStorage = createDexieVtxoSwapStorage();
 * const client = await Client.create(
 *   'https://apilendaswap.lendasat.com',
 *   walletStorage,
 *   swapStorage,
 *   vtxoSwapStorage,
 *   'bitcoin',
 *   'https://arkade.computer'
 * );
 * ```
 */
export function createDexieVtxoSwapStorage(
  dbName?: string,
): DexieVtxoSwapStorageProvider {
  return new DexieVtxoSwapStorageProvider(dbName);
}
