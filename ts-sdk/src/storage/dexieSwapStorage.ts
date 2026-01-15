/**
 * Dexie-based swap storage provider for IndexedDB.
 *
 * This module provides a typed swap storage implementation using Dexie,
 * which is a wrapper around IndexedDB that provides a simpler API.
 */

import Dexie, { type Table } from "dexie";
import type { ExtendedSwapStorageData } from "../api.js";

/**
 * Stored swap record in IndexedDB.
 * Extends ExtendedSwapStorageData with an id field for Dexie's primary key.
 */
interface SwapRecord extends ExtendedSwapStorageData {
  id: string;
}

/**
 * Dexie database for storing swap data.
 */
class LendaswapDatabase extends Dexie {
  swaps!: Table<SwapRecord, string>;

  constructor(dbName = "lendaswap") {
    super(dbName);

    // Version 1: Original schema
    this.version(1).stores({
      swaps: "id", // Primary key only, no additional indexes needed
    });

    // Version 2: Migrate refund_locktime field names
    // - btc_to_evm: refund_locktime -> vhtlc_refund_locktime, add evm_refund_locktime
    // - evm_to_btc: refund_locktime -> evm_refund_locktime, add vhtlc_refund_locktime
    this.version(2)
      .stores({
        swaps: "id",
      })
      .upgrade(async (tx) => {
        const TWELVE_HOURS_SECONDS = 43200;

        await tx
          .table("swaps")
          .toCollection()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .modify((record: any) => {
            const response = record.response;
            if (!response || !("refund_locktime" in response)) return;

            // Skip BtcToArkade swaps - they already have correct field names
            if ("btc_htlc_address" in response) return;

            const oldLocktime = response.refund_locktime;

            // Detect swap type: evm_to_btc has source_token_address field
            const isEvmToBtc = "source_token_address" in response;

            if (isEvmToBtc) {
              // evm_to_btc: refund_locktime -> evm_refund_locktime
              // vhtlc_refund_locktime = evm_refund_locktime - 12h
              response.evm_refund_locktime = oldLocktime;
              response.vhtlc_refund_locktime =
                oldLocktime - TWELVE_HOURS_SECONDS;
            } else {
              // btc_to_evm: refund_locktime -> vhtlc_refund_locktime
              // evm_refund_locktime = vhtlc_refund_locktime - 12h
              response.vhtlc_refund_locktime = oldLocktime;
              response.evm_refund_locktime = oldLocktime - TWELVE_HOURS_SECONDS;
            }

            delete response.refund_locktime;
          });
      });

    // Version 3: Add source_asset and target_asset fields
    // These are new fields added to SwapCommonFields for tracking swap pairs
    this.version(3)
      .stores({
        swaps: "id",
      })
      .upgrade(async (tx) => {
        await tx
          .table("swaps")
          .toCollection()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .modify((record: any) => {
            const response = record.response;
            if (!response) return;

            // Add source_asset if not present
            if (!("source_asset" in response)) {
              response.source_asset = "unknown";
            }

            // Add target_asset if not present
            if (!("target_asset" in response)) {
              response.target_asset = "unknown";
            }
          });
      });
  }
}

/**
 * Dexie-based swap storage provider.
 *
 * Stores swap data as typed objects in IndexedDB using Dexie.
 * This provides better performance and querying capabilities compared
 * to storing serialized JSON strings.
 *
 * @example
 * ```typescript
 * import { DexieSwapStorageProvider } from '@lendasat/lendaswap-sdk';
 *
 * const swapStorage = new DexieSwapStorageProvider();
 *
 * // Use with the Client
 * const client = await Client.create(
 *   'https://apilendaswap.lendasat.com',
 *   walletStorage,
 *   swapStorage,
 *   'bitcoin',
 *   'https://arkade.computer'
 * );
 * ```
 */
export class DexieSwapStorageProvider {
  private db: LendaswapDatabase;

  /**
   * Create a new DexieSwapStorageProvider.
   *
   * @param dbName - Optional database name (default: "lendaswap")
   */
  constructor(dbName?: string) {
    this.db = new LendaswapDatabase(dbName);
  }

  /**
   * Get swap data by swap ID.
   *
   * @param swapId - The swap ID
   * @returns The swap data, or null if not found
   */
  async get(swapId: string): Promise<ExtendedSwapStorageData | null> {
    const record = await this.db.swaps.get(swapId);
    if (!record) {
      return null;
    }
    // Remove the id field before returning (it's not part of ExtendedSwapStorageData)
    const { id: _, ...data } = record;
    return data;
  }

  /**
   * Store swap data.
   *
   * @param swapId - The swap ID
   * @param data - The swap data to store
   */
  async store(swapId: string, data: ExtendedSwapStorageData): Promise<void> {
    await this.db.swaps.put({ id: swapId, ...data });
  }

  /**
   * Delete swap data by swap ID.
   *
   * @param swapId - The swap ID
   */
  async delete(swapId: string): Promise<void> {
    await this.db.swaps.delete(swapId);
  }

  /**
   * List all stored swap IDs.
   *
   * @returns Array of swap IDs
   */
  async list(): Promise<string[]> {
    return (await this.db.swaps.toCollection().primaryKeys()) as string[];
  }

  /**
   * Clear all swap data.
   */
  async clear(): Promise<void> {
    await this.db.swaps.clear();
  }

  /**
   * Get all stored swaps.
   *
   * @returns Array of all swap data
   */
  async getAll(): Promise<ExtendedSwapStorageData[]> {
    const records = await this.db.swaps.toArray();
    // Remove the id field from each record
    return records.map(({ id: _, ...data }) => data);
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get raw swap_params for a potentially corrupted entry.
   *
   * This method reads the raw data from IndexedDB and extracts just the swap_params,
   * which can succeed even when the full ExtendedSwapStorageData fails to deserialize.
   *
   * @param swapId - The swap ID
   * @returns The swap_params as raw object, or null if not found or invalid
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getRawSwapParams(swapId: string): Promise<Record<string, any> | null> {
    // Use raw IndexedDB access to avoid type checking issues
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const record = (await this.db.swaps.get(swapId)) as any;
    if (!record || !record.swap_params) {
      return null;
    }
    return record.swap_params;
  }
}

/**
 * Create a Dexie-based swap storage provider.
 *
 * This is a convenience function for creating a DexieSwapStorageProvider.
 *
 * @param dbName - Optional database name (default: "lendaswap")
 * @returns A new DexieSwapStorageProvider instance
 *
 * @example
 * ```typescript
 * import { createDexieSwapStorage, Client } from '@lendasat/lendaswap-sdk';
 *
 * const swapStorage = createDexieSwapStorage();
 * const client = await Client.create(
 *   'https://apilendaswap.lendasat.com',
 *   walletStorage,
 *   swapStorage,
 *   'bitcoin',
 *   'https://arkade.computer'
 * );
 * ```
 */
export function createDexieSwapStorage(
  dbName?: string,
): DexieSwapStorageProvider {
  return new DexieSwapStorageProvider(dbName);
}
