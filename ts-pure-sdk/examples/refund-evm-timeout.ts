/**
 * Timeout-based refund: EVM → Lightning swap that expired.
 *
 * When an EVM-to-Lightning swap fails and collaborative refund is
 * unavailable (e.g. server is down), the user can still reclaim
 * their funds after the HTLC timelock expires by submitting the
 * refund transaction themselves.
 */

import { Client, InMemorySwapStorage, InMemoryWalletStorage } from "../src";

// #region setup
const client = await Client.builder()
  .withSignerStorage(new InMemoryWalletStorage())
  .withSwapStorage(new InMemorySwapStorage())
  .withApiKey(process.env.API_KEY || "")
  .build();
// #endregion setup

// Assume an EVM-to-Lightning swap was created and funded, but expired
const swapId = "550e8400-e29b-41d4-a716-446655440000";

// #region check-status
const swap = await client.getSwap(swapId);
console.log("Status:", swap.status);
// ... "expired"
console.log("Direction:", swap.direction);
// ... "evm_to_lightning"
// #endregion check-status

// #region timeout-refund
// Timeout-based refund: does NOT require server cooperation.
// The user must wait for the HTLC timelock to expire, then submit
// the refund transaction themselves with their EVM wallet.
//
// Set collaborative: false (or omit it) to use timeout-based refund.
const result = await client.refundSwap(swapId, {
  mode: "swap-back", // or "direct" to receive WBTC/tBTC
  collaborative: false,
});

if (!result.success) {
  throw new Error(`Refund failed: ${result.message}`);
}

const { evmRefundData } = result;
if (!evmRefundData) {
  throw new Error("Expected EVM refund data");
}

if (!evmRefundData.timelockExpired) {
  const expiryDate = new Date(evmRefundData.timelockExpiry * 1000);
  console.log(
    `Timelock has not expired yet. Refund available at: ${expiryDate.toISOString()}`,
  );
  // Wait until the timelock expires, then re-run this script.
} else {
  console.log("Timelock expired — refund is available now!");
}

// Submit the refund transaction with your EVM wallet (e.g. wagmi/viem):
// await walletClient.sendTransaction({
//   to: evmRefundData.to,
//   data: evmRefundData.data,
// });

console.log("Send refund tx to:", evmRefundData.to);
console.log("Calldata:", evmRefundData.data);
// #endregion timeout-refund
