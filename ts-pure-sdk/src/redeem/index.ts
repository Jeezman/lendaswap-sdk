/**
 * Redeem module for Lendaswap swaps.
 *
 * Provides redeem/claim logic for completing swaps:
 * - Gelato relay for gasless EVM claims (Polygon, Arbitrum)
 * - Manual claiming with call data for Ethereum
 * - Arkade VHTLC claiming for EVM-to-Arkade swaps
 */

import { buildEthereumClaimData } from "./ethereum.js";
import { claimGasless } from "./gasless.js";
import {
  type ArkadeClaimData,
  type ClaimResult,
  getChainFromTokenId,
  type RedeemContext,
} from "./types.js";

// Re-export Arkade claim
export {
  type ArkadeClaimParams,
  type ArkadeClaimResult,
  buildArkadeClaim,
} from "./arkade.js";
// Re-export utilities from ethereum module
export { encodeClaimSwapCallData, uuidToBytes32 } from "./ethereum.js";
// Re-export types
export type {
  ArkadeClaimData,
  ClaimChain,
  ClaimResult,
  EthereumClaimData,
  RedeemContext,
} from "./types.js";
export { getChainFromTokenId } from "./types.js";

/**
 * Claims a swap by revealing the preimage.
 *
 * The claim method depends on the target chain:
 * - **Polygon/Arbitrum**: Uses Gelato Relay for gasless execution
 * - **Ethereum**: Returns call data for manual claiming
 * - **Arkade**: Returns data needed for `buildArkadeClaim()`
 *
 * @param id - The UUID of the swap.
 * @param secret - The preimage/secret (32-byte hex string, with or without 0x prefix).
 * @param ctx - The context containing the API client and getSwap function.
 * @returns A ClaimResult with the outcome.
 *
 * @example
 * ```ts
 * const result = await claim(swapId, storedSwap.preimage, ctx);
 * if (result.success) {
 *   if (result.chain === "arkade") {
 *     // Arkade claim needs user's keys
 *     const claimResult = await buildArkadeClaim({
 *       ...result.arkadeClaimData,
 *       userSecretKey: mySecretKey,
 *       userPubKey: myPubKey,
 *       preimage: storedSwap.preimage,
 *       destinationAddress: myArkadeAddress,
 *     });
 *   } else if (result.chain === "ethereum") {
 *     // Manual EVM claim needed
 *     console.log("Contract:", result.ethereumClaimData.contractAddress);
 *     console.log("Call data:", result.ethereumClaimData.callData);
 *   } else {
 *     // Gelato relay (Polygon/Arbitrum)
 *     console.log("TX Hash:", result.txHash);
 *   }
 * }
 * ```
 */
export async function claim(
  id: string,
  secret: string,
  ctx: RedeemContext,
): Promise<ClaimResult> {
  // Get the swap to determine target chain
  const swap = await ctx.getSwap(id);
  const targetToken = swap.target_token;
  const chain = getChainFromTokenId(targetToken);

  if (!chain) {
    return {
      success: false,
      message: `Unknown target chain for token: ${targetToken}. Cannot determine claim method.`,
    };
  }

  // Arkade claims return data for manual execution with user's keys
  if (chain === "arkade") {
    // For EVM-to-Arkade swaps, we need specific fields from the swap
    const arkadeSwap = swap as {
      sender_pk: string;
      server_pk: string;
      network: string;
      unilateral_claim_delay?: number;
      unilateral_refund_delay?: number;
      unilateral_refund_without_receiver_delay?: number;
      htlc_address_arkade?: string;
      vhtlc_refund_locktime?: number;
    };
    return buildArkadeClaimData(arkadeSwap);
  }

  // Ethereum claims return data for manual execution
  if (chain === "ethereum") {
    return buildEthereumClaimData(id, secret, swap);
  }

  // Polygon and Arbitrum use Gelato relay
  return claimGasless(id, secret, chain, ctx);
}

/**
 * Builds the claim data for an Arkade swap (EVM-to-Arkade direction).
 *
 * For Arkade claims, the user needs to call `buildArkadeClaim` with their
 * secret key and destination address. This function extracts the necessary
 * parameters from the swap response.
 */
function buildArkadeClaimData(swap: {
  sender_pk: string;
  server_pk: string;
  network: string;
  unilateral_claim_delay?: number;
  unilateral_refund_delay?: number;
  unilateral_refund_without_receiver_delay?: number;
  htlc_address_arkade?: string;
  vhtlc_refund_locktime?: number;
}): ClaimResult {
  if (!swap.htlc_address_arkade) {
    return {
      success: false,
      message: "Swap does not have an Arkade HTLC address.",
      chain: "arkade",
    };
  }

  const arkadeClaimData: ArkadeClaimData = {
    lendaswapPubKey: swap.sender_pk,
    arkadeServerPubKey: swap.server_pk,
    vhtlcAddress: swap.htlc_address_arkade,
    refundLocktime: swap.vhtlc_refund_locktime ?? 0,
    unilateralClaimDelay: swap.unilateral_claim_delay ?? 0,
    unilateralRefundDelay: swap.unilateral_refund_delay ?? 0,
    unilateralRefundWithoutReceiverDelay:
      swap.unilateral_refund_without_receiver_delay ?? 0,
    network: swap.network,
  };

  return {
    success: true,
    message:
      "Arkade claims require your secret key. Use buildArkadeClaim() with the provided data.",
    chain: "arkade",
    arkadeClaimData,
  };
}
