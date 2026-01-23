#!/usr/bin/env node
/**
 * Lendaswap Native SDK - Node.js CLI Example
 *
 * This CLI demonstrates how to use the Lendaswap Native SDK with SQLite storage
 * for server-side Node.js applications.
 *
 * Usage:
 *   node index.js pairs                          - List available trading pairs
 *   node index.js tokens                         - List available tokens
 *   node index.js quote <from> <to> <amount>     - Get a quote
 *   node index.js swap <from> <to> <amount> <address> - Create a swap
 *   node index.js swaps                          - List stored swaps
 *   node index.js info                           - Show wallet and API info
 */

import {
    SqliteStorageHandle,
    ClientBuilder,
} from "@lendasat/lendaswap-sdk-native";

// Import commands
import { listPairs } from "./commands/pairs.js";
import { listTokens } from "./commands/tokens.js";
import { getQuote } from "./commands/quote.js";
import { createSwap } from "./commands/swap.js";
import { listSwaps } from "./commands/swaps.js";
import { showInfo } from "./commands/info.js";

// Configuration
export const CONFIG = {
    apiUrl: process.env.LENDASWAP_API_URL || "https://apilendaswap.lendasat.com",
    network: process.env.BITCOIN_NETWORK || "bitcoin",
    arkadeUrl: process.env.ARKADE_URL || "https://arkade.computer",
    esploraUrl: process.env.ESPLORA_URL || "https://mempool.space/api",
    dbPath: process.env.DB_PATH || "./lendaswap.db",
    mnemonic: process.env.MNEMONIC,
    // Optional API key for swap tracking
    apiKey: process.env.LENDASWAP_API_KEY,
};

// Create and initialize client
async function createClient() {
    const storage = SqliteStorageHandle.open(CONFIG.dbPath);
    let builder = new ClientBuilder()
        .storage(storage)
        .url(CONFIG.apiUrl)
        .network(CONFIG.network)
        .arkadeUrl(CONFIG.arkadeUrl)
        .esploraUrl(CONFIG.esploraUrl);

    // Set API key if provided (will be sent as X-API-Key header on swap creation)
    if (CONFIG.apiKey) {
        builder = builder.apiKey(CONFIG.apiKey);
    }

    const client = builder.build();

    await client.init(CONFIG.mnemonic);
    return client;
}

function showHelp() {
    console.log(`
Lendaswap CLI - Native Node.js SDK Example

Usage:
  node index.js <command> [options]

Commands:
  pairs                              List available trading pairs
  tokens                             List available tokens
  quote <from> <to> <amount>         Get a quote for a swap
  swap <from> <to> <amount> <addr>   Create a new swap
  swaps                              List stored swaps
  info                               Show wallet and API info
  help                               Show this help message

Examples:
  node index.js pairs
  node index.js tokens
  node index.js quote btc_lightning usdc_pol 100000
  node index.js swap btc_lightning usdc_pol 100000 0x1234...
  node index.js swaps
  node index.js info

Environment Variables:
  LENDASWAP_API_URL   API URL (default: https://apilendaswap.lendasat.com)
  BITCOIN_NETWORK     Network: bitcoin, testnet, regtest (default: bitcoin)
  ARKADE_URL          Arkade server URL
  ESPLORA_URL         Esplora API URL
  DB_PATH             SQLite database path (default: ./lendaswap.db)
  MNEMONIC            Wallet mnemonic (optional, generates new if not set)
  LENDASWAP_API_KEY   API key for swap tracking (optional, sent as X-API-Key header)
`);
}

// Main
async function main() {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command || command === "help" || command === "--help" || command === "-h") {
        showHelp();
        return;
    }

    const client = await createClient();

    switch (command) {
        case "pairs":
            await listPairs(client);
            break;
        case "tokens":
            await listTokens(client);
            break;
        case "quote":
            await getQuote(client, args[1], args[2], args[3]);
            break;
        case "swap":
            await createSwap(client, args[1], args[2], args[3], args[4], args[5]);
            break;
        case "swaps":
            await listSwaps(client);
            break;
        case "info":
            await showInfo(client, CONFIG);
            break;
        default:
            console.error(`Unknown command: ${command}`);
            console.error("Run 'node index.js help' for usage information.");
            process.exit(1);
    }
}

main().catch((error) => {
    console.error("Error:", error.message);
    process.exit(1);
});
