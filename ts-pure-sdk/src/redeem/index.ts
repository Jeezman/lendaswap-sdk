/**
 * Redeem module for Lendaswap swaps.
 *
 * Provides redeem/claim logic for completing swaps:
 * - Gelato relay for gasless EVM claims (Polygon, Arbitrum)
 * - Manual claiming with call data for Ethereum
 * - Arkade VHTLC claiming for EVM-to-Arkade swaps
 * - Coordinator redeemAndExecute for Arkade-to-EVM swaps
 */

import type { ArkadeToEvmSwapResponse } from "../api/client.js";
import { buildEthereumClaimData } from "./ethereum.js";
import { claimGasless } from "./gasless.js";
import {
  type ArkadeClaimData,
  type ClaimResult,
  type CoordinatorClaimData,
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
  ClaimGaslessResult,
  ClaimResult,
  CoordinatorClaimData,
  EthereumClaimData,
  RedeemContext,
} from "./types.js";
export { getChainFromTokenId } from "./types.js";

/**
 * Claims a swap by revealing the preimage.
 *
 * The claim method depends on the swap direction and target chain:
 * - **Arkade-to-EVM**: Returns coordinator data for `redeemAndExecute` (user must sign EIP-712 and submit tx)
 * - **Polygon/Arbitrum**: Uses Gelato Relay for gasless execution
 * - **Ethereum**: Returns call data for manual claiming
 * - **Arkade**: Returns data needed for `buildArkadeClaim()`
 *
 * @param id - The UUID of the swap.
 * @param secret - The preimage/secret (32-byte hex string, with or without 0x prefix).
 * @param ctx - The context containing the API client and getSwap function.
 * @param destination - (Optional) EVM address for receiving tokens. Required for Arkade-to-EVM
 *                      swaps to fetch fresh DEX calldata.
 * @returns A ClaimResult with the outcome.
 *
 * @example
 * ```ts
 * const result = await claim(swapId, storedSwap.preimage, ctx, "0x1234...");
 * if (result.success) {
 *   if (result.coordinatorClaimData) {
 *     // Arkade-to-EVM: build EIP-712 sig and call redeemAndExecute
 *     const digest = buildRedeemDigest({ ... result.coordinatorClaimData });
 *     // Sign digest with EVM wallet, then encodeRedeemAndExecute(...)
 *   } else if (result.chain === "arkade") {
 *     // Arkade claim needs user's keys
 *     await buildArkadeClaim({ ...result.arkadeClaimData, ... });
 *   } else if (result.chain === "ethereum") {
 *     // Manual EVM claim
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
  destination?: string,
): Promise<ClaimResult> {
  // Get the swap to determine target chain
  const swap = await ctx.getSwap(id);

  // Check if this is an arkade_to_evm swap (uses coordinator redeemAndExecute)
  if ("direction" in swap && swap.direction === "arkade_to_evm") {
    return buildCoordinatorClaimData(
      id,
      swap as unknown as ArkadeToEvmSwapResponse,
      ctx,
      destination,
    );
  }

  // target_token may be a string (TokenId) or object (TokenSummary)
  const targetToken =
    typeof swap.target_token === "string"
      ? swap.target_token
      : swap.target_token.address;
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
 * Builds the claim data for an Arkade-to-EVM swap (coordinator redeemAndExecute).
 *
 * The user must:
 * 1. Build the EIP-712 digest using `buildRedeemDigest()` from `evm/coordinator`
 * 2. Sign the digest with their EVM wallet
 * 3. Build the transaction using `encodeRedeemAndExecute()`
 * 4. Submit the transaction to the coordinator contract
 *
 * @param id - The swap ID
 * @param swap - The swap response
 * @param ctx - The redeem context with API client
 * @param destination - Optional EVM address for receiving tokens. If provided and the swap
 *                      involves a DEX swap (target != WBTC), fresh calldata is fetched.
 */
async function buildCoordinatorClaimData(
  id: string,
  swap: ArkadeToEvmSwapResponse,
  ctx: RedeemContext,
  destination?: string,
): Promise<ClaimResult> {
  // source_token and target_token are TokenSummary objects
  const sourceToken = swap.source_token as {
    address: string;
    symbol: string;
    decimals: number;
  };
  const targetToken = swap.target_token as {
    address: string;
    symbol: string;
    decimals: number;
  };

  // Check if this swap involves a DEX swap (target token is different from WBTC)
  const needsDexSwap = targetToken.address !== sourceToken.address;

  let dexCallData: { to: string; data: string; value: string } | undefined;

  // Fetch fresh DEX calldata if destination is provided and swap needs DEX
  if (destination && needsDexSwap) {
    const response = await ctx.apiClient.GET(
      "/swap/{id}/redeem-and-swap-calldata",
      {
        params: {
          path: { id },
          query: { destination },
        },
      },
    );

    if (response.error) {
      return {
        success: false,
        message: `Failed to fetch DEX calldata: ${response.error.error || "Unknown error"}`,
      };
    }

    if (response.data) {
      dexCallData = {
        to: response.data.to,
        data: response.data.data,
        value: response.data.value,
      };
    }
  }

  const coordinatorClaimData: CoordinatorClaimData = {
    htlcAddress: swap.evm_htlc_address,
    coordinatorAddress: swap.evm_coordinator_address,
    chainId: swap.evm_chain_id,
    amount: swap.evm_expected_sats,
    wbtcAddress: sourceToken.address,
    sender: swap.server_evm_address,
    timelock: swap.evm_refund_locktime,
    dexCallData,
    targetTokenAddress: targetToken.address,
    network: swap.network,
  };

  const message = destination
    ? "Arkade-to-EVM claims require EIP-712 signing. Use buildRedeemDigest() and encodeRedeemAndExecute() with the provided data."
    : "Arkade-to-EVM claims require EIP-712 signing. Note: No destination provided - call claim() again with your EVM address to fetch fresh DEX calldata.";

  return {
    success: true,
    message,
    coordinatorClaimData,
  };
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
