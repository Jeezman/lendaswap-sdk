/**
 * Redeem module for Lendaswap swaps.
 *
 * Provides redeem/claim logic for completing swaps:
 * - Gelato relay for gasless EVM claims (Polygon, Arbitrum)
 * - Manual claiming required for Ethereum
 */

import type {
  ApiClient,
  ClaimGelatoResponse,
  GetSwapResponse,
} from "../api/client.js";

/** Supported EVM chains for claiming */
export type ClaimChain = "polygon" | "arbitrum" | "ethereum";

/** Result of a claim operation */
export interface ClaimResult {
  /** Whether the claim was successful */
  success: boolean;
  /** Human-readable message about the claim status */
  message: string;
  /** The chain the swap targets */
  chain?: ClaimChain;
  /** Gelato task ID (for Polygon/Arbitrum claims) */
  taskId?: string;
  /** Transaction hash (for Polygon/Arbitrum claims) */
  txHash?: string;
}

/**
 * Context passed to redeem functions.
 */
export interface RedeemContext {
  /** The API client for making requests */
  apiClient: ApiClient;
  /** Function to get swap details */
  getSwap: (id: string) => Promise<GetSwapResponse>;
}

/**
 * Extracts the chain from a token ID.
 *
 * Token IDs follow the pattern: `{token}_{chain}` (e.g., "usdc_pol", "usdt_eth", "usdc_arb")
 *
 * @param tokenId - The token identifier
 * @returns The chain or undefined if not recognized
 */
export function getChainFromTokenId(tokenId: string): ClaimChain | undefined {
  if (tokenId.endsWith("_pol")) return "polygon";
  if (tokenId.endsWith("_arb")) return "arbitrum";
  if (tokenId.endsWith("_eth")) return "ethereum";
  return undefined;
}

/**
 * Claims a swap by revealing the preimage.
 *
 * The claim method depends on the target chain:
 * - **Polygon/Arbitrum**: Uses Gelato Relay for gasless execution
 * - **Ethereum**: Not supported via this method (requires manual claim)
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
 *   console.log("Claim TX:", result.txHash);
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

  // Ethereum claims are not supported via Gelato
  if (chain === "ethereum") {
    return {
      success: false,
      message:
        "Ethereum claims are not supported via gasless relay. " +
        "You must claim manually by calling the HTLC contract directly with the preimage.",
      chain,
    };
  }

  // Polygon and Arbitrum use Gelato relay
  try {
    const response = await claimGelato(id, secret, ctx);
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
 * Claims a swap using Gelato Relay (gasless execution).
 *
 * This reveals the preimage to claim the EVM HTLC. The server will
 * submit the transaction via Gelato for gasless execution.
 *
 * Only works for Polygon and Arbitrum chains.
 *
 * @param id - The UUID of the swap.
 * @param secret - The preimage/secret (32-byte hex string, with or without 0x prefix).
 * @param ctx - The context containing the API client.
 * @returns A promise that resolves to the claim response with task ID and tx hash.
 * @throws Error if the swap is not in the correct state or claim fails.
 *
 * @internal
 */
async function claimGelato(
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
