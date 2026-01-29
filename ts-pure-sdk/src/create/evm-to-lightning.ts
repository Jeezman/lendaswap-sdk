/**
 * EVM to Lightning swap creation.
 *
 * Supports swapping tokens from Polygon, Arbitrum, or Ethereum to pay a Lightning invoice.
 */

import type { GetSwapResponse } from "../api/client.js";
import { bytesToHex } from "../signer/index.js";
import type {
  CreateSwapContext,
  EvmToLightningSwapOptions,
  EvmToLightningSwapResult,
} from "./types.js";

/**
 * Creates a new EVM to Lightning swap.
 *
 * This allows users to swap ERC-20 tokens (USDC, USDT, etc.) from EVM chains
 * to pay a Lightning invoice.
 *
 * @param options - The swap options.
 * @param ctx - The context containing API client and helper functions.
 * @returns The swap response and parameters for storage.
 * @throws Error if the swap creation fails.
 *
 * @example
 * ```ts
 * const result = await createEvmToLightningSwap(
 *   {
 *     sourceChain: "polygon",
 *     sourceToken: "usdc_pol",
 *     bolt11Invoice: "lnbc...", // Lightning invoice to pay
 *     userAddress: "0x1234...", // EVM wallet address
 *   },
 *   { apiClient, deriveSwapParams, storeSwap }
 * );
 * console.log("Approve token:", result.response.source_token_address);
 * console.log("HTLC contract:", result.response.htlc_address_evm);
 * ```
 */
export async function createEvmToLightningSwap(
  options: EvmToLightningSwapOptions,
  ctx: CreateSwapContext,
): Promise<EvmToLightningSwapResult> {
  // We still derive swap params to get user_id for recovery purposes
  const swapParams = await ctx.deriveSwapParams();
  const userId = bytesToHex(swapParams.userId);

  const body = {
    bolt11_invoice: options.bolt11Invoice,
    source_token: options.sourceToken,
    user_address: options.userAddress,
    user_id: userId,
    referral_code: options.referralCode,
  };

  let response: EvmToLightningSwapResult["response"];

  switch (options.sourceChain) {
    case "polygon": {
      const { data, error } = await ctx.apiClient.POST(
        "/swap/polygon/lightning",
        { body },
      );
      if (error)
        throw new Error(`Failed to create swap: ${JSON.stringify(error)}`);
      if (!data) throw new Error("No swap data returned");
      response = data;
      break;
    }
    case "arbitrum": {
      const { data, error } = await ctx.apiClient.POST(
        "/swap/arbitrum/lightning",
        { body },
      );
      if (error)
        throw new Error(`Failed to create swap: ${JSON.stringify(error)}`);
      if (!data) throw new Error("No swap data returned");
      response = data;
      break;
    }
    case "ethereum": {
      const { data, error } = await ctx.apiClient.POST(
        "/swap/ethereum/lightning",
        { body },
      );
      if (error)
        throw new Error(`Failed to create swap: ${JSON.stringify(error)}`);
      if (!data) throw new Error("No swap data returned");
      response = data;
      break;
    }
    default:
      throw new Error(`Unsupported source chain: ${options.sourceChain}`);
  }

  // Store the swap if storage is configured
  await ctx.storeSwap(response.id, swapParams, {
    ...response,
    direction: "evm_to_btc",
  } as GetSwapResponse);

  return { response, swapParams };
}
