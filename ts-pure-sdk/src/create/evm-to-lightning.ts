/**
 * EVM to Lightning swap creation.
 *
 * Supports swapping tokens from any EVM chain to pay a Lightning invoice.
 */

import { bytesToHex } from "../signer/index.js";
import type {
  CreateSwapContext,
  EvmToLightningSwapGenericOptions,
  EvmToLightningSwapGenericResult,
  EvmToLightningSwapOptions,
  EvmToLightningSwapResponse,
  EvmToLightningSwapResult,
} from "./types.js";

/**
 * Creates a new EVM to Lightning swap using the chain-agnostic generic endpoint.
 *
 * This allows users to swap any ERC-20 token from any supported EVM chain
 * to pay a Lightning invoice.
 *
 * @param options - The swap options.
 * @param ctx - The context containing API client and helper functions.
 * @returns The swap response and parameters for storage.
 * @throws Error if the swap creation fails.
 *
 * @example
 * ```ts
 * const result = await createEvmToLightningSwapGeneric(
 *   {
 *     lightningInvoice: "lnbc...",
 *     evmChainId: 137,               // Polygon
 *     tokenAddress: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC
 *     amountIn: 10000000,            // 10 USDC (6 decimals)
 *     userAddress: "0x1234...",
 *   },
 *   { apiClient, deriveSwapParams, storeSwap }
 * );
 * console.log("HTLC contract:", result.response.htlc_erc20_address);
 * ```
 */
export async function createEvmToLightningSwapGeneric(
  options: EvmToLightningSwapGenericOptions,
  ctx: CreateSwapContext,
): Promise<EvmToLightningSwapGenericResult> {
  const swapParams = await ctx.deriveSwapParams();
  // Note: For EVM-to-Lightning, hash_lock is derived from the Lightning invoice's payment_hash
  // by the server, so we don't send it here.
  const userId = bytesToHex(swapParams.userId);

  const body = {
    user_id: userId,
    lightning_invoice: options.lightningInvoice,
    evm_chain_id: options.evmChainId,
    token_address: options.tokenAddress,
    user_address: options.userAddress,
    referral_code: options.referralCode,
  };

  // Use fetch directly since the generated types don't have this endpoint yet
  const response = await fetch(`${ctx.baseUrl}/swap/evm/lightning`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create swap: ${error}`);
  }

  const data = (await response.json()) as EvmToLightningSwapResponse;

  // Store the swap if storage is configured
  await ctx.storeSwap(data.id, swapParams, {
    ...data,
    direction: "evm_to_lightning",
  });

  return { response: data, swapParams };
}

/**
 * Creates a new EVM to Lightning swap (legacy chain-specific endpoint).
 *
 * @deprecated Use createEvmToLightningSwapGeneric instead for chain-agnostic swaps.
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
  });

  return { response, swapParams };
}
