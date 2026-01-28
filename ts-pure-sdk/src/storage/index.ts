/**
 * Storage module for persisting wallet and swap data.
 *
 * This module provides a pluggable storage interface that can be implemented
 * for different backends (IndexedDB, SQLite, etc.).
 */

/**
 * Storage interface for wallet data (mnemonic, key index).
 *
 * Implementations should handle persistence of sensitive wallet data.
 * For browser environments, consider using IndexedDB with encryption.
 * For desktop/mobile, consider using SQLite with secure storage.
 */
export interface WalletStorage {
  /**
   * Get the stored mnemonic phrase.
   * @returns The mnemonic phrase, or null if not stored.
   */
  getMnemonic(): Promise<string | null>;

  /**
   * Store the mnemonic phrase.
   * @param mnemonic - The mnemonic phrase to store.
   */
  setMnemonic(mnemonic: string): Promise<void>;

  /**
   * Get the current key derivation index.
   * @returns The current key index, defaults to 0 if not set.
   */
  getKeyIndex(): Promise<number>;

  /**
   * Set the key derivation index.
   * @param index - The new key index.
   */
  setKeyIndex(index: number): Promise<void>;

  /**
   * Increment and return the current key index.
   * @returns The index before incrementing (the one to use).
   */
  incrementKeyIndex(): Promise<number>;

  /**
   * Clear all wallet data from storage.
   */
  clear(): Promise<void>;
}

/**
 * Storage interface for swap data.
 *
 * @template T - The type of swap data to store.
 */
export interface SwapStorage<T> {
  /**
   * Get swap data by ID.
   * @param swapId - The swap ID.
   * @returns The swap data, or null if not found.
   */
  get(swapId: string): Promise<T | null>;

  /**
   * Store swap data.
   * @param swapId - The swap ID.
   * @param data - The swap data to store.
   */
  store(swapId: string, data: T): Promise<void>;

  /**
   * Delete swap data by ID.
   * @param swapId - The swap ID.
   */
  delete(swapId: string): Promise<void>;

  /**
   * List all swap IDs.
   * @returns Array of swap IDs.
   */
  list(): Promise<string[]>;

  /**
   * Get all stored swaps.
   * @returns Array of all swap data.
   */
  getAll(): Promise<T[]>;

  /**
   * Clear all swap data from storage.
   */
  clear(): Promise<void>;
}

/**
 * In-memory implementation of WalletStorage.
 *
 * Useful for testing or temporary sessions where persistence is not required.
 * Data is lost when the application is closed.
 *
 * @example
 * ```ts
 * const storage = new InMemoryWalletStorage();
 * await storage.setMnemonic("your mnemonic phrase");
 * ```
 */
export class InMemoryWalletStorage implements WalletStorage {
  #mnemonic: string | null = null;
  #keyIndex = 0;

  async getMnemonic(): Promise<string | null> {
    return this.#mnemonic;
  }

  async setMnemonic(mnemonic: string): Promise<void> {
    this.#mnemonic = mnemonic;
  }

  async getKeyIndex(): Promise<number> {
    return this.#keyIndex;
  }

  async setKeyIndex(index: number): Promise<void> {
    this.#keyIndex = index;
  }

  async incrementKeyIndex(): Promise<number> {
    const current = this.#keyIndex;
    this.#keyIndex = current + 1;
    return current;
  }

  async clear(): Promise<void> {
    this.#mnemonic = null;
    this.#keyIndex = 0;
  }
}

/**
 * In-memory implementation of SwapStorage.
 *
 * Useful for testing or temporary sessions where persistence is not required.
 * Data is lost when the application is closed.
 *
 * @example
 * ```ts
 * const storage = new InMemorySwapStorage<MySwapData>();
 * await storage.store("swap-id", { ... });
 * ```
 */
export class InMemorySwapStorage<T> implements SwapStorage<T> {
  readonly #data = new Map<string, T>();

  async get(swapId: string): Promise<T | null> {
    return this.#data.get(swapId) ?? null;
  }

  async store(swapId: string, data: T): Promise<void> {
    this.#data.set(swapId, data);
  }

  async delete(swapId: string): Promise<void> {
    this.#data.delete(swapId);
  }

  async list(): Promise<string[]> {
    return Array.from(this.#data.keys());
  }

  async getAll(): Promise<T[]> {
    return Array.from(this.#data.values());
  }

  async clear(): Promise<void> {
    this.#data.clear();
  }
}

/**
 * Factory function type for creating storage instances.
 *
 * This allows the Client to accept different storage backends.
 */
export type StorageFactory = {
  createWalletStorage: () => WalletStorage;
  createSwapStorage: <T>() => SwapStorage<T>;
};

/**
 * In-memory storage factory.
 *
 * Creates in-memory storage instances for testing or temporary sessions.
 */
export const inMemoryStorageFactory: StorageFactory = {
  createWalletStorage: () => new InMemoryWalletStorage(),
  createSwapStorage: <T>() => new InMemorySwapStorage<T>(),
};
