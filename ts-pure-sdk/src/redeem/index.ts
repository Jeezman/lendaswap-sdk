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
 *   if (result.chain === "ethereum") {
 *     // Manual claim needed
 *     console.log("Contract:", result.ethereumClaimData.contractAddress);
 *     console.log("Call data:", result.ethereumClaimData.callData);
 *   } else {
 *     // Gelato relay
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

  // Ethereum claims return data for manual execution
  if (chain === "ethereum") {
    return buildEthereumClaimData(id, secret, swap);
  }

  // Polygon and Arbitrum use Gelato relay
  return claimGasless(id, secret, chain, ctx);
}
