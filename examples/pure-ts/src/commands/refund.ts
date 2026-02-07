/**
 * Refund a swap that has not completed.
 *
 * For Lightning swaps: No action needed (auto-expires)
 * For on-chain swaps: Builds a refund transaction to broadcast
 * For Arkade swaps: Executes off-chain refund via Arkade protocol
 */

import type { Client, SwapStorage } from "@lendasat/lendaswap-sdk-pure";

export async function refundSwap(
  client: Client,
  swapStorage: SwapStorage | undefined,
  swapId: string | undefined,
  destinationAddress: string | undefined,
  feeRateStr: string | undefined,
  dryRunFlag: string | undefined,
): Promise<void> {
  if (!swapId) {
    console.error("Usage: tsx src/index.ts refund <swap-id> [destination-address] [fee-rate] [--dry-run]");
    console.error("");
    console.error("Arguments:");
    console.error("  swap-id             The swap ID to refund");
    console.error("  destination-address Address to receive refund:");
    console.error("                      - Bitcoin address for on-chain swaps");
    console.error("                      - Arkade address for Arkade swaps");
    console.error("  fee-rate            Fee rate in sat/vB (on-chain only, default: 2)");
    console.error("  --dry-run           Build transaction without broadcasting (on-chain only)");
    console.error("");
    console.error("Examples:");
    console.error("  # Check if refund is available");
    console.error("  tsx src/index.ts refund 12345678-1234-1234-1234-123456789abc");
    console.error("");
    console.error("  # Refund on-chain swap to a Bitcoin address");
    console.error("  tsx src/index.ts refund 12345678-... bc1q... 5");
    console.error("");
    console.error("  # Refund Arkade swap to an Arkade address");
    console.error("  tsx src/index.ts refund 12345678-... ark1...");
    console.error("");
    console.error("  # Build refund transaction without broadcasting (on-chain only)");
    console.error("  tsx src/index.ts refund 12345678-... bc1q... 5 --dry-run");
    process.exit(1);
  }

  // Check for --dry-run flag in any position
  const dryRun =
    dryRunFlag === "--dry-run" ||
    destinationAddress === "--dry-run" ||
    feeRateStr === "--dry-run";

  // Adjust arguments if --dry-run was in an unexpected position
  let actualDestination = destinationAddress;
  let actualFeeRate = feeRateStr;
  if (destinationAddress === "--dry-run") {
    actualDestination = undefined;
    actualFeeRate = undefined;
  } else if (feeRateStr === "--dry-run") {
    actualFeeRate = undefined;
  }

  console.log(`Attempting to refund swap: ${swapId}`);
  console.log("");

  // Get the swap status from the server
  const swap = await client.getSwap(swapId);

  console.log(`Current status: ${swap.status}`);
  console.log(`Direction:      ${swap.direction}`);
  console.log("");

  // Check which type of swap this is based on direction
  const isOnchainSwap = swap.direction === "onchain_to_evm";
  const isArkadeSwap = swap.direction === "arkade_to_evm";

  // Require destination address for refundable swaps
  if ((isOnchainSwap || isArkadeSwap) && !actualDestination) {
    console.error("=".repeat(60));
    console.error("DESTINATION ADDRESS REQUIRED");
    console.error("=".repeat(60));
    console.error("");
    if (isOnchainSwap) {
      console.error("On-chain swaps require a Bitcoin address to receive the refund.");
      console.error("");
      console.error("Usage:");
      console.error(`  npm run refund -- ${swapId} <bitcoin-address> [fee-rate]`);
      console.error("");
      console.error("Example:");
      console.error(`  npm run refund -- ${swapId} bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4 5`);
    } else {
      console.error("Arkade swaps require an Arkade address to receive the refund.");
      console.error("");
      console.error("Usage:");
      console.error(`  npm run refund -- ${swapId} <arkade-address>`);
      console.error("");
      console.error("Example:");
      console.error(`  npm run refund -- ${swapId} ark1...your_arkade_address...`);
    }
    console.error("");
    console.error("=".repeat(60));
    process.exit(1);
  }

  // Parse fee rate (only for on-chain swaps)
  const feeRateSatPerVb = actualFeeRate ? Number.parseFloat(actualFeeRate) : undefined;
  if (actualFeeRate && (Number.isNaN(feeRateSatPerVb) || feeRateSatPerVb! <= 0)) {
    console.error("Invalid fee rate. Must be a positive number.");
    process.exit(1);
  }

  console.log("Attempting refund...");
  if (isOnchainSwap) {
    console.log(`  Destination: ${actualDestination}`);
    console.log(`  Fee rate:    ${feeRateSatPerVb ?? 2} sat/vB`);
    if (dryRun) {
      console.log("  Mode:        Dry run (no broadcast)");
    }
  } else if (isArkadeSwap) {
    console.log(`  Destination: ${actualDestination}`);
    console.log("  Type:        Arkade off-chain refund");
  }
  console.log("");

  try {
    // Build options based on swap type
    const options = isOnchainSwap
      ? {
          destinationAddress: actualDestination ?? "",
          feeRateSatPerVb,
          dryRun,
        }
      : {
          destinationAddress: actualDestination ?? "",
        };

    const result = await client.refundSwap(swapId, options);

    if (result.success) {
      console.log("=".repeat(60));
      if (result.broadcast) {
        console.log("REFUND EXECUTED SUCCESSFULLY!");
      } else {
        console.log("REFUND TRANSACTION BUILT");
      }
      console.log("=".repeat(60));
      console.log("");
      console.log(`  ${result.message}`);
      console.log("");
      if (result.txId) {
        console.log(`  Transaction ID: ${result.txId}`);
      }
      if (result.refundAmount !== undefined) {
        console.log(`  Refund amount:  ${result.refundAmount} sats`);
      }
      if (result.fee !== undefined) {
        console.log(`  Network fee:    ${result.fee} sats`);
      }
      if (result.broadcast !== undefined) {
        console.log(`  Broadcast:      ${result.broadcast ? "Yes" : "No"}`);
      }
      console.log("");
      if (result.txHex && !result.broadcast) {
        console.log("Raw Transaction (broadcast manually if needed):");
        console.log("");
        console.log(result.txHex);
        console.log("");
        console.log("You can broadcast using:");
        console.log("  - https://mempool.space/tx/push");
        console.log("  - bitcoin-cli sendrawtransaction <txhex>");
        console.log("  - Any Bitcoin wallet that supports raw transaction broadcast");
      }
      console.log("");
      console.log("=".repeat(60));

      // Update stored swap with latest status
      if (swapStorage) {
        const updatedSwap = await client.getSwap(swapId);
        await swapStorage.update(swapId, updatedSwap);
      }
    } else {
      console.log("=".repeat(60));
      console.log("REFUND NOT AVAILABLE");
      console.log("=".repeat(60));
      console.log("");
      console.log(`  ${result.message}`);
      console.log("");
      console.log("=".repeat(60));
      process.exit(1);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("=".repeat(60));
    console.error("REFUND FAILED");
    console.error("=".repeat(60));
    console.error("");
    console.error(`Error: ${message}`);
    console.error("");
    console.error("Try again or check the swap status with:");
    console.error(`  npm run watch -- ${swapId}`);
    process.exit(1);
  }
}
