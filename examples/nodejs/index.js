#!/usr/bin/env node
/**
 * Lendaswap Native SDK - Node.js CLI Example
 *
 * This CLI demonstrates how to use the Lendaswap SDK with SQLite storage
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
    SwapStatus,
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

// Create and initialize client
async function createClient() {
    const storage = SqliteStorageHandle.open(CONFIG.dbPath);
    const client = new ClientBuilder()
        .storage(storage)
        .url(CONFIG.apiUrl)
        .network(CONFIG.network)
        .arkadeUrl(CONFIG.arkadeUrl)
        .esploraUrl(CONFIG.esploraUrl)
        .build();

    await client.init(CONFIG.mnemonic);
    return client;
}

// Commands

async function listPairs(client) {
    console.log("Fetching available trading pairs...\n");
    const pairs = await client.getAssetPairs();

    console.log("Available Trading Pairs:");
    console.log("-".repeat(50));
    for (const pair of pairs) {
        console.log(`  ${pair.source.symbol.padEnd(12)} → ${pair.target.symbol.padEnd(12)} (${pair.source.tokenId} → ${pair.target.tokenId})`);
    }
    console.log("-".repeat(50));
    console.log(`Total: ${pairs.length} pairs`);
}

async function listTokens(client) {
    console.log("Fetching available tokens...\n");
    const tokens = await client.getTokens();

    console.log("Available Tokens:");
    console.log("-".repeat(60));
    console.log("  Token ID".padEnd(20) + "Symbol".padEnd(10) + "Chain".padEnd(12) + "Name");
    console.log("-".repeat(60));
    for (const token of tokens) {
        console.log(`  ${token.tokenId.padEnd(18)} ${token.symbol.padEnd(10)} ${token.chain.padEnd(12)} ${token.name}`);
    }
    console.log("-".repeat(60));
    console.log(`Total: ${tokens.length} tokens`);
}

async function getQuote(client, from, to, amount) {
    if (!from || !to || !amount) {
        console.error("Usage: node index.js quote <from> <to> <amount>");
        console.error("Example: node index.js quote btc_lightning usdc_pol 100000");
        process.exit(1);
    }

    const amountNum = parseInt(amount, 10);
    if (isNaN(amountNum)) {
        console.error("Error: amount must be a number (in satoshis for BTC sources)");
        process.exit(1);
    }

    console.log(`Getting quote: ${from} → ${to} (amount: ${amountNum})...\n`);

    try {
        const quote = await client.getQuote(from, to, amountNum);

        console.log("Quote Details:");
        console.log("-".repeat(40));
        console.log(`  From:           ${from}`);
        console.log(`  To:             ${to}`);
        console.log(`  Amount:         ${amountNum}`);
        console.log("-".repeat(40));
        console.log(`  Exchange Rate:  ${quote.exchangeRate}`);
        console.log(`  Network Fee:    ${quote.networkFee} sats`);
        console.log(`  Protocol Fee:   ${quote.protocolFee} sats`);
        console.log(`  Fee Rate:       ${(quote.protocolFeeRate * 100).toFixed(2)}%`);
        console.log("-".repeat(40));
        console.log(`  Min Amount:     ${quote.minAmount} sats`);
        console.log(`  Max Amount:     ${quote.maxAmount} sats`);
    } catch (error) {
        console.error(`Error getting quote: ${error.message}`);
        process.exit(1);
    }
}

// Helper to wait for a given time
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Poll swap status and show progress
async function waitForSwapCompletion(client, swapId) {
    console.log("\nWaiting for swap completion...");
    console.log("(Press Ctrl+C to exit)\n");

    let lastStatus = "";
    let claimInitiated = false;
    const startTime = Date.now();

    while (true) {
        try {
            const swapData = await client.getSwap(swapId);
            const response = swapData.btcToEvmResponse || swapData.evmToBtcResponse || swapData.btcToArkadeResponse;

            if (!response) {
                console.log("  ⚠ Could not fetch swap status");
                await sleep(5000);
                continue;
            }

            const status = response.status;
            const elapsed = Math.floor((Date.now() - startTime) / 1000);

            // Only log if status changed
            if (status !== lastStatus) {
                const timestamp = new Date().toLocaleTimeString();
                console.log(`[${timestamp}] Status: ${status}`);
                lastStatus = status;
            }

            // Handle terminal states
            if (status === SwapStatus.Expired) {
                console.log("\n❌ Swap expired - no more funding possible");
                console.log("   The swap window has closed.");
                process.exit(1);
            }

            if (status === SwapStatus.ServerRedeemed) {
                console.log("\n✅ Swap completed successfully!");
                console.log("\nTransaction Details:");
                console.log("-".repeat(60));

                // Determine swap type and print relevant transaction IDs
                if (swapData.btcToEvmResponse) {
                    // BTC (Lightning/Arkade) → EVM swap
                    const r = swapData.btcToEvmResponse;
                    if (r.bitcoinHtlcFundTxid) {
                        console.log(`  Client Funded (Arkade):`);
                        console.log(`    https://arkade.space/tx/${r.bitcoinHtlcFundTxid}`);
                    }
                    if (r.evmHtlcFundTxid) {
                        console.log(`  Server Funded (Polygon):`);
                        console.log(`    https://polygonscan.com/tx/${r.evmHtlcFundTxid}`);
                    }
                    if (r.evmHtlcClaimTxid) {
                        console.log(`  Client Claimed (Polygon):`);
                        console.log(`    https://polygonscan.com/tx/${r.evmHtlcClaimTxid}`);
                    }
                    if (r.bitcoinHtlcClaimTxid) {
                        console.log(`  Server Claimed (Arkade):`);
                        console.log(`    https://arkade.space/tx/${r.bitcoinHtlcClaimTxid}`);
                    }
                } else if (swapData.evmToBtcResponse) {
                    // EVM → BTC (Lightning/Arkade) swap
                    const r = swapData.evmToBtcResponse;
                    if (r.evmHtlcFundTxid) {
                        console.log(`  Client Funded (Polygon):`);
                        console.log(`    https://polygonscan.com/tx/${r.evmHtlcFundTxid}`);
                    }
                    if (r.bitcoinHtlcFundTxid) {
                        console.log(`  Server Funded (Arkade):`);
                        console.log(`    https://arkade.space/tx/${r.bitcoinHtlcFundTxid}`);
                    }
                    if (r.bitcoinHtlcClaimTxid) {
                        console.log(`  Client Claimed (Arkade):`);
                        console.log(`    https://arkade.space/tx/${r.bitcoinHtlcClaimTxid}`);
                    }
                    if (r.evmHtlcClaimTxid) {
                        console.log(`  Server Claimed (Polygon):`);
                        console.log(`    https://polygonscan.com/tx/${r.evmHtlcClaimTxid}`);
                    }
                } else if (swapData.btcToArkadeResponse) {
                    // On-chain BTC → Arkade swap
                    const r = swapData.btcToArkadeResponse;
                    if (r.btcFundTxid) {
                        console.log(`  Client Funded (On-chain BTC):`);
                        console.log(`    https://mempool.space/tx/${r.btcFundTxid}`);
                    }
                    if (r.arkadeFundTxid) {
                        console.log(`  Server Funded (Arkade):`);
                        console.log(`    https://arkade.space/tx/${r.arkadeFundTxid}`);
                    }
                    if (r.arkadeClaimTxid) {
                        console.log(`  Client Claimed (Arkade):`);
                        console.log(`    https://arkade.space/tx/${r.arkadeClaimTxid}`);
                    }
                    if (r.btcClaimTxid) {
                        console.log(`  Server Claimed (On-chain BTC):`);
                        console.log(`    https://mempool.space/tx/${r.btcClaimTxid}`);
                    }
                }

                console.log("-".repeat(60));
                return;
            }

            if (status === SwapStatus.ClientRefunded) {
                console.log("\n↩️  Swap was refunded");
                return;
            }

            if (status === SwapStatus.ClientFundedServerRefunded) {
                console.log("\n↩️  Server refunded - swap timed out");
                return;
            }

            // When server has funded, initiate the claim via Gelato relay
            if (status === SwapStatus.ServerFunded && !claimInitiated) {
                console.log("\n  🔄 Server funded! Initiating claim via Gelato relay...");
                try {
                    await client.claimGelato(swapId);
                    claimInitiated = true;
                    console.log("  ✓ Claim request submitted, waiting for confirmation...\n");
                } catch (claimError) {
                    console.log(`  ⚠ Claim error: ${claimError.message}`);
                    // Will retry on next iteration
                }
            }

            // Show progress for intermediate states
            if (status === SwapStatus.ClientFundingSeen) {
                process.stdout.write(`\r  ⏳ Funding seen - waiting for confirmation... (${elapsed}s)`);
            } else if (status === SwapStatus.ClientFunded) {
                process.stdout.write(`\r  ⏳ Client funded - waiting for server... (${elapsed}s)`);
            } else if (status === SwapStatus.ServerFunded) {
                process.stdout.write(`\r  ⏳ Server funded - claiming via Gelato... (${elapsed}s)`);
            } else if (status === SwapStatus.ClientRedeeming) {
                process.stdout.write(`\r  ⏳ Claiming funds... (${elapsed}s)`);
            } else if (status === SwapStatus.ClientRedeemed) {
                process.stdout.write(`\r  ⏳ Claimed - waiting for server to redeem... (${elapsed}s)`);
            } else if (status === SwapStatus.Pending) {
                process.stdout.write(`\r  ⏳ Pending - waiting for funding... (${elapsed}s)`);
            } else {
                process.stdout.write(`\r  ⏳ ${status}... (${elapsed}s)`);
            }

            await sleep(3000);
        } catch (error) {
            console.log(`\n  ⚠ Error polling status: ${error.message}`);
            await sleep(5000);
        }
    }
}

async function createSwap(client, from, to, amount, address, userAddress) {
    if (!from || !to || !amount || !address) {
        console.error("Usage: node index.js swap <from> <to> <amount> <target_address>");
        console.error("");
        console.error("Supported swap directions:");
        console.error("");
        console.error("  BTC Lightning → USDC (Polygon):");
        console.error("    node index.js swap btc_lightning usdc_pol 100000 0xTargetAddress");
        console.error("");
        console.error("  BTC Arkade → USDC (Polygon):");
        console.error("    node index.js swap btc_arkade usdc_pol 100000 0xTargetAddress");
        console.error("");
        console.error("  BTC On-chain → BTC Arkade:");
        console.error("    node index.js swap btc_onchain btc_arkade 100000 arkAddress");
        process.exit(1);
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum)) {
        console.error("Error: amount must be a number");
        process.exit(1);
    }

    console.log(`Creating swap: ${from} → ${to}`);
    console.log(`  Amount: ${amountNum}`);
    console.log(`  Target Address: ${address}`);
    console.log("");

    try {
        let swap;
        let swapId;

        // BTC Lightning → USDC Polygon
        if (from === "btc_lightning" && to === "usdc_pol") {
            swap = await client.createLightningToEvmSwap(
                address,           // target EVM address
                amountNum,         // source amount in sats
                null,              // target amount (null = use source)
                to,                // target token
                "polygon",         // target chain
                null               // referral code
            );
            swapId = swap.id;
            console.log("⚡ Lightning to USDC (Polygon) Swap Created!");
            console.log("-".repeat(50));
            console.log(`  Swap ID:        ${swap.id}`);
            console.log(`  Status:         ${swap.status}`);
            console.log(`  Amount:         ${swap.satsReceive} sats`);
            console.log("");
            console.log("  Lightning Invoice (pay this):");
            console.log(`  ${swap.lnInvoice}`);
            console.log("-".repeat(50));

            // BTC Arkade → USDC Polygon
        } else if (from === "btc_arkade" && to === "usdc_pol") {
            swap = await client.createArkadeToEvmSwap(
                address,           // target EVM address
                amountNum,         // source amount in sats
                null,              // target amount
                to,                // target token
                "polygon",         // target chain
                null               // referral code
            );
            swapId = swap.id;
            console.log("🏦 Arkade to USDC (Polygon) Swap Created!");
            console.log("-".repeat(50));
            console.log(`  Swap ID:        ${swap.id}`);
            console.log(`  Status:         ${swap.status}`);
            console.log(`  Amount:         ${swap.satsReceive} sats`);
            console.log("");
            console.log("  VHTLC Address (fund this on Arkade):");
            console.log(`  ${swap.htlcAddressArkade}`);
            console.log("-".repeat(50));

            // BTC On-chain → BTC Arkade
        } else if (from === "btc_onchain" && to === "btc_arkade") {
            swap = await client.createBitcoinToArkadeSwap(
                address,           // target Arkade address
                amountNum,         // sats to receive on Arkade
                null               // referral code
            );
            swapId = swap.id;
            console.log("₿ On-chain BTC to Arkade Swap Created!");
            console.log("-".repeat(50));
            console.log(`  Swap ID:        ${swap.id}`);
            console.log(`  Status:         ${swap.status}`);
            console.log(`  Amount:         ${swap.satsReceive} sats`);
            console.log(`  Fee:            ${swap.feeSats} sats`);
            console.log("");
            console.log("  P2WSH Address (send BTC here):");
            console.log(`  ${swap.btcHtlcAddress}`);
            console.log("-".repeat(50));

        } else {
            console.error(`❌ Unsupported swap direction: ${from} → ${to}`);
            console.error("");
            console.error("Supported directions:");
            console.error("  • btc_lightning → usdc_pol");
            console.error("  • btc_arkade → usdc_pol");
            console.error("  • btc_onchain → btc_arkade");
            process.exit(1);
        }

        // Wait for swap completion
        await waitForSwapCompletion(client, swapId);

    } catch (error) {
        console.error(`Error creating swap: ${error.message}`);
        process.exit(1);
    }
}

async function listSwaps(client) {
    console.log("Fetching stored swaps...\n");
    const swaps = await client.listAll();

    if (swaps.length === 0) {
        console.log("No swaps found.");
        return;
    }

    console.log("Stored Swaps:");
    console.log("-".repeat(80));
    for (const swap of swaps) {
        const response = swap.btcToEvmResponse || swap.evmToBtcResponse || swap.btcToArkadeResponse;
        if (response) {
            console.log(`  ID:     ${response.id}`);
            console.log(`  Type:   ${swap.swapType}`);
            console.log(`  Status: ${response.status}`);
            console.log(`  From:   ${response.sourceToken} → ${response.targetToken}`);
            console.log("-".repeat(80));
        }
    }
    console.log(`Total: ${swaps.length} swaps`);
}

async function showInfo(client) {
    console.log("Wallet & API Information");
    console.log("=".repeat(50));

    // Wallet info
    const mnemonic = await client.getMnemonic();
    const userIdXpub = await client.getUserIdXpub();
    console.log("\nWallet:");
    console.log(`  Mnemonic:  ${mnemonic.split(" ").slice(0, 4).join(" ")} ...`);
    console.log(`  User ID:   ${userIdXpub.substring(0, 30)}...`);

    // API info
    const version = await client.getVersion();
    console.log("\nAPI:");
    console.log(`  URL:       ${CONFIG.apiUrl}`);
    console.log(`  Version:   ${version.tag}`);
    console.log(`  Commit:    ${version.commitHash.substring(0, 7)}`);

    // Config
    console.log("\nConfig:");
    console.log(`  Network:   ${CONFIG.network}`);
    console.log(`  Database:  ${CONFIG.dbPath}`);
    console.log(`  Arkade:    ${CONFIG.arkadeUrl}`);
    console.log(`  Esplora:   ${CONFIG.esploraUrl}`);
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
            await showInfo(client);
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
