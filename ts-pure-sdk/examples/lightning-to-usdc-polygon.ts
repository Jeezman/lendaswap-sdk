/**
 * Lightning → USDC on Polygon: end-to-end example.
 */

import {
  Asset,
  Client,
  InMemorySwapStorage,
  InMemoryWalletStorage,
} from "../src/index.js";

// #region lightning-to-evm-setup
const client = await Client.builder()
  .withSignerStorage(new InMemoryWalletStorage())
  .withSwapStorage(new InMemorySwapStorage())
  .withOrgCode(process.env.ORG_CODE || "")
  .build();
// #endregion lightning-to-evm-setup

const destinationAddress = "0xYourPolygonAddress";
const amountSats = 100_000;

// #region create-swap
const result = await client.createSwap({
  source: Asset.BTC_LIGHTNING,
  target: Asset.USDC_POLYGON,
  targetAddress: destinationAddress,
  sourceAmount: amountSats,
});

const { response } = result;
// #endregion create-swap

if (!("bolt11_invoice" in response)) {
  throw new Error("Expected Lightning swap response");
}

// #region pay-invoice
console.log("Pay invoice:", response.bolt11_invoice);
// #endregion pay-invoice

// ... "lnbc1m1p..."
console.log("Swap ID:", response.id);
// ... "550e8400-e29b-41d4-a716-446655440000"

// #region poll-status
let swap = await client.getSwap(response.id);
while (swap.status !== "serverfunded" && swap.status !== "expired") {
  await new Promise((r) => setTimeout(r, 3000));
  swap = await client.getSwap(response.id);
  console.log("Status:", swap.status);
  // ... "pending" → "clientfunded" → "serverfunded"
}
// #endregion poll-status

if (swap.status === "expired") {
  throw new Error("Swap expired — invoice was not paid in time.");
}

// #region claim-gasless
const claim = await client.claimViaGasless(response.id, destinationAddress);
console.log("Claimed! TX:", claim.txHash);
// ... "0xabc123..."
// #endregion claim-gasless

// #region verify-complete
const final = await client.getSwap(response.id);
console.log("Final status:", final.status);
// ... "clientredeemed"
console.log("Source:", final.source_amount, "sats");
console.log("Target:", final.target_amount, final.target_token.symbol);
// ... "Target: 48250000 USDC"
// #endregion verify-complete
