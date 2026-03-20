/**
 * Bitcoin (on-chain) → Arkade: end-to-end example.
 *
 * The user sends on-chain BTC to a Taproot HTLC address and
 * receives Arkade VTXOs after claiming.
 */

import {
  BTC_ARKADE_INFO,
  BTC_ONCHAIN_INFO,
  Client,
  InMemorySwapStorage,
  InMemoryWalletStorage,
} from "../src";

// #region setup
const client = await Client.builder()
  .withSignerStorage(new InMemoryWalletStorage())
  .withSwapStorage(new InMemorySwapStorage())
  .withApiKey(process.env.API_KEY || "")
  .build();
// #endregion setup

const arkadeAddress = "ark1q..."; // Your Arkade address
const amountSats = 100_000; // 100,000 sats (0.001 BTC)

// #region create-swap
const result = await client.createSwap({
  sourceAsset: BTC_ONCHAIN_INFO,
  targetAsset: BTC_ARKADE_INFO,
  targetAddress: arkadeAddress,
  targetAmount: amountSats,
});

const { response } = result;
// #endregion create-swap

if (!("btc_htlc_address" in response)) {
  throw new Error("Expected Bitcoin-to-Arkade swap response");
}

// #region send-btc
console.log("Swap ID:", response.id);
// ... "550e8400-e29b-41d4-a716-446655440000"
console.log("Send BTC to:", response.btc_htlc_address);
// ... "bc1p..."
console.log("Amount to send:", response.source_amount, "sats");
// ... "101250 sats" (includes fees)
// #endregion send-btc

// #region poll-status
// After sending on-chain BTC, wait for confirmation + server to fund Arkade VHTLC
let swap = await client.getSwap(response.id);
while (swap.status !== "serverfunded" && swap.status !== "expired") {
  await new Promise((r) => setTimeout(r, 10_000)); // on-chain, so poll less frequently
  swap = await client.getSwap(response.id);
  console.log("Status:", swap.status);
  // ... "pending" → "clientfunded" → "serverfunded"
}
// #endregion poll-status

if (swap.status === "expired") {
  throw new Error("Swap expired — BTC was not sent in time.");
}

// #region claim
// Claim the Arkade VHTLC to receive VTXOs
const claimResult = await client.claim(response.id);
if (!claimResult.success) {
  throw new Error(`Claim failed: ${claimResult.message}`);
}
console.log("Claimed! TX:", claimResult.txHash);
// ... "ark:abc123..."
// #endregion claim

// #region verify-complete
const finalSwap = await client.getSwap(response.id);
console.log("Final status:", finalSwap.status);
// ... "clientredeemed"
console.log("Source:", finalSwap.source_amount, "sats (on-chain)");
console.log("Target:", finalSwap.target_amount, "sats (Arkade)");
// ... "Target: 100000 sats (Arkade)"
// #endregion verify-complete
