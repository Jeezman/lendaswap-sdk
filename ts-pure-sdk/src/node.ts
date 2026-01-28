/**
 * Node.js-specific exports for the Lendaswap SDK.
 *
 * This module provides SQLite-based storage implementations
 * that only work in Node.js environments.
 *
 * @example
 * ```ts
 * import { Client } from "@lendasat/lendaswap-sdk-pure";
 * import { SqliteWalletStorage, SqliteSwapStorage } from "@lendasat/lendaswap-sdk-pure/node";
 *
 * const client = await Client.builder()
 *   .withSignerStorage(new SqliteWalletStorage("./lendaswap.db"))
 *   .withSwapStorage(new SqliteSwapStorage("./lendaswap.db"))
 *   .build();
 * ```
 */

export {
  SqliteSwapStorage,
  SqliteWalletStorage,
  sqliteStorageFactory,
} from "./storage/sqlite.js";
