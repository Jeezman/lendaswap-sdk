/**
 * Types for swap creation operations.
 */

import type {
  BitcoinToEvmSwapResponse as ApiBitcoinToEvmSwapResponse,
  ApiClient,
  EvmToBitcoinSwapResponse as ApiEvmToBitcoinSwapResponse,
  ArkadeToEvmSwapResponse,
  BtcToArkadeSwapResponse,
  BtcToEvmSwapResponse,
  EvmToArkadeGenericSwapResponse,
  EvmToBtcSwapResponse,
  GetSwapResponse,
  TokenId,
} from "../api/client.js";
import type { SwapParams } from "../signer";

// Placeholder types until OpenAPI spec is regenerated
// These match the Rust API response types

/** Response from Lightning-to-EVM swap creation */
export interface LightningToEvmSwapResponse {
  id: string;
  status: string;
  hash_lock: string;
  evm_chain_id: number;
  evm_chain_name: string;
  target_address: string;
  claiming_address: string;
  token_address: string;
  token_symbol: string;
  token_decimals: number;
  amount_in_sats: number;
  amount_out_token: string;
  ln_invoice: string;
  ln_invoice_amount_sats: number;
  timelock: number;
  htlc_erc20_address: string;
  server_btc_receive_address: string;
  created_at: string;
  updated_at: string;
  dex_calldata?: {
    to: string;
    data: string;
    value: string;
  };
}

/** Response from EVM-to-Lightning swap creation */
export interface EvmToLightningSwapResponse {
  id: string;
  status: string;
  hash_lock: string;
  evm_chain_id: number;
  evm_chain_name: string;
  user_address: string;
  token_address: string;
  token_symbol: string;
  token_decimals: number;
  amount_in_token: string;
  amount_out_sats: number;
  lightning_invoice: string;
  timelock: number;
  htlc_erc20_address: string;
  created_at: string;
  updated_at: string;
}

/** Supported EVM chains for swaps */
export type EvmChain = "polygon" | "arbitrum" | "ethereum" | string;

/** Options for creating an Arkade or Lightning to EVM swap */
export interface BtcToEvmSwapOptions {
  /** Target EVM address to receive tokens */
  targetAddress: string;
  /** Target token ID (e.g., "usdc_pol", "usdt_arb") */
  targetToken: TokenId;
  /** Target EVM chain */
  targetChain: EvmChain;
  /** Amount in satoshis to send (optional if targetAmount is set) */
  sourceAmount?: number;
  /** Amount of target token to receive (optional if sourceAmount is set) */
  targetAmount?: number;
  /** Optional referral code for fee exemption */
  referralCode?: string;
}

/** Options for creating a Bitcoin (on-chain) to EVM swap via the generic endpoint */
export interface BitcoinToEvmSwapOptions {
  /** EVM address where tokens are swept after the claim (user's final destination) */
  targetAddress: string;
  /** ERC-20 contract address of the desired token on the target chain */
  tokenAddress: string;
  /** Numeric EVM chain ID: 1 (Ethereum), 137 (Polygon), 42161 (Arbitrum) */
  evmChainId: number;
  /** Amount in satoshis to send (mutually exclusive with targetAmount) */
  sourceAmount?: number;
  /** Amount of target token to receive in smallest unit (mutually exclusive with sourceAmount) */
  targetAmount?: number;
  /** Optional referral code for fee exemption */
  referralCode?: string;
}

/** Result of creating a BTC to EVM swap */
export interface BtcToEvmSwapResult {
  /** The swap response from the API */
  response: BtcToEvmSwapResponse;
  /** The swap parameters used (for storage/recovery) */
  swapParams: SwapParams;
}

/** Response from the generic `/swap/bitcoin/evm` endpoint. */
export type BitcoinToEvmSwapResponse = ApiBitcoinToEvmSwapResponse;

/** Result of creating a Bitcoin (on-chain) to EVM swap */
export interface BitcoinToEvmSwapResult {
  /** The swap response from the API */
  response: BitcoinToEvmSwapResponse;
  /** The swap parameters used (for storage/recovery) */
  swapParams: SwapParams;
}

/** Options for creating a Bitcoin (on-chain) to Arkade swap */
export interface BitcoinToArkadeSwapOptions {
  /** Amount in satoshis to receive on Arkade */
  satsReceive: number;
  /** Target Arkade address to receive VTXOs */
  targetAddress: string;
  /** Optional referral code for fee exemption */
  referralCode?: string;
}

/** Result of creating a Bitcoin (on-chain) to Arkade swap */
export interface BitcoinToArkadeSwapResult {
  /** The swap response from the API */
  response: BtcToArkadeSwapResponse;
  /** The swap parameters used (for storage/recovery) */
  swapParams: SwapParams;
}

/** Options for creating an EVM to Arkade swap */
export interface EvmToArkadeSwapOptions {
  /** Source EVM chain */
  sourceChain: EvmChain;
  /** Source token ID (e.g., "usdc_pol", "usdt_arb", "usdc_eth") */
  sourceToken: string;
  /** Amount of source token to send */
  sourceAmount: number;
  /** Target Arkade address to receive BTC */
  targetAddress: string;
  /** User's EVM wallet address (for checking allowance and building transactions) */
  userAddress: string;
  /** Optional referral code for fee exemption */
  referralCode?: string;
}

/** Result of creating an EVM to Arkade swap */
export interface EvmToArkadeSwapResult {
  /** The swap response from the API */
  response: EvmToBtcSwapResponse;
  /** The swap parameters used (for storage/recovery) */
  swapParams: SwapParams;
}

/** Options for creating an EVM to Lightning swap (chain-specific - deprecated) */
export interface EvmToLightningSwapOptions {
  /** Source EVM chain */
  sourceChain: EvmChain;
  /** Source token ID (e.g., "usdc_pol", "usdt_arb", "usdc_eth") */
  sourceToken: string;
  /** Lightning BOLT11 invoice to pay */
  bolt11Invoice: string;
  /** User's EVM wallet address (for checking allowance and building transactions) */
  userAddress: string;
  /** Optional referral code for fee exemption */
  referralCode?: string;
}

/** Result of creating an EVM to Lightning swap */
export interface EvmToLightningSwapResult {
  /** The swap response from the API */
  response: EvmToBtcSwapResponse;
  /** The swap parameters used (for storage/recovery) */
  swapParams: SwapParams;
}

/** Options for creating a Lightning-to-EVM swap via the generic endpoint */
export interface LightningToEvmSwapGenericOptions {
  /** EVM address where tokens are swept after the claim (user's final destination) */
  targetAddress: string;
  /** Numeric EVM chain ID: 1 (Ethereum), 137 (Polygon), 42161 (Arbitrum) */
  evmChainId: number;
  /** ERC-20 contract address of the desired token on the target chain */
  tokenAddress: string;
  /** Amount in satoshis to send (mutually exclusive with amountOut) */
  amountIn?: number;
  /** Amount of target token to receive in smallest unit (mutually exclusive with amountIn) */
  amountOut?: number;
  /** Optional referral code */
  referralCode?: string;
}

/** Result of creating a Lightning-to-EVM swap via the generic endpoint */
export interface LightningToEvmSwapGenericResult {
  /** The swap response from the API */
  response: LightningToEvmSwapResponse;
  /** The swap parameters used (for storage/recovery) */
  swapParams: SwapParams;
}

/** Options for creating an EVM-to-Lightning swap via the generic endpoint */
export interface EvmToLightningSwapGenericOptions {
  /** User's Lightning invoice to receive payment. Amount is derived from the invoice. */
  lightningInvoice: string;
  /** Numeric EVM chain ID: 1 (Ethereum), 137 (Polygon), 42161 (Arbitrum) */
  evmChainId: number;
  /** ERC-20 contract address of the source token on the EVM chain */
  tokenAddress: string;
  /** User's EVM address (sender of the ERC-20 token) */
  userAddress: string;
  /** Optional referral code */
  referralCode?: string;
}

/** Result of creating an EVM-to-Lightning swap via the generic endpoint */
export interface EvmToLightningSwapGenericResult {
  /** The swap response from the API */
  response: EvmToLightningSwapResponse;
  /** The swap parameters used (for storage/recovery) */
  swapParams: SwapParams;
}

/** Options for creating an EVM-to-Arkade swap via the generic endpoint */
export interface EvmToArkadeSwapGenericOptions {
  /** Target Arkade address to receive BTC */
  targetAddress: string;
  /** ERC-20 contract address of the source token on the EVM chain */
  tokenAddress: string;
  /** Numeric EVM chain ID: 1 (Ethereum), 137 (Polygon), 42161 (Arbitrum) */
  evmChainId: number;
  /** User's EVM wallet address (sender of the ERC-20 token) */
  userAddress: string;
  /** Amount of source token to send in smallest units (mutually exclusive with targetAmount) */
  sourceAmount?: bigint;
  /** Desired BTC output in sats (mutually exclusive with sourceAmount) */
  targetAmount?: number;
  /** Optional referral code */
  referralCode?: string;
}

/** Result of creating an EVM-to-Arkade swap via the generic endpoint */
export interface EvmToArkadeSwapGenericResult {
  /** The swap response from the API */
  response: EvmToArkadeGenericSwapResponse;
  /** The swap parameters used (for storage/recovery) */
  swapParams: SwapParams;
}

/** Options for creating an EVM-to-Bitcoin (on-chain) swap via the generic endpoint */
export interface EvmToBitcoinSwapOptions {
  /** ERC-20 contract address of the source token on the EVM chain */
  tokenAddress: string;
  /** Numeric EVM chain ID: 1 (Ethereum), 137 (Polygon), 42161 (Arbitrum) */
  evmChainId: number;
  /** User's EVM wallet address (sender of the ERC-20 token) */
  userAddress: string;
  /** Amount of source token to send in smallest units (mutually exclusive with targetAmount) */
  sourceAmount?: bigint;
  /** Desired BTC output in sats (mutually exclusive with sourceAmount) */
  targetAmount?: number;
  /** Optional referral code */
  referralCode?: string;
}

/** Result of creating an EVM-to-Bitcoin (on-chain) swap */
export interface EvmToBitcoinSwapResult {
  /** The swap response from the API */
  response: ApiEvmToBitcoinSwapResponse;
  /** The swap parameters used (for storage/recovery) */
  swapParams: SwapParams;
}

/** Options for creating an Arkade-to-EVM swap via the generic endpoint */
export interface ArkadeToEvmSwapOptions {
  /**
   * EVM address where tokens are swept after the claim (user's final destination).
   * This is required and will be stored on the server for use during redemption.
   */
  targetAddress: string;
  /** ERC-20 contract address of the desired token on the target chain */
  tokenAddress: string;
  /** Numeric EVM chain ID: 1 (Ethereum), 137 (Polygon), 42161 (Arbitrum) */
  evmChainId: number;
  /** Amount in satoshis to send (mutually exclusive with targetAmount) */
  sourceAmount?: bigint;
  /** Amount of target token to receive in smallest unit (mutually exclusive with sourceAmount) */
  targetAmount?: bigint;
  /** Optional referral code */
  referralCode?: string;
}

/** Result of creating an Arkade-to-EVM swap via the generic endpoint */
export interface ArkadeToEvmSwapResult {
  /** The swap response from the API */
  response: ArkadeToEvmSwapResponse;
  /** The swap parameters used (for storage/recovery) */
  swapParams: SwapParams;
}

/**
 * Context passed to swap creation functions.
 * Contains the dependencies needed from the client.
 */
export interface CreateSwapContext {
  /** The API client for making requests */
  apiClient: ApiClient;
  /** The base URL for the API (for endpoints not yet in OpenAPI spec) */
  baseUrl: string;
  /** Function to derive swap parameters (auto-increments key index) */
  deriveSwapParams: () => Promise<SwapParams>;
  /** Function to store the swap in storage (if configured) */
  storeSwap: (
    swapId: string,
    swapParams: SwapParams,
    response: GetSwapResponse,
  ) => Promise<void>;
}
