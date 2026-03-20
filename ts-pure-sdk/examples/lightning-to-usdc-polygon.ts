/**
 * Lightning → USDC on Polygon: end-to-end example.
 */

import { BTC_LIGHTNING, Client, type TokenInfo } from "../src";
import { InMemorySwapStorage, InMemoryWalletStorage } from "../src";

const BTC_LIGHTNING_INFO: TokenInfo = {
  token_id: BTC_LIGHTNING,
  symbol: "BTC",
  name: "Bitcoin (Lightning)",
  decimals: 8,
  chain: "Lightning",
};

// #region lightning-to-evm-setup
const client = await Client.builder()
  .withSignerStorage(new InMemoryWalletStorage())
  .withSwapStorage(new InMemorySwapStorage())
  .withApiKey(process.env.API_KEY || "")
  .build();
// #endregion lightning-to-evm-setup

const destinationAddress = "0xYourPolygonAddress";
const amountSats = 100_000;

// #region find-target-token
const tokens = await client.getTokens();
const usdcPolygon = tokens.evm_tokens.find(
  (t) => t.symbol === "USDC" && t.chain === "137",
);
if (!usdcPolygon) throw new Error("USDC on Polygon not found");
// #endregion find-target-token

// #region create-swap
const result = await client.createSwap({
  sourceAsset: BTC_LIGHTNING_INFO,
  targetAsset: usdcPolygon,
  targetAddress: destinationAddress,
  sourceAmount: amountSats,
});

const { response } = result;
if (!("boltz_invoice" in response)) {
  throw new Error("Expected Lightning swap response");
}
// #endregion create-swap

// #region pay-invoice
console.log("Pay invoice:", response.boltz_invoice);
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
