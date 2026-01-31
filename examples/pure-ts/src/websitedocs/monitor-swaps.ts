import { createExampleClient } from "./_shared.js";

const swapId = process.argv[2];

async function main(): Promise<void> {
  const { client, close } = await createExampleClient();

  try {
    // ── Get Swap by ID ───────────────────────────────────────
    // From: monitor-swap/get-swap-by-id.mdx
    if (swapId) {
      console.log("=".repeat(60));
      console.log("Get Swap by ID");
      console.log("=".repeat(60));

      const swap = await client.getSwap(swapId);

      console.log("Status:", swap.status);
      console.log("Source:", swap.source_amount, swap.source_token);
      console.log("Target:", swap.target_amount, swap.target_token);
    }

    // ── Polling for Updates ──────────────────────────────────
    // From: monitor-swap/get-swap-by-id.mdx "Polling for Updates"
    if (swapId) {
      console.log("");
      console.log("=".repeat(60));
      console.log("Polling for Updates (max 30 seconds)");
      console.log("=".repeat(60));

      const terminalStates = [
        "clientredeemed",
        "expired",
        "clientrefunded",
        "clientfundedserverrefunded",
      ];

      const startTime = Date.now();
      let done = false;

      while (!done && Date.now() - startTime < 30000) {
        const swap = await client.getSwap(swapId, { updateStorage: true });
        console.log("Status:", swap.status);

        if (terminalStates.includes(swap.status)) {
          done = true;
          break;
        }

        await new Promise((r) => setTimeout(r, 3000));
      }

      if (!done) {
        console.log("Polling timed out after 30 seconds.");
      }
    }

    // ── List All Swaps ───────────────────────────────────────
    // From: monitor-swap/list-swaps.mdx
    console.log("");
    console.log("=".repeat(60));
    console.log("List All Swaps");
    console.log("=".repeat(60));

    const swaps = await client.listAllSwaps();

    for (const swap of swaps) {
      console.log(`  ${swap.swapId}: ${swap.response.status}`);
    }

    if (swaps.length === 0) {
      console.log("  No swaps found.");
    }

    // ── Filter by Status ─────────────────────────────────────
    // From: monitor-swap/list-swaps.mdx "Filter by Status"
    console.log("");
    console.log("-".repeat(60));
    console.log("Filter by Status");
    console.log("-".repeat(60));

    const pending = swaps.filter((s) => s.response.status === "pending");
    const funded = swaps.filter((s) => s.response.status === "serverfunded");
    const done2 = swaps.filter((s) => s.response.status === "clientredeemed");

    console.log(`  Pending: ${pending.length}, Funded: ${funded.length}, Done: ${done2.length}`);

    // ── Delete Swaps ─────────────────────────────────────────
    // From: monitor-swap/list-swaps.mdx "Delete Swaps"
    // NOTE: Uncomment the lines below to actually delete data.
    console.log("");
    console.log("-".repeat(60));
    console.log("Delete Swaps (commented out for safety)");
    console.log("-".repeat(60));

    // Delete a single swap
    // await client.deleteSwap(swapId);

    // Clear all swap data
    // await client.clearSwapStorage();

    console.log("  Uncomment the delete lines in the source to use.");
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
