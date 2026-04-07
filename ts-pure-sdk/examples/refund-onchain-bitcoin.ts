/**
 * Refund: Bitcoin (on-chain) → EVM swap that expired.
 *
 * When a Bitcoin-to-EVM swap times out (e.g. the server never funded
 * the EVM side), the user can reclaim their on-chain BTC after the
 * timelock expires by building and broadcasting a refund transaction.
 */

import {
  Client,
  InMemorySwapStorage,
  InMemoryWalletStorage,
} from "../src/index.js";

// #region setup
const client = await Client.builder()
  .withSignerStorage(new InMemoryWalletStorage())
  .withSwapStorage(new InMemorySwapStorage())
  .withApiKey(process.env.API_KEY || "")
  .build();
// #endregion setup

// Assume a swap was created earlier and is now expired
const swapId = "550e8400-e29b-41d4-a716-446655440000";

// #region check-status
const swap = await client.getSwap(swapId);
console.log("Status:", swap.status);
// ... "expired"
// #endregion check-status

// #region refund
// Build and broadcast the refund transaction.
// The SDK signs with the stored secret key and spends from
// the timelock path of the Taproot HTLC.
const result = await client.refundSwap(swapId, {
  destinationAddress: "bc1q...", // Your Bitcoin address to receive the refund
  feeRateSatPerVb: 5, // Fee rate
});

if (!result.success) {
  throw new Error(`Refund failed: ${result.message}`);
}

console.log("Refund TX broadcast:", result.broadcast);
// ... true
console.log("Transaction ID:", result.txId);
// ... "a1b2c3..."
console.log("Refund amount:", result.refundAmount, "sats");
// ... 99500n sats (original minus mining fee)
console.log("Mining fee:", result.fee, "sats");
// ... 500n sats
// #endregion refund
