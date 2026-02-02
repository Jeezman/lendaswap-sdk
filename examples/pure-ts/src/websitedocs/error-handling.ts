import { createExampleClient } from "./_shared.js";

async function main(): Promise<void> {
  const { client, close } = await createExampleClient();

  try {
    // ── Error Handling Pattern ────────────────────────────────
    // From: handle-failures/error-codes.mdx
    console.log("=".repeat(60));
    console.log("Error Handling");
    console.log("=".repeat(60));

    // #region error-handling
    try {
      const result = await client.createLightningToEvmSwap({
        targetAddress: "0x...",
        targetToken: "usdc_pol",
        targetChain: "polygon",
        sourceAmount: 100000,
      });
    } catch (error) {
      console.error("Swap failed:", error.message);
      // Error messages include machine-readable codes like:
      // "insufficient_balance", "amount_too_low", "rate_limit_exceeded"
    }
    // #endregion error-handling

    // ── Quote Error Handling ─────────────────────────────────
    console.log("");
    console.log("-".repeat(60));
    console.log("Quote Error Handling");
    console.log("-".repeat(60));

    try {
      // Intentionally use an invalid pair to trigger an error
      await client.getQuote("invalid_token", "usdc_pol", 100000);
    } catch (error) {
      console.error("Quote failed:", error instanceof Error ? error.message : String(error));
    }

    // ── Claim Error Handling ─────────────────────────────────
    console.log("");
    console.log("-".repeat(60));
    console.log("Claim Error Handling");
    console.log("-".repeat(60));

    try {
      // Intentionally use a non-existent swap ID
      await client.claim("00000000-0000-0000-0000-000000000000");
    } catch (error) {
      console.error("Claim failed:", error instanceof Error ? error.message : String(error));
    }

    // ── Refund Error Handling ────────────────────────────────
    console.log("");
    console.log("-".repeat(60));
    console.log("Refund Error Handling");
    console.log("-".repeat(60));

    try {
      await client.refundSwap("00000000-0000-0000-0000-000000000000", {
        destinationAddress: "bc1q...",
      });
    } catch (error) {
      console.error("Refund failed:", error instanceof Error ? error.message : String(error));
    }

    console.log("");
    console.log("=".repeat(60));
    console.log("Error handling examples complete.");
    console.log("=".repeat(60));
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
