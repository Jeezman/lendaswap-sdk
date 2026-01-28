/**
 * List locally stored swaps.
 */

import type {SwapStorage} from "@lendasat/lendaswap-sdk-pure";

export async function listSwaps(swapStorage: SwapStorage): Promise<void> {
  console.log("Fetching stored swaps...\n");

  const swaps = await swapStorage.getAll();

  if (swaps.length === 0) {
    console.log("No swaps stored locally.");
    console.log("");
    console.log("Swaps are stored when you create them with 'swap' command.");
    return;
  }

  console.log("Stored Swaps:");
  for (const swap of swaps) {
    console.log("-".repeat(60));
    console.log(`  ID:        ${swap.swapId}`);
    console.log(`  Index:     ${swap.keyIndex}`);
    console.log(`  Direction: ${swap.response.direction}`);
    console.log(`  Status:    ${swap.response.status}`);
    console.log(`  Stored:    ${new Date(swap.storedAt).toLocaleString()}`);
  }
  console.log("-".repeat(60));

  console.log(`\nTotal: ${swaps.length} swaps`);
}
