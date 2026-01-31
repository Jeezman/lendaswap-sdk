import { createExampleClient } from "./_shared.js";

async function main(): Promise<void> {
  const { client, close } = await createExampleClient();

  try {
    // ── Lightning -> EVM (by targetAmount) ───────────────────
    // From: create-swaps/btc-to-evm.mdx "By Target Amount"
    console.log("=".repeat(60));
    console.log("Lightning -> EVM (by target amount)");
    console.log("=".repeat(60));

    const resultByTarget = await client.createLightningToEvmSwap({
      targetAddress: "0xYourPolygonAddress",
      targetToken: "usdc_pol",
      targetChain: "polygon",
      targetAmount: 50, // Receive exactly 50 USDC
    });

    console.log("Pay invoice:", resultByTarget.response.ln_invoice);
    console.log("Swap ID:", resultByTarget.response.id);

    // ── Lightning -> EVM (by sourceAmount) ───────────────────
    // From: create-swaps/btc-to-evm.mdx "By Source Amount"
    console.log("");
    console.log("=".repeat(60));
    console.log("Lightning -> EVM (by source amount)");
    console.log("=".repeat(60));

    const resultBySource = await client.createLightningToEvmSwap({
      targetAddress: "0xYourPolygonAddress",
      targetToken: "usdc_pol",
      targetChain: "polygon",
      sourceAmount: 100000, // Send exactly 100,000 sats
    });

    console.log("Pay invoice:", resultBySource.response.ln_invoice);
    console.log("You will receive:", resultBySource.response.target_amount, "USDC");

    // ── Arkade -> EVM ────────────────────────────────────────
    // From: create-swaps/btc-to-evm.mdx "Arkade -> EVM"
    console.log("");
    console.log("=".repeat(60));
    console.log("Arkade -> EVM");
    console.log("=".repeat(60));

    const arkadeResult = await client.createArkadeToEvmSwap({
      targetAddress: "0xYourPolygonAddress",
      targetToken: "usdc_pol",
      targetChain: "polygon",
      sourceAmount: 100000,
    });

    console.log("Fund VHTLC:", arkadeResult.response.htlc_address_arkade);
    console.log("Swap ID:", arkadeResult.response.id);

    // ── Complete Flow: Lightning -> EVM ───────────────────────
    // From: create-swaps/btc-to-evm.mdx "Complete Flow"
    console.log("");
    console.log("=".repeat(60));
    console.log("Complete Flow: Lightning -> EVM");
    console.log("=".repeat(60));

    // 1. Create swap
    const result = await client.createLightningToEvmSwap({
      targetAddress: "0xYourPolygonAddress",
      targetToken: "usdc_pol",
      targetChain: "polygon",
      sourceAmount: 100000,
    });

    console.log("Pay invoice:", result.response.ln_invoice);

    // 2. Poll for status
    let swap = await client.getSwap(result.response.id);
    while (swap.status !== "serverfunded" && swap.status !== "clientredeemed") {
      await new Promise((r) => setTimeout(r, 3000));
      swap = await client.getSwap(result.response.id);
      console.log("Status:", swap.status);
    }

    // 3. Claim (gasless on Polygon)
    if (swap.status === "serverfunded") {
      const claim = await client.claim(result.response.id);
      console.log("Claim result:", claim.success, claim.message);
    }
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
