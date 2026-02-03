import { createExampleClient } from "./_shared.js";

async function main(): Promise<void> {
  const { client, close } = await createExampleClient();

  try {
    // ── Create Swap ──────────────────────────────────────────
    // From: create-swaps/onchain-to-arkade.mdx
    console.log("=".repeat(60));
    console.log("On-chain BTC -> Arkade");
    console.log("=".repeat(60));

    // #region create-swap
    const result = await client.createBitcoinToArkadeSwap({
      satsReceive: 100000, // 100k sats to receive on Arkade
      targetAddress: "ark1q...", // Your Arkade address
    });

    console.log("Send BTC to:", result.response.btc_htlc_address);
    // ... "bc1q..."
    console.log("Amount:", result.response.source_amount, "sats");
    // ... 101500 "sats"
    console.log("Swap ID:", result.response.id);
    // ... "550e8400-e29b-41d4-a716-446655440000"
    // #endregion create-swap

    // ── Complete Flow ────────────────────────────────────────
    // From: create-swaps/onchain-to-arkade.mdx "Complete Flow"
    console.log("");
    console.log("=".repeat(60));
    console.log("Complete Flow");
    console.log("=".repeat(60));

    // #region complete-flow
    console.log("Send", result.response.source_amount, "sats to:", result.response.btc_htlc_address);
    // ... "Send 101500 sats to: bc1q..."

    // Poll for status
    let swap = await client.getSwap(result.response.id);
    while (swap.status !== "serverfunded" && swap.status !== "clientredeemed") {
      await new Promise((r) => setTimeout(r, 10000)); // 10s for onchain
      swap = await client.getSwap(result.response.id);
      console.log("Status:", swap.status);
      // ... "clientfunded" → "serverfunded"
    }

    // Claim VTXOs
    if (swap.status === "serverfunded") {
      const claim = await client.claimArkade(result.response.id, {
        destinationAddress: "ark1q...",
      });
      console.log("Claimed:", claim.success);
      // ... true
    }
    // #endregion complete-flow

    // ── Monitor Swap Status ──────────────────────────────────
    // From: create-swaps/onchain-to-arkade.mdx "Monitor Swap Status"
    console.log("");
    console.log("-".repeat(60));
    console.log("Final Status");
    console.log("-".repeat(60));

    // #region monitor-swap
    const finalSwap = await client.getSwap(result.response.id);
    console.log("Status:", finalSwap.status);
    // ... "clientredeemed"
    console.log("Source amount:", finalSwap.source_amount, "sats");
    // ... 101500 "sats"
    console.log("Target amount:", finalSwap.target_amount, "sats");
    // ... 100000 "sats"
    // #endregion monitor-swap
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
