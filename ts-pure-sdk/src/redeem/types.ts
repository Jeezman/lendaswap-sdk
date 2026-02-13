/**
 * Types for redeem/claim operations.
 */

import type { ApiClient, GetSwapResponse } from "../api/client.js";

/** Supported chains for claiming */
export type ClaimChain = "polygon" | "arbitrum" | "ethereum" | "arkade";

/** Data needed for manual Ethereum claims */
export interface EthereumClaimData {
  /** The HTLC contract address */
  contractAddress: string;
  /** The encoded call data for redeem() */
  callData: string;
  /** The swap ID (UUID, for reference only - not used in contract call) */
  swapId: string;
  /** The secret/preimage (bytes32) */
  secret: string;
  /** Human-readable function signature */
  functionSignature: string;
  /** Token amount locked in HTLC (for manual claim construction) */
  amount?: bigint;
  /** ERC20 token address (for manual claim construction) */
  token?: string;
  /** Sender address who created the HTLC (for manual claim construction) */
  sender?: string;
  /** Refund timelock timestamp (for manual claim construction) */
  timelock?: bigint;
}

/** Data needed for Arkade-to-EVM coordinator claims (redeemAndExecute) */
export interface CoordinatorClaimData {
  /** HTLCErc20 contract address (for EIP-712 domain) */
  htlcAddress: string;
  /** HTLCCoordinator contract address (target for redeemAndExecute) */
  coordinatorAddress: string;
  /** EVM chain ID */
  chainId: number;
  /** WBTC amount locked in the HTLC (evm_expected_sats) */
  amount: number;
  /** WBTC token address (derived from chain config or response) */
  wbtcAddress: string;
  /** HTLC sender (server's EVM address) */
  sender: string;
  /** EVM refund locktime (unix timestamp) */
  timelock: number;
  /** DEX swap calldata (null for WBTC-to-WBTC swaps) */
  dexCallData?: { to: string; data: string; value: string } | null;
  /** Target token address (for sweepToken) */
  targetTokenAddress: string;
  /** Bitcoin network */
  network: string;
}

/** Data needed for Arkade VHTLC claims */
export interface ArkadeClaimData {
  /** Lendaswap's public key (SENDER in the VHTLC) */
  lendaswapPubKey: string;
  /** Arkade server's public key */
  arkadeServerPubKey: string;
  /** VHTLC address to claim from */
  vhtlcAddress: string;
  /** Refund locktime (unix timestamp) */
  refundLocktime: number;
  /** Unilateral claim delay in seconds */
  unilateralClaimDelay: number;
  /** Unilateral refund delay in seconds */
  unilateralRefundDelay: number;
  /** Unilateral refund without receiver delay in seconds */
  unilateralRefundWithoutReceiverDelay: number;
  /** Bitcoin network */
  network: string;
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
  /** Data for Arkade VHTLC claims */
  arkadeClaimData?: ArkadeClaimData;
  /** Data for Arkade-to-EVM coordinator claims (redeemAndExecute) */
  coordinatorClaimData?: CoordinatorClaimData;
}

/** Result of a gasless claim via the server-side claim-gasless endpoint */
export interface ClaimGaslessResult {
  /** Swap ID */
  id: string;
  /** Current swap status */
  status: string;
  /** Transaction hash of the redeemAndExecute call */
  txHash: string;
  /** Success message */
  message: string;
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
  if (tokenId === "btc_arkade") return "arkade";
  return undefined;
}

/**
 * Maps an API Chain name (e.g. "Polygon") to a ClaimChain (e.g. "polygon").
 */
export function getClaimChainFromChainName(
  chain: string,
): ClaimChain | undefined {
  const lower = chain.toLowerCase();
  if (
    lower === "polygon" ||
    lower === "arbitrum" ||
    lower === "ethereum" ||
    lower === "arkade"
  ) {
    return lower;
  }
  return undefined;
}
