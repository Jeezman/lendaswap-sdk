#!/usr/bin/env tsx
/**
 * Lendaswap Pure TypeScript SDK - CLI Example
 *
 * This CLI demonstrates how to use the Lendaswap Pure TypeScript SDK
 * with SQLite storage. For browser apps, use IdbWalletStorage instead.
 *
 * Usage:
 *   tsx src/index.ts pairs                          - List available trading pairs
 *   tsx src/index.ts quote <from> <to> <amount>     - Get a quote
 *   tsx src/index.ts swap <from> <to> <amount> <address> - Create a swap
 *   tsx src/index.ts watch <id>                     - Watch swap status
 *   tsx src/index.ts redeem <id>                    - Redeem a swap
 *   tsx src/index.ts refund <id>                    - Refund a swap
 *   tsx src/index.ts swaps                          - List stored swaps
 *   tsx src/index.ts info                           - Show wallet info
 */

// Load .env file before anything else
import "dotenv/config";

import { Client } from "@lendasat/lendaswap-sdk-pure";
import { sqliteStorageFactory } from "@lendasat/lendaswap-sdk-pure/node";
import * as path from "node:path";
import * as os from "node:os";

import { listPairs } from "./commands/pairs.js";
import { getQuote } from "./commands/quote.js";
import { createSwap } from "./commands/swap.js";
import { listSwaps } from "./commands/swaps.js";
import { showInfo } from "./commands/info.js";
import { watchSwap } from "./commands/watch.js";
import { redeemSwap } from "./commands/redeem.js";
import { refundSwap } from "./commands/refund.js";

// Configuration from environment variables
export const CONFIG = {
  apiUrl:
    process.env.LENDASWAP_API_URL || "https://apilendaswap.lendasat.com/",
  mnemonic: process.env.MNEMONIC,
  apiKey: process.env.LENDASWAP_API_KEY,
  dbPath: process.env.LENDASWAP_DB_PATH || path.join(os.homedir(), ".lendaswap", "data.db"),
};

// Ensure the database directory exists
import * as fs from "node:fs";
const dbDir = path.dirname(CONFIG.dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// SQLite storage (persists to disk)
const { walletStorage, swapStorage, close: closeStorage } = sqliteStorageFactory(CONFIG.dbPath);

export { swapStorage };

/**
 * Create and initialize the client.
 */
async function createClient(): Promise<Client> {
  let builder = Client.builder()
    .withBaseUrl(CONFIG.apiUrl)
    .withSignerStorage(walletStorage)
    .withSwapStorage(swapStorage);

  if (CONFIG.apiKey) {
    builder = builder.withApiKey(CONFIG.apiKey);
  }

  if (CONFIG.mnemonic) {
    builder = builder.withMnemonic(CONFIG.mnemonic);
  }

  return builder.build();
}

function showHelp(): void {
  console.log(`
Lendaswap CLI - Pure TypeScript SDK Example

Usage:
  tsx src/index.ts <command> [options]

Commands:
  pairs                              List available trading pairs
  quote <from> <to> <amount>         Get a quote for a swap
  swap <from> <to> <amount> <addr>   Create a new swap
  watch <id>                         Watch a swap's status (polls backend)
  redeem <id>                        Redeem a swap (when serverfunded)
  refund <id>                        Refund a swap (when pending/expired)
  swaps                              List locally stored swaps
  info                               Show wallet info
  help                               Show this help message

Examples:
  tsx src/index.ts pairs
  tsx src/index.ts quote btc_lightning usdc_pol 100000
  tsx src/index.ts swap btc_lightning usdc_pol 100000 0x1234...
  tsx src/index.ts watch 12345678-1234-1234-1234-123456789abc
  tsx src/index.ts redeem 12345678-1234-1234-1234-123456789abc
  tsx src/index.ts refund 12345678-1234-1234-1234-123456789abc
  tsx src/index.ts swaps
  tsx src/index.ts info

Environment Variables:
  LENDASWAP_API_URL   API URL (default: https://apilendaswap.lendasat.com/)
  MNEMONIC            Wallet mnemonic (optional, generates new if not set)
  LENDASWAP_API_KEY   API key for authentication (optional)
  LENDASWAP_DB_PATH   SQLite database path (default: ~/.lendaswap/data.db)
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    showHelp();
    return;
  }

  const client = await createClient();

  switch (command) {
    case "pairs":
      await listPairs(client);
      break;
    case "quote":
      await getQuote(client, args[1], args[2], args[3]);
      break;
    case "swap":
      await createSwap(client, args[1], args[2], args[3], args[4]);
      break;
    case "watch":
      await watchSwap(client, args[1]);
      break;
    case "redeem":
      await redeemSwap(client, swapStorage, args[1]);
      break;
    case "refund":
      await refundSwap(client, swapStorage, args[1]);
      break;
    case "swaps":
      await listSwaps(swapStorage);
      break;
    case "info":
      await showInfo(client, CONFIG);
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error("Run 'tsx src/index.ts help' for usage information.");
      process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
  })
  .finally(() => {
    closeStorage();
  });
