/**
 * IndexedDB storage implementation for browser environments using Dexie.
 *
 * This module provides persistent storage using IndexedDB via Dexie,
 * suitable for web browsers and environments that support IndexedDB.
 */

import Dexie, { type EntityTable } from "dexie";
import type { GetSwapResponse } from "../api/client.js";
import type { StoredSwap, SwapStorage, WalletStorage } from "./index.js";

const DB_NAME = "lendaswap-v3";
const DB_VERSION = 1;

// Wallet record type for the database
interface WalletRecord {
  key: string;
  value: string | number;
}

/**
 * Dexie database class for Lendaswap storage.
 *
 * Schema versions:
 * - v1: Initial schema with wallet and swaps tables
 */
class LendaswapDatabase extends Dexie {
  wallet!: EntityTable<WalletRecord, "key">;
  swaps!: EntityTable<StoredSwap, "swapId">;

  constructor() {
    super(DB_NAME);

    // Version 1: Initial schema
    this.version(DB_VERSION).stores({
      wallet: "key",
      swaps: "swapId",
    });

    // Future migrations would be added here:
    // this.version(2).stores({ ... }).upgrade(tx => { ... });
  }
}

// Singleton database instance
let dbInstance: LendaswapDatabase | null = null;

/**
 * Get the shared database instance.
 */
function getDatabase(): LendaswapDatabase {
  if (!dbInstance) {
    dbInstance = new LendaswapDatabase();
  }
  return dbInstance;
}

// Wallet storage keys
const MNEMONIC_KEY = "mnemonic";
const KEY_INDEX_KEY = "keyIndex";

/**
 * IndexedDB implementation of WalletStorage using Dexie.
 *
 * Provides persistent storage for wallet data in browser environments.
 * Uses the shared "lendaswap-v3" database with a "wallet" table.
 *
 * @example
 * ```ts
 * const storage = new IdbWalletStorage();
 * await storage.setMnemonic("your mnemonic phrase");
 * ```
 */
export class IdbWalletStorage implements WalletStorage {
  readonly #db: LendaswapDatabase;

  constructor() {
    this.#db = getDatabase();
  }

  async getMnemonic(): Promise<string | null> {
    const record = await this.#db.wallet.get(MNEMONIC_KEY);
    return (record?.value as string) ?? null;
  }

  async setMnemonic(mnemonic: string): Promise<void> {
    await this.#db.wallet.put({ key: MNEMONIC_KEY, value: mnemonic });
  }

  async getKeyIndex(): Promise<number> {
    const record = await this.#db.wallet.get(KEY_INDEX_KEY);
    return (record?.value as number) ?? 0;
  }

  async setKeyIndex(index: number): Promise<void> {
    await this.#db.wallet.put({ key: KEY_INDEX_KEY, value: index });
  }

  async incrementKeyIndex(): Promise<number> {
    // Use a transaction to ensure atomicity
    return this.#db.transaction("rw", this.#db.wallet, async () => {
      const record = await this.#db.wallet.get(KEY_INDEX_KEY);
      const current = (record?.value as number) ?? 0;
      await this.#db.wallet.put({ key: KEY_INDEX_KEY, value: current + 1 });
      return current;
    });
  }

  async clear(): Promise<void> {
    await this.#db.wallet.clear();
  }
}

/**
 * IndexedDB implementation of SwapStorage using Dexie.
 *
 * Provides persistent storage for swap data in browser environments.
 * Uses the shared "lendaswap-v3" database with a "swaps" table.
 *
 * @example
 * ```ts
 * const storage = new IdbSwapStorage();
 * await storage.store({ swapId: "swap-id", ... });
 * ```
 */
export class IdbSwapStorage implements SwapStorage {
  readonly #db: LendaswapDatabase;

  constructor() {
    this.#db = getDatabase();
  }

  async get(swapId: string): Promise<StoredSwap | null> {
    const record = await this.#db.swaps.get(swapId);
    return record ?? null;
  }

  async store(swap: StoredSwap): Promise<void> {
    await this.#db.swaps.put(swap);
  }

  async update(swapId: string, response: GetSwapResponse): Promise<void> {
    await this.#db.transaction("rw", this.#db.swaps, async () => {
      const existing = await this.#db.swaps.get(swapId);
      if (!existing) {
        throw new Error(`Swap not found: ${swapId}`);
      }
      await this.#db.swaps.put({
        ...existing,
        response,
        updatedAt: Date.now(),
      });
    });
  }

  async delete(swapId: string): Promise<void> {
    await this.#db.swaps.delete(swapId);
  }

  async list(): Promise<string[]> {
    const records = await this.#db.swaps.toArray();
    return records.map((r) => r.swapId);
  }

  async getAll(): Promise<StoredSwap[]> {
    return this.#db.swaps.toArray();
  }

  async clear(): Promise<void> {
    await this.#db.swaps.clear();
  }
}

/**
 * Storage factory for IndexedDB (browser) storage.
 *
 * Creates IDB-backed storage instances that persist data in the browser.
 */
export const idbStorageFactory = {
  createWalletStorage: (): WalletStorage => new IdbWalletStorage(),
  createSwapStorage: (): SwapStorage => new IdbSwapStorage(),
};
