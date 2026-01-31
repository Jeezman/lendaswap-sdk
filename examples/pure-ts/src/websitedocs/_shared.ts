import "dotenv/config";

import type { Client, SwapStorage } from "@lendasat/lendaswap-sdk-pure";
import { Client as ClientClass } from "@lendasat/lendaswap-sdk-pure";
import { sqliteStorageFactory } from "@lendasat/lendaswap-sdk-pure/node";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

export const CONFIG = {
  apiUrl:
    process.env.LENDASWAP_API_URL || "https://apilendaswap.lendasat.com/",
  mnemonic: process.env.MNEMONIC,
  evmMnemonic: process.env.EVM_MNEMONIC,
  apiKey: process.env.LENDASWAP_API_KEY,
  dbPath:
    process.env.LENDASWAP_DB_PATH ||
    path.join(os.homedir(), ".lendaswap", "data.db"),
  esploraUrl: process.env.ESPLORA_URL,
};

export interface ExampleClient {
  client: Client;
  swapStorage: SwapStorage;
  close: () => void;
}

/**
 * Creates and initializes a client for example scripts.
 *
 * Equivalent to the website docs' IdbWalletStorage/IdbSwapStorage setup,
 * but using SQLite for Node.js.
 */
export async function createExampleClient(): Promise<ExampleClient> {
  // Ensure the database directory exists
  const dbDir = path.dirname(CONFIG.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const {
    walletStorage,
    swapStorage,
    close,
  } = sqliteStorageFactory(CONFIG.dbPath);

  let builder = ClientClass.builder()
    .withBaseUrl(CONFIG.apiUrl)
    .withSignerStorage(walletStorage)
    .withSwapStorage(swapStorage);

  if (CONFIG.apiKey) {
    builder = builder.withApiKey(CONFIG.apiKey);
  }

  if (CONFIG.mnemonic) {
    builder = builder.withMnemonic(CONFIG.mnemonic);
  }

  if (CONFIG.esploraUrl) {
    builder = builder.withEsploraUrl(CONFIG.esploraUrl);
  }

  const client = await builder.build();

  return { client, swapStorage, close };
}
