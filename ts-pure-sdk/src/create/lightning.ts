/**
 * Lightning to EVM swap creation.
 */

import { bytesToHex } from "../signer/index.js";
import type {
  BtcToEvmSwapOptions,
  BtcToEvmSwapResult,
  CreateSwapContext,
} from "./types.js";

/**
 * Creates a new Lightning to EVM swap.
 *
 * @param options - The swap options.
 * @param ctx - The context containing API client and helper functions.
 * @returns The swap response and parameters for storage.
 * @throws Error if the swap creation fails.
 *
 * @example
 * ```ts
 * const result = await createLightningToEvmSwap(
 *   {
 *     targetAddress: "0x1234...",
 *     targetToken: "usdc_pol",
 *     targetChain: "polygon",
 *     sourceAmount: 100000, // 100k sats
 *   },
 *   { apiClient, deriveSwapParams, storeSwap }
 * );
 * console.log("Pay this invoice:", result.response.ln_invoice);
 * ```
 */
export async function createLightningToEvmSwap(
  options: BtcToEvmSwapOptions,
  ctx: CreateSwapContext,
): Promise<BtcToEvmSwapResult> {
  const swapParams = await ctx.deriveSwapParams();
  const hashLock = `0x${bytesToHex(swapParams.preimageHash)}`;
  const refundPk = bytesToHex(swapParams.publicKey);
  const userId = bytesToHex(swapParams.userId);

  const body = {
    hash_lock: hashLock,
    refund_pk: refundPk,
    user_id: userId,
    target_address: options.targetAddress,
    target_token: options.targetToken,
    source_amount: options.sourceAmount,
    target_amount: options.targetAmount,
    referral_code: options.referralCode,
  };

  let response: BtcToEvmSwapResult["response"];

  switch (options.targetChain) {
    case "polygon": {
      const { data, error } = await ctx.apiClient.POST(
        "/swap/lightning/polygon",
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
        "/swap/lightning/arbitrum",
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
        "/swap/lightning/ethereum",
        { body },
      );
      if (error)
        throw new Error(`Failed to create swap: ${JSON.stringify(error)}`);
      if (!data) throw new Error("No swap data returned");
      response = data;
      break;
    }
    default:
      throw new Error(`Unsupported target chain: ${options.targetChain}`);
  }

  // Store the swap if storage is configured
  await ctx.storeSwap(response.id, swapParams, {
    ...response,
    direction: "btc_to_evm",
  });

  return { response, swapParams };
}
