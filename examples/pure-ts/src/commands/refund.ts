/**
 * Refund a swap that has not completed.
 */

import type {Client, SwapStorage} from "@lendasat/lendaswap-sdk-pure";

export async function refundSwap(
  client: Client,
  swapStorage: SwapStorage | undefined,
  swapId: string | undefined,
): Promise<void> {
  if (!swapId) {
    console.error("Usage: tsx src/index.ts refund <swap-id>");
    console.error("");
    console.error("Example:");
    console.error("  tsx src/index.ts refund 12345678-1234-1234-1234-123456789abc");
    process.exit(1);
  }

  console.log(`Attempting to refund swap: ${swapId}`);
  console.log("");

  // Get the swap status from the server
  const swap = await client.getSwap(swapId);

  console.log(`Current status: ${swap.status}`);
  console.log(`Source token:   ${swap.source_token}`);
  console.log(`Target token:   ${swap.target_token}`);
  console.log("");

  // Attempt the refund
  console.log("Attempting refund...");
  console.log("");

  try {
    const result = await client.refundSwap(swapId);

    if (result.success) {
      console.log("=".repeat(60));
      console.log("REFUND SUCCESSFUL");
      console.log("=".repeat(60));
      console.log("");
      console.log(`  Message: ${result.message}`);
      if (result.txHash) {
        console.log(`  TX Hash: ${result.txHash}`);
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
