/**
 * List locally stored swaps.
 */

import type { Client, SwapStorage } from "@lendasat/lendaswap-sdk-pure";

export async function listSwaps(swapStorage: SwapStorage, client?: Client): Promise<void> {
  console.log("Fetching stored swaps...\n");

  // #region list-swaps
  const swaps = await swapStorage.getAll();

  for (const swap of swaps) {
    console.log(`${swap.swapId}: ${swap.response.status}`);
    // ... "550e8400-...: serverfunded"
  }
  // #endregion list-swaps

  if (swaps.length === 0) {
    console.log("No swaps stored locally.");
    console.log("");
    console.log("Swaps are stored when you create them with 'swap' command.");
    return;
  }

  console.log("-".repeat(60));

  // #region filter-swaps
  const pending = swaps.filter((s) => s.response.status === "pending");
  const funded = swaps.filter((s) => s.response.status === "serverfunded");
  const done = swaps.filter((s) => s.response.status === "clientredeemed");

  console.log(`Pending: ${pending.length}, Funded: ${funded.length}, Done: ${done.length}`);
  // ... "Pending: 1, Funded: 2, Done: 5"
  // #endregion filter-swaps

  // #region delete-swaps
  // Delete a single swap
  // await client.deleteSwap(swapId);

  // Clear all swap data
  // await client.clearSwapStorage();
  // #endregion delete-swaps

  console.log(`\nTotal: ${swaps.length} swaps`);
}
