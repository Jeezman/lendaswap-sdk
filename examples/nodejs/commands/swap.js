/**
 * Create and monitor a swap.
 */

import {SwapStatus} from "@lendasat/lendaswap-sdk-native";
import {printSwapDetails} from "../utils/print-swap-details.js";

/**
 * Helper to wait for a given time.
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Poll swap status and show progress.
 */
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
                console.log("  Could not fetch swap status");
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
                console.log("\n Swap expired - no more funding possible");
                console.log("   The swap window has closed.");
                process.exit(1);
            }

            if (status === SwapStatus.ServerRedeemed) {
                console.log("\n Swap completed successfully!");
                console.log("\nTransaction Details:");
                console.log("-".repeat(60));
                printSwapDetails(swapData, false);
                console.log("-".repeat(60));
                return;
            }

            if (status === SwapStatus.ClientRefunded) {
                console.log("\n Swap was refunded");
                return;
            }

            if (status === SwapStatus.ClientFundedServerRefunded) {
                console.log("\n Server refunded - swap timed out");
                return;
            }

            // When server has funded, initiate the claim via Gelato relay
            if (status === SwapStatus.ServerFunded && !claimInitiated) {
                console.log("\n  Server funded! Initiating claim via Gelato relay...");
                try {
                    await client.claimGelato(swapId);
                    claimInitiated = true;
                    console.log("  Claim request submitted, waiting for confirmation...\n");
                } catch (claimError) {
                    console.log(`  Claim error: ${claimError.message}`);
                    // Will retry on next iteration
                }
            }

            // Show progress for intermediate states
            if (status === SwapStatus.ClientFundingSeen) {
                process.stdout.write(`\r  Funding seen - waiting for confirmation... (${elapsed}s)`);
            } else if (status === SwapStatus.ClientFunded) {
                process.stdout.write(`\r  Client funded - waiting for server... (${elapsed}s)`);
            } else if (status === SwapStatus.ServerFunded) {
                process.stdout.write(`\r  Server funded - claiming via Gelato... (${elapsed}s)`);
            } else if (status === SwapStatus.ClientRedeeming) {
                process.stdout.write(`\r  Claiming funds... (${elapsed}s)`);
            } else if (status === SwapStatus.ClientRedeemed) {
                process.stdout.write(`\r  Claimed - waiting for server to redeem... (${elapsed}s)`);
            } else if (status === SwapStatus.Pending) {
                process.stdout.write(`\r  Pending - waiting for funding... (${elapsed}s)`);
            } else {
                process.stdout.write(`\r  ${status}... (${elapsed}s)`);
            }

            await sleep(3000);
        } catch (error) {
            console.log(`\n  Error polling status: ${error.message}`);
            await sleep(5000);
        }
    }
}

/**
 * Create a new swap.
 */
export async function createSwap(client, from, to, amount, address, userAddress) {
    if (!from || !to || !amount || !address) {
        console.error("Usage: node index.js swap <from> <to> <amount> <target_address>");
        console.error("");
        console.error("Supported swap directions:");
        console.error("");
        console.error("  BTC Lightning -> USDC (Polygon):");
        console.error("    node index.js swap btc_lightning usdc_pol 100000 0xTargetAddress");
        console.error("");
        console.error("  BTC Arkade -> USDC (Polygon):");
        console.error("    node index.js swap btc_arkade usdc_pol 100000 0xTargetAddress");
        console.error("");
        console.error("  BTC On-chain -> BTC Arkade:");
        console.error("    node index.js swap btc_onchain btc_arkade 100000 arkAddress");
        process.exit(1);
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum)) {
        console.error("Error: amount must be a number");
        process.exit(1);
    }

    console.log(`Creating swap: ${from} -> ${to}`);
    console.log(`  Amount: ${amountNum}`);
    console.log(`  Target Address: ${address}`);
    console.log("");

    try {
        let swap;
        let swapId;

        // BTC Lightning -> USDC Polygon
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
            console.log("Lightning to USDC (Polygon) Swap Created!");
            console.log("-".repeat(50));
            console.log(`  Swap ID:        ${swap.id}`);
            console.log(`  Status:         ${swap.status}`);
            console.log(`  Amount:         ${swap.satsReceive} sats`);
            console.log(`  Asset Amount:   ${swap.assetAmount} `);
            console.log("");
            console.log("  Lightning Invoice (pay this):");
            console.log(`  ${swap.lnInvoice}`);
            console.log("-".repeat(50));

            // BTC Arkade -> USDC Polygon
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
            console.log("Arkade to USDC (Polygon) Swap Created!");
            console.log("-".repeat(50));
            console.log(`  Swap ID:        ${swap.id}`);
            console.log(`  Status:         ${swap.status}`);
            console.log(`  Amount:         ${swap.satsReceive} sats`);
            console.log(`  Asset Amount:   ${swap.assetAmount} `);
            console.log("");
            console.log("  VHTLC Address (fund this on Arkade):");
            console.log(`  ${swap.htlcAddressArkade}`);
            console.log("-".repeat(50));

            // BTC On-chain -> BTC Arkade
        } else if (from === "btc_onchain" && to === "btc_arkade") {
            swap = await client.createBitcoinToArkadeSwap(
                address,           // target Arkade address
                amountNum,         // sats to receive on Arkade
                null               // referral code
            );
            swapId = swap.id;
            console.log("On-chain BTC to Arkade Swap Created!");
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
            console.error(`Unsupported swap direction: ${from} -> ${to}`);
            console.error("");
            console.error("Supported directions:");
            console.error("  - btc_lightning -> usdc_pol");
            console.error("  - btc_arkade -> usdc_pol");
            console.error("  - btc_onchain -> btc_arkade");
            process.exit(1);
        }

        // Wait for swap completion
        await waitForSwapCompletion(client, swapId);

    } catch (error) {
        console.error(`Error creating swap: ${error.message}`);
        process.exit(1);
    }
}
