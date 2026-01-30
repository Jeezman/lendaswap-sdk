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

// Legacy (v2) database constants for migration
const V2_DB_NAME = "lendaswap-v2";
const V2_WALLET_STORE = "wallet";
const V2_WALLET_KEY = "default";

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
  #migratedFromLegacy = false;

  constructor() {
    this.#db = getDatabase();
  }

  /**
   * Whether a legacy (v2) wallet was migrated during this session.
   *
   * When true, the caller should invoke `client.recoverSwaps()` to
   * restore swap history from the server.
   */
  get migratedFromLegacy(): boolean {
    return this.#migratedFromLegacy;
  }

  async getMnemonic(): Promise<string | null> {
    const record = await this.#db.wallet.get(MNEMONIC_KEY);
    if (record?.value) {
      return record.value as string;
    }

    // No mnemonic in v3 — try migrating from v2 (legacy WASM SDK)
    const v2Wallet = await readV2Wallet();
    if (!v2Wallet?.mnemonic) {
      return null;
    }

    // Persist to v3 so this migration only happens once
    await this.setMnemonic(v2Wallet.mnemonic);
    if (v2Wallet.keyIndex > 0) {
      await this.setKeyIndex(v2Wallet.keyIndex);
    }
    this.#migratedFromLegacy = true;

    return v2Wallet.mnemonic;
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

// ---------------------------------------------------------------------------
// Legacy v2 wallet migration
// ---------------------------------------------------------------------------

interface V2WalletData {
  mnemonic: string | null;
  keyIndex: number;
}

/**
 * Read wallet data from the legacy v2 (WASM SDK) IndexedDB database.
 *
 * The v2 database ("lendaswap-v2") stores wallet data as a single object
 * under key "default" in the "wallet" object store, with fields:
 * - `mnemonic`: string
 * - `key_index`: number
 *
 * Returns null if the v2 database doesn't exist or has no wallet data.
 */
function readV2Wallet(): Promise<V2WalletData | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }

    const request = indexedDB.open(V2_DB_NAME);

    // If onupgradeneeded fires, the database didn't exist — abort to
    // prevent creating an empty v2 database.
    request.onupgradeneeded = () => {
      request.transaction?.abort();
    };

    request.onerror = () => {
      resolve(null);
    };

    request.onsuccess = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(V2_WALLET_STORE)) {
        db.close();
        resolve(null);
        return;
      }

      try {
        const tx = db.transaction(V2_WALLET_STORE, "readonly");
        const store = tx.objectStore(V2_WALLET_STORE);
        const getReq = store.get(V2_WALLET_KEY);

        getReq.onsuccess = () => {
          db.close();
          const result = getReq.result;
          if (!result) {
            resolve(null);
            return;
          }
          resolve({
            mnemonic: result.mnemonic ?? null,
            keyIndex:
              typeof result.key_index === "number" ? result.key_index : 0,
          });
        };

        getReq.onerror = () => {
          db.close();
          resolve(null);
        };
      } catch {
        db.close();
        resolve(null);
      }
    };
  });
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
