/**
 * Types for redeem/claim operations.
 */

import type { ApiClient, GetSwapResponse } from "../api/client.js";

/** Supported EVM chains for claiming */
export type ClaimChain = "polygon" | "arbitrum" | "ethereum";

/** Data needed for manual Ethereum claims */
export interface EthereumClaimData {
  /** The HTLC contract address */
  contractAddress: string;
  /** The encoded call data for claimSwap(bytes32,bytes32) */
  callData: string;
  /** The swap ID (bytes32) */
  swapId: string;
  /** The secret/preimage (bytes32) */
  secret: string;
  /** Human-readable function signature */
  functionSignature: string;
}

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
  /** Data for manual Ethereum claims */
  ethereumClaimData?: EthereumClaimData;
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
