/**
 * API client wrapper for the Lendaswap REST API.
 *
 * This module provides a high-level TypeScript API that wraps the WASM-based
 * API client for easier use in TypeScript/JavaScript applications.
 */

// Import WASM types for internal use
// With --target bundler, WASM is automatically initialized via static import
import {
  type AssetPair,
  type BtcToArkadeSwapResponse,
  type BtcToEvmSwapResponse,
  Client as WasmClient,
  ClientBuilder as WasmClientBuilder,
  type CreateVtxoSwapResult,
  type EstimateVtxoSwapResponse,
  type EvmToBtcSwapResponse,
  type ExtendedSwapStorageData as WasmExtendedSwapStorageData,
  type ExtendedVtxoSwapStorageData,
  getLogLevel as wasmGetLogLevel,
  type IdbStorageHandle,
  type OnchainToEvmSwapResponse,
  type QuoteResponse,
  setLogLevel as wasmSetLogLevel,
  type SwapParams,
  type TokenInfo,
  type Version,
  type VhtlcAmounts,
  type VtxoSwapResponse,
} from "../wasm/lendaswap_wasm_sdk.js";

// Re-export WASM types directly
export {
  AssetPair,
  BtcToEvmSwapResponse,
  BtcToArkadeSwapResponse,
  Chain,
  CreateVtxoSwapResult,
  EstimateVtxoSwapResponse,
  EvmToBtcSwapResponse,
  ExtendedSwapStorageData as ExtendedSwapStorageDataWasm,
  ExtendedVtxoSwapStorageData,
  IdbStorageHandle,
  Network,
  OnchainToEvmSwapResponse,
  openIdbDatabase,
  QuoteResponse,
  SwapParams as VtxoSwapParams,
  SwapStatus,
  SwapType,
  swapStatusToString,
  TokenId,
  TokenInfo,
  Version,
  VhtlcAmounts,
  VtxoSwapResponse,
} from "../wasm/lendaswap_wasm_sdk.js";

/**
 * Convert WASM ExtendedSwapStorageData to plain TypeScript interface.
 * Returns undefined if the swap response type is unknown.
 */
function mapWasmSwapToInterface(
  wasmSwap: WasmExtendedSwapStorageData,
): ExtendedSwapStorageData | undefined {
  const response =
    wasmSwap.btcToEvmResponse ??
    wasmSwap.evmToBtcResponse ??
    wasmSwap.btcToArkadeResponse ??
    wasmSwap.onchainToEvmResponse;
  if (!response) {
    return undefined;
  }
  return {
    response,
    swap_params: wasmSwap.swapParams,
  };
}

/**
 * Known token identifiers.
 * Add new tokens here as they become supported.
 * Uses (string & {}) to allow unknown tokens while preserving autocomplete.
 */
export type TokenIdString =
  | "btc_lightning"
  | "btc_arkade"
  | "btc_onchain"
  | "usdc_pol"
  | "usdt0_pol"
  | "usdc_eth"
  | "usdt_eth"
  | "xaut_eth"
  | (string & {});

/**
 * Union type for swap responses based on direction.
 * Uses WASM types directly - BtcToEvmSwapResponse and EvmToBtcSwapResponse are
 * exported from the WASM module.
 */
export type GetSwapResponse =
  | BtcToEvmSwapResponse
  | EvmToBtcSwapResponse
  | BtcToArkadeSwapResponse
  | OnchainToEvmSwapResponse;

/**
 * Extended swap storage data combining the API response with client-side swap parameters.
 * Used for storage providers and as a common interface for swap data.
 */
export interface ExtendedSwapStorageData {
  response:
    | BtcToEvmSwapResponse
    | EvmToBtcSwapResponse
    | BtcToArkadeSwapResponse
    | OnchainToEvmSwapResponse;
  swap_params: SwapParams;
}

/**
 * Request to create an Arkade to EVM swap (BTC → Token).
 */
export interface SwapRequest {
  // Source amount in sats
  source_amount?: bigint;
  target_address: string;
  // Target amount in the asset of choice, e.g. $1 = 1
  target_amount?: number;
  target_token: TokenIdString;
  referral_code?: string;
}

/**
 * Request to create an EVM to Arkade swap (Token → BTC).
 */
export interface EvmToArkadeSwapRequest {
  target_address: string;
  source_amount: number;
  source_token: TokenIdString;
  user_address: string;
  referral_code?: string;
}

/**
 * Request to create an EVM to Lightning swap.
 */
export interface EvmToLightningSwapRequest {
  bolt11_invoice: string;
  source_token: TokenIdString;
  user_address: string;
  referral_code?: string;
}

/**
 * Request to create an on-chain Bitcoin to Arkade swap.
 */
export interface BtcToArkadeSwapRequest {
  /** User's target Arkade address to receive VTXOs */
  target_arkade_address: string;
  /** Amount user wants to receive on Arkade in satoshis */
  sats_receive: number;
  /** Optional referral code */
  referral_code?: string;
}

/**
 * Request to create an on-chain Bitcoin to EVM swap.
 */
export interface OnchainToEvmSwapRequest {
  /** User's EVM address to receive tokens */
  target_address: string;
  /** Amount of BTC to send in satoshis */
  source_amount: bigint;
  /** Target token (e.g., "usdc_pol", "usdt_pol") */
  target_token: TokenIdString;
  /** Optional referral code */
  referral_code?: string;
}

/**
 * Gelato relay submit request.
 */
export interface GelatoSubmitRequest {
  create_swap_signature: string;
  user_nonce: string;
  user_deadline: string;
}

/**
 * Gelato relay submit response.
 */
export interface GelatoSubmitResponse {
  create_swap_task_id: string;
  message: string;
}

/**
 * Recovered swap with index.
 */
export type RecoveredSwap = GetSwapResponse & { index: number };

/**
 * Response from the recover swaps endpoint.
 */
export interface RecoverSwapsResponse {
  swaps: RecoveredSwap[];
  highest_index: number;
}

/**
 * Quote request parameters.
 */
export interface QuoteRequest {
  from: TokenIdString;
  to: TokenIdString;
  base_amount: number;
}

/**
 * Network input type for Bitcoin networks (string union for API convenience).
 */
export type NetworkInput = "bitcoin" | "testnet" | "regtest" | "mutinynet";

/**
 * Builder for constructing a Client with a fluent API.
 *
 * Uses IndexedDB storage via `.withIdbStorage()` for browser applications.
 * For Node.js server-side applications, use `@lendasat/lendaswap-sdk-native` instead.
 *
 * @example
 * ```typescript
 * import { Client } from '@lendasat/lendaswap-sdk';
 *
 * const client = await Client.builder()
 *   .url('https://api.lendaswap.com')
 *   .withIdbStorage()
 *   .network('bitcoin')
 *   .arkadeUrl('https://arkade.computer')
 *   .esploraUrl('https://mempool.space/api')
 *   .build();
 * ```
 */
export class ClientBuilder {
  private _url?: string;
  private _storage?: IdbStorageHandle;
  private _network?: NetworkInput;
  private _arkadeUrl?: string;
  private _esploraUrl?: string;
  private _apiKey?: string;

  constructor() {}

  /**
   * Set the Lendaswap API URL.
   */
  url(url: string): this {
    this._url = url;
    return this;
  }

  /**
   * Use IndexedDB storage.
   *
   * This will automatically open the IndexedDB database when `build()` is called.
   *
   * @example
   * ```typescript
   * const client = await Client.builder()
   *   .url('https://api.lendaswap.com')
   *   .withIdbStorage()
   *   .network('bitcoin')
   *   .arkadeUrl('...')
   *   .esploraUrl('...')
   *   .build();
   * ```
   */
  withIdbStorage(): this {
    // We'll open the database in build() - storage will be set then
    return this;
  }

  /**
   * Set the storage handle directly (for advanced use cases).
   * @deprecated Use `.withIdbStorage()` instead.
   */
  storage(storage: IdbStorageHandle): this {
    this._storage = storage;
    return this;
  }

  /**
   * Set the Bitcoin network.
   */
  network(network: NetworkInput): this {
    this._network = network;
    return this;
  }

  /**
   * Set the Arkade server URL.
   */
  arkadeUrl(url: string): this {
    this._arkadeUrl = url;
    return this;
  }

  /**
   * Set the Esplora API URL for on-chain Bitcoin operations.
   */
  esploraUrl(url: string): this {
    this._esploraUrl = url;
    return this;
  }

  /**
   * Set the API key for tracking swap creation.
   *
   * When set, the API key will be sent as the `X-API-Key` header on swap creation requests.
   */
  apiKey(apiKey: string): this {
    this._apiKey = apiKey;
    return this;
  }

  /**
   * Build the client asynchronously.
   *
   * @returns A Promise that resolves to a new Client instance
   * @throws Error if any required field is missing or storage initialization fails
   */
  async build(): Promise<Client> {
    if (!this._url) {
      throw new Error("url is required - call .url(url)");
    }
    if (!this._network) {
      throw new Error("network is required - call .network(network)");
    }
    if (!this._arkadeUrl) {
      throw new Error("arkadeUrl is required - call .arkadeUrl(url)");
    }
    if (!this._esploraUrl) {
      throw new Error("esploraUrl is required - call .esploraUrl(url)");
    }

    const { openIdbDatabase } = await import("../wasm/lendaswap_wasm_sdk.js");

    // If storage handle wasn't provided directly, open it now
    let storageHandle = this._storage;
    if (!storageHandle) {
      storageHandle = await openIdbDatabase();
    }

    let wasmBuilder = new WasmClientBuilder()
      .url(this._url)
      .storage(storageHandle)
      .network(this._network)
      .arkadeUrl(this._arkadeUrl)
      .esploraUrl(this._esploraUrl);

    if (this._apiKey) {
      wasmBuilder = wasmBuilder.apiKey(this._apiKey);
    }

    const wasmClient = wasmBuilder.build();

    return Client.fromWasmClient(wasmClient);
  }
}

/**
 * Lendaswap client using IndexedDB storage.
 *
 * This client uses native Rust IndexedDB storage via the `idb` crate,
 * eliminating the need for JavaScript storage callbacks.
 *
 * @example
 * ```typescript
 * import { openIdbDatabase, Client } from '@lendasat/lendaswap-sdk';
 *
 * // Open the IndexedDB database
 * const storage = await openIdbDatabase();
 *
 * // Create the client
 * const client = await Client.create(
 *   'https://api.lendaswap.com',
 *   storage,
 *   'bitcoin',
 *   'https://arkade.computer',
 *   'https://mempool.space/api'
 * );
 *
 * // Initialize wallet (generates mnemonic if needed)
 * await client.init();
 *
 * // Get all swaps
 * const swaps = await client.listAllSwaps();
 * ```
 */
export class Client {
  private wasmClient: WasmClient;

  private constructor(wasmClient: WasmClient) {
    this.wasmClient = wasmClient;
  }

  /**
   * Create a new ClientBuilder for constructing a client.
   *
   * @example
   * ```typescript
   * const client = Client.builder()
   *   .url('https://api.lendaswap.com')
   *   .withIdbStorage()
   *   .network('bitcoin')
   *   .arkadeUrl('https://arkade.computer')
   *   .esploraUrl('https://mempool.space/api')
   *   .build();
   * ```
   */
  static builder(): ClientBuilder {
    return new ClientBuilder();
  }

  /**
   * Create a Client from a WASM client instance.
   * Used internally by ClientBuilder.
   */
  static fromWasmClient(wasmClient: WasmClient): Client {
    return new Client(wasmClient);
  }

  /**
   * Create a new Client instance with IndexedDB storage.
   *
   * @param baseUrl - The base URL of the Lendaswap API
   * @param storage - Storage handle from `openIdbDatabase()`
   * @param network - Bitcoin network ("bitcoin", "testnet", "regtest", "mutinynet")
   * @param arkadeUrl - Arkade's server url
   * @param esploraUrl - Esplora API URL for on-chain Bitcoin operations (e.g., "https://mempool.space/api")
   * @returns A new Client instance
   *
   * @example
   * ```typescript
   * import { openIdbDatabase, Client } from '@lendasat/lendaswap-sdk';
   *
   * const storage = await openIdbDatabase();
   * const client = await Client.create(
   *   'https://apilendaswap.lendasat.com',
   *   storage,
   *   'bitcoin',
   *   'https://arkade.computer',
   *   'https://mempool.space/api'
   * );
   * ```
   */
  static async create(
    baseUrl: string,
    storage: IdbStorageHandle,
    network: NetworkInput,
    arkadeUrl: string,
    esploraUrl: string,
  ): Promise<Client> {
    const wasmClient = new WasmClient(
      baseUrl,
      storage,
      network,
      arkadeUrl,
      esploraUrl,
    );

    return Client.fromWasmClient(wasmClient);
  }

  async init(mnemonic?: string): Promise<void> {
    await this.wasmClient.init(mnemonic);
  }

  /**
   * Set the API key for tracking swap creation.
   *
   * When set, the API key will be sent as the `X-API-Key` header on swap creation requests.
   */
  setApiKey(apiKey: string | undefined): void {
    this.wasmClient.setApiKey(apiKey);
  }

  /**
   * Get the current API key.
   */
  get apiKey(): string | undefined {
    return this.wasmClient.apiKey;
  }

  /**
   * Create an Arkade to EVM swap (BTC → Token).
   *
   * @param request - The swap request parameters
   * @param targetNetwork - Target EVM network (e.g., 'polygon', 'ethereum')
   * @returns The created swap response
   */
  async createArkadeToEvmSwap(
    request: SwapRequest,
    targetNetwork: "ethereum" | "polygon",
  ): Promise<BtcToEvmSwapResponse> {
    if (
      request.source_amount &&
      request.target_amount &&
      request.source_amount > 0 &&
      request.target_amount > 0
    ) {
      throw Error("Cannot have source amount and target amount defined");
    }
    return await this.wasmClient.createArkadeToEvmSwap(
      request.target_address,
      request.source_amount,
      request.target_amount,
      request.target_token,
      targetNetwork,
      request.referral_code,
    );
  }

  /**
   * Create a Lightning to EVM swap (BTC → Token).
   *
   * @param request - The swap request parameters
   * @param targetNetwork - Target EVM network (e.g., 'polygon', 'ethereum')
   * @returns The created swap response
   */
  async createLightningToEvmSwap(
    request: SwapRequest,
    targetNetwork: "ethereum" | "polygon",
  ): Promise<BtcToEvmSwapResponse> {
    if (
      request.source_amount &&
      request.target_amount &&
      request.source_amount > 0 &&
      request.target_amount > 0
    ) {
      throw Error("Cannot have source amount and target amount defined");
    }
    return await this.wasmClient.createLightningToEvmSwap(
      request.target_address,
      request.source_amount,
      request.target_amount,
      request.target_token,
      targetNetwork,
      request.referral_code,
    );
  }

  /**
   * Create an EVM to Arkade swap (Token → BTC).
   *
   * @param request - The swap request parameters
   * @param sourceNetwork - Source EVM network (e.g., 'polygon', 'ethereum')
   * @returns The created swap response
   */
  async createEvmToArkadeSwap(
    request: EvmToArkadeSwapRequest,
    sourceNetwork: "ethereum" | "polygon",
  ): Promise<EvmToBtcSwapResponse> {
    return await this.wasmClient.createEvmToArkadeSwap(
      request.target_address,
      request.user_address,
      request.source_amount,
      request.source_token,
      sourceNetwork,
      request.referral_code,
    );
  }

  /**
   * Create an EVM to Lightning swap (Token → BTC).
   *
   * @param request - The swap request parameters
   * @param sourceNetwork - Source EVM network (e.g., 'polygon', 'ethereum')
   * @returns The created swap response
   */
  async createEvmToLightningSwap(
    request: EvmToLightningSwapRequest,
    sourceNetwork: "ethereum" | "polygon",
  ): Promise<EvmToBtcSwapResponse> {
    return await this.wasmClient.createEvmToLightningSwap(
      request.bolt11_invoice,
      request.user_address,
      request.source_token,
      sourceNetwork,
      request.referral_code,
    );
  }

  async getAssetPairs(): Promise<AssetPair[]> {
    return await this.wasmClient.getAssetPairs();
  }

  async getTokens(): Promise<TokenInfo[]> {
    return await this.wasmClient.getTokens();
  }

  /**
   * Get a quote for a swap.
   *
   * @param from - Source token ID (e.g., 'btc_arkade')
   * @param to - Destination token ID (e.g., 'usdc_pol')
   * @param baseAmount - Amount in base units (satoshis for BTC, wei for EVM)
   * @returns Quote response with exchange rate and fees
   */
  async getQuote(
    from: TokenIdString,
    to: TokenIdString,
    baseAmount: bigint,
  ): Promise<QuoteResponse> {
    return await this.wasmClient.getQuote(from, to, baseAmount);
  }

  /**
   * Get a swap by its ID.
   *
   * @param id - The swap ID
   * @returns The swap data, or undefined if the swap type is unknown
   */
  async getSwap(id: string): Promise<ExtendedSwapStorageData | undefined> {
    return mapWasmSwapToInterface(await this.wasmClient.getSwap(id));
  }

  /**
   * Gets all stored swaps.
   *
   * @returns Array of swaps (unknown types are filtered out)
   */
  async listAllSwaps(): Promise<ExtendedSwapStorageData[]> {
    const wasmSwaps = await this.wasmClient.listAll();
    return wasmSwaps.map(mapWasmSwapToInterface).filter((s) => s !== undefined);
  }

  /**
   * Claim a swap via Gelato relay (gasless).
   *
   * @param swapId - The swap ID
   * @param secret - The preimage secret (hex-encoded)
   */
  async claimGelato(swapId: string, secret?: string): Promise<void> {
    await this.wasmClient.claimGelato(swapId, secret);
  }

  /**
   * Get the VHTLC amounts associated with a swap.
   *
   * @param swapId - The swap ID
   * @returns VhtlcAmounts
   */
  async amountsForSwap(swapId: string): Promise<VhtlcAmounts> {
    return await this.wasmClient.amountsForSwap(swapId);
  }

  /**
   * Claim a swap VHTLC
   *
   * @param swapId - The swap ID
   */
  async claimVhtlc(swapId: string): Promise<void> {
    await this.wasmClient.claimVhtlc(swapId);
  }

  /**
   * Refund a swap VHTLC
   *
   * @param swapId - The swap ID
   * @param refundAddress - The address to receive the refund
   * @returns The TXID of the Ark transaction which refunded the VHTLC.
   */
  async refundVhtlc(swapId: string, refundAddress: string): Promise<string> {
    return await this.wasmClient.refundVhtlc(swapId, refundAddress);
  }

  /**
   * Get the API version.
   *
   * @returns Version information
   */
  async getVersion(): Promise<Version> {
    return await this.wasmClient.getVersion();
  }

  /**
   * Recover swaps for the currently loaded mnemonic.
   *
   * @returns Array of recovered swaps (unknown types are filtered out)
   */
  async recoverSwaps(): Promise<ExtendedSwapStorageData[]> {
    const wasmSwaps = await this.wasmClient.recoverSwaps();
    return wasmSwaps.map(mapWasmSwapToInterface).filter((s) => s !== undefined);
  }

  /**
   * Get current loaded mnemonic
   * @returns The mnemonic as string
   */
  async getMnemonic(): Promise<string> {
    return await this.wasmClient.getMnemonic();
  }

  /**
   * Get current loaded user id xpub
   * @returns The xpub as string
   */
  async getUserIdXpub(): Promise<string> {
    return await this.wasmClient.getUserIdXpub();
  }

  /**
   * Deletes all stored swaps
   */
  async clearSwapStorage(): Promise<void> {
    await this.wasmClient.clearSwapStorage();
  }

  /**
   * Delete one particular swap by id
   */
  async deleteSwap(id: string): Promise<void> {
    await this.wasmClient.deleteSwap(id);
  }

  // =========================================================================
  // VTXO Swap Methods
  // =========================================================================

  /**
   * Estimate the fee for a VTXO swap.
   *
   * @param vtxos - List of VTXO outpoints to refresh ("txid:vout" format)
   * @returns Estimate response with fee and output amounts
   */
  async estimateVtxoSwap(vtxos: string[]): Promise<EstimateVtxoSwapResponse> {
    return await this.wasmClient.estimateVtxoSwap(vtxos);
  }

  /**
   * Create a VTXO swap for refreshing VTXOs.
   *
   * This creates a swap where the client will fund their VHTLC first,
   * then the server funds their VHTLC, and the client claims the server's
   * VHTLC to complete the swap.
   *
   * @param vtxos - List of VTXO outpoints to refresh ("txid:vout" format)
   * @returns The swap response and swap parameters
   */
  async createVtxoSwap(vtxos: string[]): Promise<CreateVtxoSwapResult> {
    return await this.wasmClient.createVtxoSwap(vtxos);
  }

  /**
   * Get VTXO swap details by ID.
   *
   * @param id - The swap ID
   * @returns The extended VTXO swap data
   */
  async getVtxoSwap(id: string): Promise<ExtendedVtxoSwapStorageData> {
    return await this.wasmClient.getVtxoSwap(id);
  }

  /**
   * Claim the server's VHTLC in a VTXO swap.
   *
   * This should be called after the server has funded their VHTLC.
   * The client reveals the preimage to claim the fresh VTXOs.
   *
   * @param swap - The VTXO swap response
   * @param swapParams - The client's swap parameters (containing preimage)
   * @param claimAddress - The Arkade address to receive the claimed funds
   * @returns The claim transaction ID
   */
  async claimVtxoSwap(
    swap: VtxoSwapResponse,
    swapParams: SwapParams,
    claimAddress: string,
  ): Promise<string> {
    return await this.wasmClient.claimVtxoSwap(swap, swapParams, claimAddress);
  }

  /**
   * Refund the client's VHTLC in a VTXO swap.
   *
   * This can be called if the swap fails (e.g., server doesn't fund)
   * and the client's locktime has expired.
   *
   * @param swapId - The swap ID
   * @param refundAddress - The Arkade address to receive the refunded funds
   * @returns The refund transaction ID
   */
  async refundVtxoSwap(swapId: string, refundAddress: string): Promise<string> {
    return await this.wasmClient.refundVtxoSwap(swapId, refundAddress);
  }

  /**
   * List all VTXO swaps from local storage.
   *
   * Returns all stored VTXO swaps without fetching from the API.
   *
   * @returns Array of all stored extended VTXO swap data
   */
  async listAllVtxoSwaps(): Promise<ExtendedVtxoSwapStorageData[]> {
    return await this.wasmClient.listAllVtxoSwaps();
  }

  /**
   * Create an on-chain Bitcoin to Arkade swap.
   *
   * User sends on-chain BTC to a P2WSH HTLC address, and receives Arkade VTXOs.
   *
   * @param request - The swap request parameters
   * @returns The created swap response with P2WSH address to fund
   */
  async createBitcoinToArkadeSwap(
    request: BtcToArkadeSwapRequest,
  ): Promise<BtcToArkadeSwapResponse> {
    return await this.wasmClient.createBitcoinToArkadeSwap(
      request.target_arkade_address,
      BigInt(request.sats_receive),
      request.referral_code,
    );
  }

  /**
   * Create an on-chain Bitcoin to EVM swap.
   *
   * User sends on-chain BTC to a Taproot HTLC address, and receives tokens
   * on the target EVM chain (e.g., USDC on Polygon).
   *
   * @param request - The swap request parameters
   * @param targetNetwork - Target EVM network ("polygon" or "ethereum")
   * @returns The created swap response with Taproot address to fund
   */
  async createOnchainToEvmSwap(
    request: OnchainToEvmSwapRequest,
    targetNetwork: "ethereum" | "polygon",
  ): Promise<OnchainToEvmSwapResponse> {
    return await this.wasmClient.createOnchainToEvmSwap(
      request.target_address,
      request.source_amount,
      request.target_token,
      targetNetwork,
      request.referral_code,
    );
  }

  /**
   * Claim the Arkade VHTLC for a BTC-to-Arkade swap.
   *
   * This reveals the preimage/secret to claim funds on Arkade.
   *
   * @param swapId - The swap ID
   * @returns The Arkade claim transaction ID
   */
  async claimBtcToArkadeVhtlc(swapId: string): Promise<string> {
    return await this.wasmClient.claimBtcToArkadeVhtlc(swapId);
  }

  /**
   * Refund from the on-chain Bitcoin HTLC after timeout.
   *
   * This spends from the P2WSH HTLC back to the user's address.
   *
   * @param swapId - The swap ID
   * @param refundAddress - The Bitcoin address to receive the refund
   * @returns The refund transaction ID
   */
  async refundOnchainHtlc(
    swapId: string,
    refundAddress: string,
  ): Promise<string> {
    return await this.wasmClient.refundOnchainHtlc(swapId, refundAddress);
  }
}

/**
 * Log level type for SDK logging configuration.
 */
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

/**
 * Set the SDK log level.
 *
 * This configures the log level for all Rust/WASM code in the SDK.
 * The level is persisted in localStorage under key "lendaswap_log_level",
 * so it will be used on page reload.
 *
 * @param level - Log level: "trace", "debug", "info", "warn", "error"
 *
 * @example
 * ```typescript
 * import { setLogLevel } from '@lendasat/lendaswap-sdk';
 *
 * // Enable debug logging
 * setLogLevel('debug');
 *
 * // Or set via localStorage directly (for debugging in browser console)
 * localStorage.setItem('lendaswap_log_level', 'debug');
 * // Then reload the page
 * ```
 */
export function setLogLevel(level: LogLevel): void {
  wasmSetLogLevel(level);
}

/**
 * Get the current SDK log level.
 *
 * @returns Current log level
 */
export function getLogLevel(): LogLevel {
  return wasmGetLogLevel() as LogLevel;
}
