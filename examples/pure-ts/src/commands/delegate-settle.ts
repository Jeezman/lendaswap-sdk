/**
 * Settle a VHTLC via delegate batch protocol.
 *
 * Usage:
 *   tsx src/index.ts delegate-settle <swap-id> [destination]
 *
 * Works for spendable, recoverable, AND expired VTXOs.
 */

import type { Client, SwapStorage } from "@lendasat/lendaswap-sdk-pure";
import { delegateClaim } from "@lendasat/lendaswap-sdk-pure/delegate";

export async function delegateSettle(
  client: Client,
  swapStorage: SwapStorage | undefined,
  swapId: string | undefined,
  destination: string | undefined,
): Promise<void> {
  if (!swapId) {
    console.error(
      "Usage: tsx src/index.ts delegate-settle <swap-id> [destination]",
    );
    process.exit(1);
  }

  if (!swapStorage) {
    console.error("Swap storage is required");
    process.exit(1);
  }

  const storedSwap = await swapStorage.get(swapId);
  if (!storedSwap) {
    console.error(`Swap ${swapId} not found in local storage`);
    process.exit(1);
  }

  // Fetch latest swap state
  const swap = await client.getSwap(swapId, { updateStorage: true });

  console.log(`Direction: ${swap.direction}`);
  console.log(`Status:    ${swap.status}`);
  console.log("");

  // Only evm_to_arkade and btc_to_arkade produce VHTLCs the client can claim
  if (swap.direction !== "evm_to_arkade" && swap.direction !== "btc_to_arkade") {
    console.error(
      `delegate-settle only supports evm_to_arkade and btc_to_arkade, got ${swap.direction}`,
    );
    process.exit(1);
  }

  // Extract VHTLC params
  let lendaswapPubKey: string;
  let arkadeServerPubKey: string;
  let vhtlcAddress: string;
  let refundLocktime: number;
  let unilateralClaimDelay: number;
  let unilateralRefundDelay: number;
  let unilateralRefundWithoutReceiverDelay: number;
  let network: string;

  if (swap.direction === "evm_to_arkade") {
    const s = swap as {
      sender_pk: string;
      arkade_server_pk: string;
      btc_vhtlc_address: string;
      vhtlc_refund_locktime: number;
      unilateral_claim_delay: number;
      unilateral_refund_delay: number;
      unilateral_refund_without_receiver_delay: number;
      network: string;
    };
    lendaswapPubKey = s.sender_pk;
    arkadeServerPubKey = s.arkade_server_pk;
    vhtlcAddress = s.btc_vhtlc_address;
    refundLocktime = s.vhtlc_refund_locktime;
    unilateralClaimDelay = s.unilateral_claim_delay;
    unilateralRefundDelay = s.unilateral_refund_delay;
    unilateralRefundWithoutReceiverDelay =
      s.unilateral_refund_without_receiver_delay;
    network = s.network;
  } else {
    const s = swap as {
      server_vhtlc_pk: string;
      arkade_server_pk: string;
      arkade_vhtlc_address: string;
      vhtlc_refund_locktime: number;
      unilateral_claim_delay: number;
      unilateral_refund_delay: number;
      unilateral_refund_without_receiver_delay: number;
      network: string;
    };
    lendaswapPubKey = s.server_vhtlc_pk;
    arkadeServerPubKey = s.arkade_server_pk;
    vhtlcAddress = s.arkade_vhtlc_address;
    refundLocktime = s.vhtlc_refund_locktime;
    unilateralClaimDelay = s.unilateral_claim_delay;
    unilateralRefundDelay = s.unilateral_refund_delay;
    unilateralRefundWithoutReceiverDelay =
      s.unilateral_refund_without_receiver_delay;
    network = s.network;
  }

  // Determine destination: explicit arg or from swap response
  let destAddress = destination;
  if (!destAddress) {
    // Try to extract destination from the swap response
    const swapAny = swap as Record<string, unknown>;
    destAddress =
      (swapAny.target_arkade_address as string) ??
      (swapAny.target_address as string);
  }
  if (!destAddress) {
    console.error(
      "Could not determine destination address. Provide one explicitly.",
    );
    process.exit(1);
  }

  // Get full compressed pubkey from stored swap
  const fullPubKey = storedSwap.publicKey;
  const userPubKey =
    fullPubKey.length === 66 ? fullPubKey.slice(2) : fullPubKey;

  // Derive lendaswap API URL from client config
  const lendaswapApiUrl =
    process.env.LENDASWAP_API_URL || "http://localhost:3333";
  const arkadeServerUrl = process.env.ARKADE_URL;

  console.log(`Claiming via delegate settlement...`);
  console.log(`  VHTLC:       ${vhtlcAddress}`);
  console.log(`  Destination: ${destAddress}`);
  console.log("");

  try {
    const result = await delegateClaim({
      userSecretKey: storedSwap.secretKey,
      userPubKey,
      lendaswapPubKey,
      arkadeServerPubKey,
      preimage: storedSwap.preimage,
      preimageHash: storedSwap.preimageHash,
      vhtlcAddress,
      refundLocktime,
      unilateralClaimDelay,
      unilateralRefundDelay,
      unilateralRefundWithoutReceiverDelay,
      destinationAddress: destAddress!,
      network,
      lendaswapApiUrl,
      arkadeServerUrl,
      swapId,
    });

    console.log("=".repeat(60));
    console.log("DELEGATE SETTLEMENT SUCCESSFUL!");
    console.log("=".repeat(60));
    console.log(`  Commitment TX: ${result.commitmentTxid}`);
    console.log("");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("=".repeat(60));
    console.error("DELEGATE SETTLEMENT FAILED");
    console.error("=".repeat(60));
    console.error(`  Error: ${msg}`);
    process.exit(1);
  }
}
