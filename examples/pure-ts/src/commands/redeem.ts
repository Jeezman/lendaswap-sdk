/**
 * Redeem a swap that is in the serverfunded state.
 *
 * For Polygon/Arbitrum swaps: Uses Gelato Relay for gasless claiming.
 * For Ethereum swaps: Returns call data for manual execution.
 */

import type {Client, SwapStorage} from "@lendasat/lendaswap-sdk-pure";

export async function redeemSwap(
  client: Client,
  swapStorage: SwapStorage | undefined,
  swapId: string | undefined,
  destination: string | undefined,
): Promise<void> {
  if (!swapId) {
    console.error("Usage: tsx src/index.ts redeem <swap-id> [destination]");
    console.error("");
    console.error("Examples:");
    console.error("  tsx src/index.ts redeem 12345678-1234-1234-1234-123456789abc");
    console.error("");
    console.error("  # Arkade-to-EVM gasless claim (destination optional, uses stored target):");
    console.error("  tsx src/index.ts redeem 12345678-... [0xYourEvmAddress]");
    process.exit(1);
  }

  console.log(`Attempting to redeem swap: ${swapId}`);
  console.log("");

  // Get the swap status from the server
  const storedSwap = await client.getStoredSwap(swapId);
  if (!storedSwap) {
    throw Error("Swap not found");
  }
  const swap = storedSwap?.response;

  console.log(`Current status: ${swap.status}`);

  // Claim the swap (reads preimage and keys from storage)
  // For arkade_to_evm, the target address was set at swap creation time
  console.log("");
  console.log("Attempting to claim swap...");
  console.log("");

  try {
    // #region claim-gelato
    const result = await client.claim(swapId, destination ? { destination } : undefined);

    if (result.success) {
      console.log("Claimed! TX:", result.txHash);
      // ... "0xabc123..."
    } else {
      console.error("Claim failed:", result.message);
    }
    // #endregion claim-gelato

    if (!result.success) {
      console.error("=".repeat(60));
      console.error("CLAIM FAILED");
      console.error("=".repeat(60));
      console.error("");
      console.error(`Error: ${result.message}`);
      process.exit(1);
    }

    console.log("=".repeat(60));
    console.log("CLAIM " + (result.ethereumClaimData ? "DATA GENERATED" : "SUCCESSFUL!"));
    console.log("=".repeat(60));
    console.log("");

    if (result.ethereumClaimData) {
      // Ethereum swap - manual claim required
      console.log("  Chain:              ethereum");
      console.log("");
      console.log("  This swap targets Ethereum and requires manual claiming.");
      console.log("  Use the following data to call the HTLC contract:");
      console.log("");
      console.log(`  Contract Address:   ${result.ethereumClaimData.contractAddress}`);
      console.log(`  Function:           ${result.ethereumClaimData.functionSignature}`);
      console.log(`  Swap ID (bytes32):  0x${result.ethereumClaimData.swapId}`);
      console.log(`  Secret (bytes32):   0x${result.ethereumClaimData.secret}`);
      console.log("");
      console.log("  Call Data (hex):");
      console.log(`  ${result.ethereumClaimData.callData}`);
      console.log("");
      console.log("=".repeat(60));
      console.log("");
      console.log("Use this call data with your Ethereum wallet to claim the swap.");
      console.log("Example using cast:");
      console.log(`  cast send ${result.ethereumClaimData.contractAddress} ${result.ethereumClaimData.callData} --private-key <YOUR_KEY>`);
    } else if (result.chain === "arkade") {
      // #region claim-vhtlc
      const arkadeResult = await client.claimArkade(swapId, {
        destinationAddress: "ark1q...", // Your Arkade address
      });

      if (arkadeResult.success) {
        console.log("Claimed! TX:", arkadeResult.txId);
        // ... "ark1tx..."
        console.log("Amount:", arkadeResult.claimAmount, "sats");
        // ... 100000 "sats"
      } else {
        console.error("Claim failed:", arkadeResult.message);
      }
      // #endregion claim-vhtlc

    } else if (swap.direction === "arkade_to_evm") {
      // Arkade-to-EVM - gasless claim via server
      const arkadeSwap = swap as { target_evm_address?: string; client_evm_address?: string };
      const targetAddr = arkadeSwap.target_evm_address ?? arkadeSwap.client_evm_address ?? "unknown";
      console.log(`  Direction:    arkade_to_evm (gasless)`);
      console.log(`  TX Hash:      ${result.txHash}`);
      console.log(`  Target:       ${targetAddr}`);
      console.log("");
      console.log(`  Message:      ${result.message}`);
      console.log("");
      console.log("=".repeat(60));
      console.log("");
      console.log("The server has submitted the redeemAndExecute transaction.");
      console.log("Use 'npm run watch -- " + swapId + "' to monitor until completion.");

    } else {
      // Polygon/Arbitrum - gasless claim via Gelato
      console.log(`  Chain:        ${result.chain}`);
      console.log(`  Gelato Task:  ${result.taskId}`);
      console.log(`  TX Hash:      ${result.txHash}`);
      console.log("");
      console.log(`  Message:      ${result.message}`);
      console.log("");
      console.log("=".repeat(60));
      console.log("");
      console.log("The transaction has been submitted to the network.");
      console.log("Use 'npm run watch -- " + swapId + "' to monitor until completion.");

    }

    // #region check-vhtlc-amounts
    // amountsForSwap only applies to VHTLC-based swaps (evm_to_arkade, btc_to_arkade)
    if (swap.direction !== "arkade_to_evm" && swap.direction !== "onchain_to_evm") {
      const amounts = await client.amountsForSwap(swapId);

      console.log("Spendable:", amounts.spendable, "sats");
      // ... 100000 "sats"
      console.log("Spent:", amounts.spent, "sats");
      // ... 0 "sats"
      console.log("Recoverable:", amounts.recoverable, "sats");
      // ... 0 "sats"
    }
    // #endregion check-vhtlc-amounts

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("=".repeat(60));
    console.error("CLAIM FAILED");
    console.error("=".repeat(60));
    console.error("");
    console.error(`Error: ${message}`);
    console.error("");
    console.error("This could mean:");
    console.error("  - The swap is not in the correct state");
    console.error("  - The preimage is incorrect");
    console.error("  - Network or server issues");
    console.error("");
    console.error("Try again or check the swap status with:");
    console.error(`  npm run watch -- ${swapId}`);
    process.exit(1);
  }
}
