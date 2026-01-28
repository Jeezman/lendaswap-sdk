/**
 * IndexedDB storage implementation for browser environments using Dexie.
 *
 * This module provides persistent storage using IndexedDB via Dexie,
 * suitable for web browsers and environments that support IndexedDB.
 */

import Dexie, { type EntityTable } from "dexie";
import type { SwapStorage, WalletStorage } from "./index.js";

const DB_NAME = "lendaswap-v3";
const DB_VERSION = 1;

// Wallet record type for the database
interface WalletRecord {
  key: string;
  value: string | number;
}

// Swap record type for the database
interface SwapRecord<T> {
  swapId: string;
  data: T;
}

/**
 * Dexie database class for Lendaswap storage.
 */
class LendaswapDatabase extends Dexie {
  wallet!: EntityTable<WalletRecord, "key">;
  swaps!: EntityTable<SwapRecord<unknown>, "swapId">;

  constructor() {
    super(DB_NAME);

    this.version(DB_VERSION).stores({
      wallet: "key",
      swaps: "swapId",
    });
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
    return await this.#db.transaction("rw", this.#db.wallet, async () => {
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
 * const storage = new IdbSwapStorage<MySwapData>();
 * await storage.store("swap-id", { ... });
 * ```
 */
export class IdbSwapStorage<T> implements SwapStorage<T> {
  readonly #db: LendaswapDatabase;

  constructor() {
    this.#db = getDatabase();
  }

  async get(swapId: string): Promise<T | null> {
    const record = await this.#db.swaps.get(swapId);
    return (record?.data as T) ?? null;
  }

  async store(swapId: string, data: T): Promise<void> {
    await this.#db.swaps.put({ swapId, data });
  }

  async delete(swapId: string): Promise<void> {
    await this.#db.swaps.delete(swapId);
  }

  async list(): Promise<string[]> {
    const records = await this.#db.swaps.toArray();
    return records.map((r) => r.swapId);
  }

  async getAll(): Promise<T[]> {
    const records = await this.#db.swaps.toArray();
    return records.map((r) => r.data as T);
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
  createSwapStorage: <T>(): SwapStorage<T> => new IdbSwapStorage<T>(),
};
