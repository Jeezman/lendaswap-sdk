/**
 * Gasless claim logic using Gelato Relay.
 *
 * Polygon and Arbitrum claims are submitted via Gelato for gasless execution.
 */

import type { ClaimGelatoResponse } from "../api/client.js";
import type { ClaimChain, ClaimResult, RedeemContext } from "./types.js";

/**
 * Claims a swap using Gelato Relay (gasless execution).
 *
 * This reveals the preimage to claim the EVM HTLC. The server will
 * submit the transaction via Gelato for gasless execution.
 *
 * Only works for Polygon and Arbitrum chains.
 *
 * @param id - The UUID of the swap.
 * @param secret - The preimage/secret (32-byte hex string, with or without 0x prefix).
 * @param chain - The target chain (for the result).
 * @param ctx - The context containing the API client.
 * @returns A ClaimResult with the outcome.
 */
export async function claimGasless(
  id: string,
  secret: string,
  chain: ClaimChain,
  ctx: RedeemContext,
): Promise<ClaimResult> {
  try {
    const response = await claimViaGelato(id, secret, ctx);
    return {
      success: true,
      message: "Claim submitted successfully via Gelato relay.",
      chain,
      taskId: response.task_id,
      txHash: response.tx_hash,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      message: `Failed to claim swap: ${message}`,
      chain,
    };
  }
}

/**
 * Submits a claim via Gelato Relay.
 *
 * @param id - The UUID of the swap.
 * @param secret - The preimage/secret.
 * @param ctx - The context containing the API client.
 * @returns The Gelato claim response.
 * @throws Error if the claim fails.
 *
 * @internal
 */
async function claimViaGelato(
  id: string,
  secret: string,
  ctx: RedeemContext,
): Promise<ClaimGelatoResponse> {
  const { data, error } = await ctx.apiClient.POST("/swap/{id}/claim-gelato", {
    params: { path: { id } },
    body: { secret },
  });
  if (error) {
    throw new Error(`Failed to claim swap: ${JSON.stringify(error)}`);
  }
  if (!data) {
    throw new Error("No claim response returned");
  }
  return data;
}
