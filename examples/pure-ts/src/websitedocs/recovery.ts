import { createExampleClient } from "./_shared.js";

async function main(): Promise<void> {
  // ── Recover Swaps from Seed ────────────────────────────────
  // From: recovery/recover-swaps-from-seed.mdx
  // In the website docs this uses IdbWalletStorage + .withMnemonic().
  // Here we use SQLite via _shared.ts. Set MNEMONIC in .env.
  console.log("=".repeat(60));
  console.log("Recover Swaps from Seed");
  console.log("=".repeat(60));

  const { client, close } = await createExampleClient();

  try {
    // #region recover-swaps
    // Recover all swaps from the server
    const recovered = await client.recoverSwaps();
    console.log(`Recovered ${recovered.length} swaps`);
    // ... "Recovered 3 swaps"
    // #endregion recover-swaps

    // ── Process Recovered Swaps (State Machine) ──────────────
    // From: recovery/recover-swaps-from-seed.mdx + state-machine.mdx
    console.log("");
    console.log("=".repeat(60));
    console.log("Process Recovered Swaps");
    console.log("=".repeat(60));

    // #region process-recovered
    const swaps = await client.listAllSwaps();

    for (const stored of swaps) {
      const swap = stored.response;
      switch (swap.status) {
        case "serverfunded":
          console.log(`Swap ${stored.swapId}: Ready to claim!`);
          // ... "Swap 550e8400-...: Ready to claim!"
          await client.claim(stored.swapId);
          break;
        case "clientfundedserverrefunded":
          console.log(`Swap ${stored.swapId}: Needs refund`);
          // ... "Swap 661f9511-...: Needs refund"
          break;
        case "clientredeemed":
          console.log(`Swap ${stored.swapId}: Complete`);
          // ... "Swap 772a0622-...: Complete"
          break;
        default:
          console.log(`Swap ${stored.swapId}: ${swap.status}`);
      }
    }
    // #endregion process-recovered

    if (swaps.length === 0) {
      console.log("  No swaps found. Set MNEMONIC in .env to recover from an existing wallet.");
    }

    // ── On-chain BTC -> Arkade States ────────────────────────
    // From: state-machine.mdx
    console.log("");
    console.log("-".repeat(60));
    console.log("State Machine Reference");
    console.log("-".repeat(60));
    console.log("  0 = Pending           - Swap created, waiting for BTC payment");
    console.log("  1 = ClientFunded      - BTC received, preparing HTLC");
    console.log("  2 = ServerFunded      - HTLC created, ready to claim");
    console.log("  3 = Done              - Swap complete");
    console.log("  4 = Expired           - Timeout, no payment received");
    console.log("  5 = ClientRefunded    - User refunded before HTLC");
    console.log("  6 = ClientFundedServerRefunded - HTLC timeout, needs refund");
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
