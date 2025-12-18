/**
 * Dexie-based VTXO swap storage provider for IndexedDB.
 *
 * This module provides a typed VTXO swap storage implementation using Dexie,
 * which is a wrapper around IndexedDB that provides a simpler API.
 */

import Dexie, { type Table } from "dexie";
import type { ExtendedVtxoSwapStorageDataPlain } from "../api.js";

/**
 * Stored VTXO swap record in IndexedDB.
 * Extends ExtendedVtxoSwapStorageDataPlain with an id field for Dexie's primary key.
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
  async get(swapId: string): Promise<ExtendedVtxoSwapStorageDataPlain | null> {
    const record = await this.db.vtxoSwaps.get(swapId);
    if (!record) {
      return null;
    }
    // Remove the id field before returning (it's not part of ExtendedVtxoSwapStorageDataPlain)
    const { id: _, ...data } = record;
    return data;
  }

  /**
   * Store VTXO swap data.
   *
   * @param swapId - The swap ID
   * @param data - The VTXO swap data to store
   */
  async store(
    swapId: string,
    data: ExtendedVtxoSwapStorageDataPlain,
  ): Promise<void> {
    await this.db.vtxoSwaps.put({ id: swapId, ...data });
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
  async getAll(): Promise<ExtendedVtxoSwapStorageDataPlain[]> {
    const records = await this.db.vtxoSwaps.toArray();
    // Remove the id field from each record
    return records.map(({ id: _, ...data }) => data);
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
