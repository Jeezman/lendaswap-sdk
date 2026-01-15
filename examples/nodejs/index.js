/**
 * Lendaswap Native SDK - Node.js Example
 *
 * This example demonstrates how to use the Lendaswap SDK with SQLite storage
 * for server-side Node.js applications.
 */

import {
    SqliteStorageHandle,
    ClientBuilder,
} from "@lendasat/lendaswap-sdk-native";

// Configuration
const CONFIG = {
    apiUrl: process.env.LENDASWAP_API_URL || "https://apilendaswap.lendasat.com",
    network: process.env.BITCOIN_NETWORK || "bitcoin",
    arkadeUrl: process.env.ARKADE_URL || "https://arkade.computer",
    esploraUrl: process.env.ESPLORA_URL || "https://mempool.space/api",
    dbPath: process.env.DB_PATH || "./lendaswap.db",
    mnemonic: process.env.MNEMONIC,
};

async function main() {
    console.log("=".repeat(60));
    console.log("Lendaswap Native SDK - Node.js Example");
    console.log("=".repeat(60));
    console.log();

    // 1. Open SQLite database
    console.log(`Opening SQLite database at: ${CONFIG.dbPath}`);
    const storage = SqliteStorageHandle.open(CONFIG.dbPath);
    console.log("✓ Database opened\n");

    // 2. Create client using builder pattern
    console.log("Creating Lendaswap client...");
    const client = new ClientBuilder()
        .storage(storage)
        .url(CONFIG.apiUrl)
        .network(CONFIG.network)
        .arkadeUrl(CONFIG.arkadeUrl)
        .esploraUrl(CONFIG.esploraUrl)
        .build();
    console.log("✓ Client created\n");

    // 3. Initialize (generates or loads wallet)
    console.log("Initializing wallet...");
    await client.init();
    console.log("✓ Wallet initialized\n");

    // 4. Get mnemonic
    const mnemonic = await client.getMnemonic();
    console.log("Wallet mnemonic (first 4 words):", mnemonic.split(" ").slice(0, 4).join(" ") + " ...");
    console.log();

    // 5. Get user ID
    const userIdXpub = await client.getUserIdXpub();
    console.log("User ID (xpub):", userIdXpub.substring(0, 20) + "...");
    console.log();

    // 6. Get API version
    console.log("Fetching API version...");
    const version = await client.getVersion();
    console.log(`✓ API Version: ${version.tag} (${version.commitHash.substring(0, 7)})\n`);

    // 7. Get available tokens
    console.log("Fetching available tokens...");
    const tokens = await client.getTokens();
    console.log(`✓ Found ${tokens.length} tokens:`);
    for (const token of tokens) {
        console.log(`  - ${token.symbol} (${token.tokenId}) on ${token.chain}`);
    }
    console.log();

    // 8. Get asset pairs
    console.log("Fetching available trading pairs...");
    const pairs = await client.getAssetPairs();
    console.log(`✓ Found ${pairs.length} trading pairs:`);
    for (const pair of pairs.slice(0, 5)) {
        console.log(`  - ${pair.source.symbol} → ${pair.target.symbol}`);
    }
    if (pairs.length > 5) {
        console.log(`  ... and ${pairs.length - 5} more`);
    }
    console.log();

    // 9. Get a quote
    console.log("Getting quote for 100,000 sats (BTC Lightning → USDC on Polygon)...");
    try {
        const quote = await client.getQuote("btc_lightning", "usdc_pol", 100000);
        console.log("✓ Quote received:");
        console.log(`  Exchange rate: ${quote.exchangeRate}`);
        console.log(`  Network fee: ${quote.networkFee} sats`);
        console.log(`  Protocol fee: ${quote.protocolFee} sats`);
        console.log(`  Min amount: ${quote.minAmount} sats`);
        console.log(`  Max amount: ${quote.maxAmount} sats`);
    } catch (error) {
        console.log(`✗ Quote failed: ${error.message}`);
    }
    console.log();

    // 10. List existing swaps
    console.log("Listing stored swaps...");
    const swaps = await client.listAll();
    console.log(`✓ Found ${swaps.length} stored swaps`);
    for (const swap of swaps.slice(0, 3)) {
        const response = swap.btcToEvmResponse || swap.evmToBtcResponse || swap.btcToArkadeResponse;
        if (response) {
            console.log(`  - ${response.id} (${swap.swapType}): ${response.status}`);
        }
    }
    if (swaps.length > 3) {
        console.log(`  ... and ${swaps.length - 3} more`);
    }
    console.log();

    console.log("=".repeat(60));
    console.log("Example complete!");
    console.log("=".repeat(60));
}

// Run the example
main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});
