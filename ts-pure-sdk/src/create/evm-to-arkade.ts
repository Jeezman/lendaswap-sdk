/**
 * EVM to Arkade swap creation.
 *
 * Supports swapping tokens from Polygon, Arbitrum, or Ethereum to BTC on Arkade.
 */

import type { GetSwapResponse } from "../api/client.js";
import { bytesToHex } from "../signer/index.js";
import type {
  CreateSwapContext,
  EvmToArkadeSwapGenericOptions,
  EvmToArkadeSwapGenericResult,
  EvmToArkadeSwapOptions,
  EvmToArkadeSwapResult,
} from "./types.js";

/**
 * Creates a new EVM to Arkade swap.
 *
 * This allows users to swap ERC-20 tokens (USDC, USDT, etc.) from EVM chains
 * to receive BTC on Arkade.
 *
 * @param options - The swap options.
 * @param ctx - The context containing API client and helper functions.
 * @returns The swap response and parameters for storage.
 * @throws Error if the swap creation fails.
 *
 * @example
 * ```ts
 * const result = await createEvmToArkadeSwap(
 *   {
 *     sourceChain: "polygon",
 *     sourceToken: "usdc_pol",
 *     sourceAmount: 100.0, // 100 USDC
 *     targetAddress: "ark1q...", // Arkade address
 *     userAddress: "0x1234...", // EVM wallet address
 *   },
 *   { apiClient, deriveSwapParams, storeSwap }
 * );
 * console.log("Approve token:", result.response.source_token_address);
 * console.log("HTLC contract:", result.response.htlc_address_evm);
 * ```
 */
export async function createEvmToArkadeSwap(
  options: EvmToArkadeSwapOptions,
  ctx: CreateSwapContext,
): Promise<EvmToArkadeSwapResult> {
  const swapParams = await ctx.deriveSwapParams();
  const hashLock = `0x${bytesToHex(swapParams.preimageHash)}`;
  const receiverPk = bytesToHex(swapParams.publicKey);
  const userId = bytesToHex(swapParams.userId);

  const body = {
    hash_lock: hashLock,
    receiver_pk: receiverPk,
    user_id: userId,
    source_token: options.sourceToken,
    source_amount: options.sourceAmount,
    target_address: options.targetAddress,
    user_address: options.userAddress,
    referral_code: options.referralCode,
  };

  let response: EvmToArkadeSwapResult["response"];

  switch (options.sourceChain) {
    case "polygon": {
      const { data, error } = await ctx.apiClient.POST("/swap/polygon/arkade", {
        body,
      });
      if (error)
        throw new Error(`Failed to create swap: ${JSON.stringify(error)}`);
      if (!data) throw new Error("No swap data returned");
      response = data;
      break;
    }
    case "arbitrum": {
      const { data, error } = await ctx.apiClient.POST(
        "/swap/arbitrum/arkade",
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
        "/swap/ethereum/arkade",
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

/**
 * Creates a new EVM-to-Arkade swap via the generic endpoint.
 *
 * Uses the chain-agnostic `/swap/evm/arkade` endpoint which supports any
 * ERC-20 token reachable through 1inch aggregation.
 *
 * @param options - The swap options.
 * @param ctx - The context containing API client and helper functions.
 * @returns The swap response and parameters for storage.
 * @throws Error if the swap creation fails.
 *
 * @example
 * ```ts
 * const result = await createEvmToArkadeSwapGeneric(
 *   {
 *     targetAddress: "ark1q...",
 *     tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC on Polygon
 *     evmChainId: 137,
 *     userAddress: "0x1234...",
 *     sourceAmount: 100000000, // 100 USDC (6 decimals)
 *   },
 *   { apiClient, deriveSwapParams, storeSwap }
 * );
 * console.log("HTLC:", result.response.evm_htlc_address);
 * ```
 */
export async function createEvmToArkadeSwapGeneric(
  options: EvmToArkadeSwapGenericOptions,
  ctx: CreateSwapContext,
): Promise<EvmToArkadeSwapGenericResult> {
  const swapParams = await ctx.deriveSwapParams();
  const hashLock = `0x${bytesToHex(swapParams.preimageHash)}`;
  const receiverPk = bytesToHex(swapParams.publicKey);
  const userId = bytesToHex(swapParams.userId);

  const { data, error } = await ctx.apiClient.POST("/swap/evm/arkade", {
    body: {
      hash_lock: hashLock,
      receiver_pk: receiverPk,
      user_id: userId,
      target_address: options.targetAddress,
      token_address: options.tokenAddress,
      evm_chain_id: options.evmChainId,
      user_address: options.userAddress,
      amount_in: options.sourceAmount,
      amount_out: options.targetAmount,
      referral_code: options.referralCode,
    },
  });

  if (error) {
    throw new Error(`Failed to create swap: ${JSON.stringify(error)}`);
  }
  if (!data) {
    throw new Error("No swap data returned");
  }

  // Store the swap if storage is configured
  await ctx.storeSwap(data.id, swapParams, {
    ...data,
    direction: "evm_to_arkade",
  } as unknown as GetSwapResponse);

  return { response: data, swapParams };
}
