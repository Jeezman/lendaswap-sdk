/**
 * Redeem module for Lendaswap swaps.
 *
 * Provides redeem/claim logic for completing swaps:
 * - Gelato relay for gasless EVM claims
 */

import type { ApiClient, ClaimGelatoResponse } from "../api/client.js";

/**
 * Context passed to redeem functions.
 */
export interface RedeemContext {
  /** The API client for making requests */
  apiClient: ApiClient;
}

/**
 * Claims a swap using Gelato Relay (gasless execution).
 *
 * This reveals the preimage to claim the EVM HTLC. The server will
 * submit the transaction via Gelato for gasless execution.
 *
 * @param id - The UUID of the swap.
 * @param secret - The preimage/secret (32-byte hex string, with or without 0x prefix).
 * @param ctx - The context containing the API client.
 * @returns A promise that resolves to the claim response with task ID and tx hash.
 * @throws Error if the swap is not in the correct state or claim fails.
 *
 * @example
 * ```ts
 * const result = await claimGelato(swapId, storedSwap.preimage, { apiClient });
 * console.log("Claim TX:", result.tx_hash);
 * console.log("Gelato Task:", result.task_id);
 * ```
 */
export async function claimGelato(
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
