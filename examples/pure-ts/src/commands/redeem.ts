/**
 * Redeem a swap that is in the serverfunded state.
 *
 * For Polygon/Arbitrum swaps: Uses Gelato Relay for gasless claiming.
 * For Ethereum swaps: Returns call data for manual execution.
 */

import type { Client, SwapStorage } from "@lendasat/lendaswap-sdk-pure";

export async function redeemSwap(
  client: Client,
  swapStorage: SwapStorage | undefined,
  swapId: string | undefined,
): Promise<void> {
  if (!swapId) {
    console.error("Usage: tsx src/index.ts redeem <swap-id>");
    console.error("");
    console.error("Example:");
    console.error("  tsx src/index.ts redeem 12345678-1234-1234-1234-123456789abc");
    process.exit(1);
  }

  console.log(`Attempting to redeem swap: ${swapId}`);
  console.log("");

  // Get the swap status from the server
  const swap = await client.getSwap(swapId);

  console.log(`Current status: ${swap.status}`);

  if (swap.status !== "serverfunded") {
    console.error("");
    console.error(`Cannot redeem swap in status: ${swap.status}`);
    console.error("Swap must be in 'serverfunded' status to redeem.");
    console.error("");
    console.error("Use 'npm run watch -- <id>' to monitor the swap status.");
    process.exit(1);
  }

  // Get the stored swap data (contains preimage)
  if (!swapStorage) {
    console.error("No swap storage configured. Cannot retrieve preimage.");
    console.error("Make sure swap storage is configured in the client.");
    process.exit(1);
  }

  const storedSwap = await swapStorage.get(swapId);
  if (!storedSwap) {
    console.error(`Swap ${swapId} not found in local storage.`);
    console.error("The preimage is required to redeem the swap.");
    console.error("");
    console.error("If you have the mnemonic, you can try recovering the swap parameters.");
    process.exit(1);
  }

  console.log("");
  console.log("Found stored swap data:");
  console.log(`  Key Index: ${storedSwap.keyIndex}`);
  console.log(`  Preimage:  ${storedSwap.preimage.slice(0, 16)}...`);
  console.log("");

  // Claim the swap
  console.log("Attempting to claim swap...");
  console.log("");

  try {
    const result = await client.claim(swapId, storedSwap.preimage);

    if (!result.success) {
      console.error("=".repeat(60));
      console.error("CLAIM FAILED");
      console.error("=".repeat(60));
      console.error("");
      console.error(`Error: ${result.message}`);
      process.exit(1);
    }

    console.log("=".repeat(60));
    console.log("CLAIM " + (result.ethereumClaimData ? "DATA GENERATED" : "SUBMITTED SUCCESSFULLY!"));
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

      // Update stored swap with latest status
      const updatedSwap = await client.getSwap(swapId);
      await swapStorage.update(swapId, updatedSwap);
    }

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
