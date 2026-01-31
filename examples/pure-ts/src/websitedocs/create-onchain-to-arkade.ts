import { createExampleClient } from "./_shared.js";

async function main(): Promise<void> {
  const { client, close } = await createExampleClient();

  try {
    // ── Create Swap ──────────────────────────────────────────
    // From: create-swaps/onchain-to-arkade.mdx
    console.log("=".repeat(60));
    console.log("On-chain BTC -> Arkade");
    console.log("=".repeat(60));

    const result = await client.createBitcoinToArkadeSwap({
      satsReceive: 100000, // 100k sats to receive on Arkade
      targetAddress: "ark1q...", // Your Arkade address
    });

    console.log("Send BTC to:", result.response.btc_htlc_address);
    console.log("Amount:", result.response.source_amount, "sats");
    console.log("Swap ID:", result.response.id);

    // ── Complete Flow ────────────────────────────────────────
    // From: create-swaps/onchain-to-arkade.mdx "Complete Flow"
    console.log("");
    console.log("=".repeat(60));
    console.log("Complete Flow");
    console.log("=".repeat(60));

    console.log("Send", result.response.source_amount, "sats to:", result.response.btc_htlc_address);

    // Poll for status
    let swap = await client.getSwap(result.response.id);
    while (swap.status !== "serverfunded" && swap.status !== "clientredeemed") {
      await new Promise((r) => setTimeout(r, 10000)); // 10s for onchain
      swap = await client.getSwap(result.response.id);
      console.log("Status:", swap.status);
    }

    // Claim VTXOs
    if (swap.status === "serverfunded") {
      const claim = await client.claimArkade(result.response.id, {
        destinationAddress: "ark1q...",
      });
      console.log("Claimed:", claim.success);
    }

    // ── Monitor Swap Status ──────────────────────────────────
    // From: create-swaps/onchain-to-arkade.mdx "Monitor Swap Status"
    console.log("");
    console.log("-".repeat(60));
    console.log("Final Status");
    console.log("-".repeat(60));

    const finalSwap = await client.getSwap(result.response.id);
    console.log("Status:", finalSwap.status);
    console.log("Source amount:", finalSwap.source_amount, "sats");
    console.log("Target amount:", finalSwap.target_amount, "sats");
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
