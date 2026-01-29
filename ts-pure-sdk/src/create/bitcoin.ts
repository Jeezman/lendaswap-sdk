/**
 * Bitcoin (on-chain) to EVM swap creation.
 */

import type { GetSwapResponse } from "../api/client.js";
import { bytesToHex } from "../signer/index.js";
import type {
  BitcoinToEvmSwapOptions,
  BitcoinToEvmSwapResult,
  CreateSwapContext,
} from "./types.js";

/**
 * Creates a new Bitcoin (on-chain) to EVM swap.
 *
 * @param options - The swap options.
 * @param ctx - The context containing API client and helper functions.
 * @returns The swap response and parameters for storage.
 * @throws Error if the swap creation fails.
 *
 * @example
 * ```ts
 * const result = await createBitcoinToEvmSwap(
 *   {
 *     targetAddress: "0x1234...",
 *     targetToken: "usdc_pol",
 *     targetChain: "polygon",
 *     sourceAmount: 100000, // 100k sats
 *   },
 *   { apiClient, deriveSwapParams, storeSwap }
 * );
 * console.log("Send BTC to:", result.response.btc_htlc_address);
 * ```
 */
export async function createBitcoinToEvmSwap(
  options: BitcoinToEvmSwapOptions,
  ctx: CreateSwapContext,
): Promise<BitcoinToEvmSwapResult> {
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
    referral_code: options.referralCode,
  };

  let response: BitcoinToEvmSwapResult["response"];

  switch (options.targetChain) {
    case "polygon": {
      const { data, error } = await ctx.apiClient.POST(
        "/swap/bitcoin/polygon",
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
        "/swap/bitcoin/arbitrum",
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
        "/swap/bitcoin/ethereum",
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
  // Use onchain_to_evm direction for Bitcoin on-chain swaps
  await ctx.storeSwap(response.id, swapParams, {
    ...response,
    direction: "onchain_to_evm",
  } as GetSwapResponse);

  return { response, swapParams };
}
