#!/usr/bin/env tsx
/**
 * Lendaswap Pure TypeScript SDK - CLI Example
 *
 * This CLI demonstrates how to use the Lendaswap Pure TypeScript SDK
 * with in-memory storage. For browser apps, use IdbWalletStorage instead.
 *
 * Usage:
 *   tsx src/index.ts pairs                          - List available trading pairs
 *   tsx src/index.ts quote <from> <to> <amount>     - Get a quote
 *   tsx src/index.ts swap <from> <to> <amount> <address> - Create a swap
 *   tsx src/index.ts swaps                          - List stored swaps (from recovery)
 *   tsx src/index.ts info                           - Show wallet info
 */

import {
  Client,
  InMemoryWalletStorage,
  InMemorySwapStorage,
} from "@lendasat/lendaswap-sdk-pure";

import { listPairs } from "./commands/pairs.js";
import { getQuote } from "./commands/quote.js";
import { createSwap } from "./commands/swap.js";
import { listSwaps } from "./commands/swaps.js";
import { showInfo } from "./commands/info.js";

// Configuration from environment variables
export const CONFIG = {
  apiUrl:
    process.env.LENDASWAP_API_URL || "https://apilendaswap.lendasat.com/",
  mnemonic: process.env.MNEMONIC,
  apiKey: process.env.LENDASWAP_API_KEY,
};

// Shared storage instances (persists across commands in same process)
const walletStorage = new InMemoryWalletStorage();
const swapStorage = new InMemorySwapStorage();

export { swapStorage };

/**
 * Create and initialize the client.
 */
async function createClient(): Promise<Client> {
  let builder = Client.builder()
    .withBaseUrl(CONFIG.apiUrl)
    .withSignerStorage(walletStorage);

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
  swaps                              Recover and list swaps from server
  info                               Show wallet info
  help                               Show this help message

Examples:
  tsx src/index.ts pairs
  tsx src/index.ts quote btc_lightning usdc_pol 100000
  tsx src/index.ts swap btc_lightning usdc_pol 100000 0x1234...
  tsx src/index.ts swaps
  tsx src/index.ts info

Environment Variables:
  LENDASWAP_API_URL   API URL (default: https://apilendaswap.lendasat.com/)
  MNEMONIC            Wallet mnemonic (optional, generates new if not set)
  LENDASWAP_API_KEY   API key for authentication (optional)
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
      await createSwap(client, swapStorage, args[1], args[2], args[3], args[4]);
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

main().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
