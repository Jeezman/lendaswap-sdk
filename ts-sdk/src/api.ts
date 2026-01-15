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
  type QuoteResponse,
  setLogLevel as wasmSetLogLevel,
  type SwapParams,
  type TokenInfo,
  type Version,
  type VhtlcAmounts,
  type VtxoSwapResponse,
} from "../wasm/lendaswap_wasm_sdk.js";

// Import native client types (declaration only)
import type { Client as NativeClient } from "@lendasat/lendaswap-sdk-native";

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
    wasmSwap.btcToArkadeResponse;
  if (!response) {
    return undefined;
  }
  return {
    response,
    swap_params: wasmSwap.swapParams,
  };
}

// Import native types for the mapper function
import type { ExtendedSwapStorageData as NativeExtendedSwapStorageData } from "@lendasat/lendaswap-sdk-native";

/**
 * Convert Native ExtendedSwapStorageData to plain TypeScript interface.
 * Returns undefined if the swap response type is unknown.
 */
function mapNativeSwapToInterface(
  nativeSwap: NativeExtendedSwapStorageData,
): ExtendedSwapStorageData | undefined {
  const response =
    nativeSwap.btcToEvmResponse ??
    nativeSwap.evmToBtcResponse ??
    nativeSwap.btcToArkadeResponse;
  if (!response) {
    return undefined;
  }
  // Cast to the expected types - the data structure is compatible
  return {
    response: response as unknown as
      | BtcToEvmSwapResponse
      | EvmToBtcSwapResponse
      | BtcToArkadeSwapResponse,
    swap_params: {} as SwapParams, // Native doesn't include swap_params in the response
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
  | BtcToArkadeSwapResponse;

/**
 * Extended swap storage data combining the API response with client-side swap parameters.
 * Used for storage providers and as a common interface for swap data.
 */
export interface ExtendedSwapStorageData {
  response:
    | BtcToEvmSwapResponse
    | EvmToBtcSwapResponse
    | BtcToArkadeSwapResponse;
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
 * Storage configuration type for the builder.
 */
type StorageConfig =
  | { type: "idb"; storage: IdbStorageHandle }
  | { type: "sqlite"; path: string };

/**
 * Builder for constructing a Client with a fluent API.
 *
 * Supports two storage backends:
 * - **IndexedDB** (browser): Use `.withIdbStorage()` for browser applications
 * - **SQLite** (Node.js): Use `.withSqliteStorage(path)` for server-side applications
 *
 * @example Browser usage:
 * ```typescript
 * import { Client, openIdbDatabase } from '@lendasat/lendaswap-sdk';
 *
 * const client = await Client.builder()
 *   .url('https://api.lendaswap.com')
 *   .withIdbStorage()
 *   .network('bitcoin')
 *   .arkadeUrl('https://arkade.computer')
 *   .esploraUrl('https://mempool.space/api')
 *   .build();
 * ```
 *
 * @example Node.js usage:
 * ```typescript
 * import { Client } from '@lendasat/lendaswap-sdk';
 *
 * const client = await Client.builder()
 *   .url('https://api.lendaswap.com')
 *   .withSqliteStorage('./lendaswap.db')
 *   .network('bitcoin')
 *   .arkadeUrl('https://arkade.computer')
 *   .esploraUrl('https://mempool.space/api')
 *   .build();
 * ```
 */
export class ClientBuilder {
  private _url?: string;
  private _storage?: StorageConfig;
  private _network?: NetworkInput;
  private _arkadeUrl?: string;
  private _esploraUrl?: string;

  constructor() {}

  /**
   * Set the Lendaswap API URL.
   */
  url(url: string): this {
    this._url = url;
    return this;
  }

  /**
   * Use IndexedDB storage (browser only).
   *
   * This will automatically open the IndexedDB database when `build()` is called.
   *
   * @throws Error if not running in a browser environment
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
    // Check for browser environment
    if (typeof window === "undefined" && typeof indexedDB === "undefined") {
      throw new Error(
        "IndexedDB storage is only available in browser environments. " +
          "Use .withSqliteStorage(path) for Node.js.",
      );
    }
    // We'll open the database in build() - for now just mark the type
    this._storage = {
      type: "idb",
      storage: undefined as unknown as IdbStorageHandle,
    };
    return this;
  }

  /**
   * Use SQLite storage (Node.js only).
   *
   * @param path - Path to SQLite database file (will be created if it doesn't exist)
   * @throws Error if running in a browser environment
   *
   * @example
   * ```typescript
   * const client = await Client.builder()
   *   .url('https://api.lendaswap.com')
   *   .withSqliteStorage('./lendaswap.db')
   *   .network('bitcoin')
   *   .arkadeUrl('...')
   *   .esploraUrl('...')
   *   .build();
   * ```
   */
  withSqliteStorage(path: string): this {
    // Check for Node.js environment
    if (typeof window !== "undefined") {
      throw new Error(
        "SQLite storage is not available in browser environments. " +
          "Use .withIdbStorage() for browser.",
      );
    }
    this._storage = { type: "sqlite", path };
    return this;
  }

  /**
   * Set the storage handle directly (for advanced use cases).
   * @deprecated Use `.withIdbStorage()` or `.withSqliteStorage(path)` instead.
   */
  storage(storage: IdbStorageHandle): this {
    this._storage = { type: "idb", storage };
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
   * Build the client asynchronously.
   *
   * @returns A Promise that resolves to a new Client instance
   * @throws Error if any required field is missing or storage initialization fails
   */
  async build(): Promise<Client> {
    if (!this._url) {
      throw new Error("url is required - call .url(url)");
    }
    if (!this._storage) {
      throw new Error(
        "storage is required - call .withIdbStorage() for browser or .withSqliteStorage(path) for Node.js",
      );
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

    if (this._storage.type === "idb") {
      // Browser path - use WASM SDK with IndexedDB
      const { openIdbDatabase } = await import("../wasm/lendaswap_wasm_sdk.js");

      // If storage handle wasn't provided directly, open it now
      let storageHandle = this._storage.storage;
      if (
        !storageHandle ||
        storageHandle === (undefined as unknown as IdbStorageHandle)
      ) {
        storageHandle = await openIdbDatabase();
      }

      const wasmBuilder = new WasmClientBuilder();
      const wasmClient = wasmBuilder
        .url(this._url)
        .storage(storageHandle)
        .network(this._network)
        .arkadeUrl(this._arkadeUrl)
        .esploraUrl(this._esploraUrl)
        .build();

      return Client.fromWasmClient(wasmClient);
    } else {
      // Node.js path - use native addon with SQLite
      try {
        // Dynamic import of the native addon
        // This will be available when @lendasat/lendaswap-sdk-native is installed
        // Using variable to prevent Vite from statically analyzing this Node.js-only import
        const nativeModule = "@lendasat/lendaswap-sdk-native";
        const native = await import(/* @vite-ignore */ nativeModule);
        const storage = native.SqliteStorageHandle.open(this._storage.path);
        const nativeClient = new native.Client(
          storage,
          this._url,
          this._network,
          this._arkadeUrl,
          this._esploraUrl,
        );
        return Client.fromNativeClient(nativeClient);
      } catch (e) {
        const error = e as Error;
        throw new Error(
          `SQLite storage failed to initialize: ${error.message}\n` +
            "Make sure the native addon (@lendasat/lendaswap-sdk-native) is installed for your platform.\n" +
            "Run: npm install @lendasat/lendaswap-sdk-native",
        );
      }
    }
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
/**
 * Internal client type - either WASM (browser) or Native (Node.js).
 */
type InternalClient =
  | { type: "wasm"; client: WasmClient }
  | { type: "native"; client: NativeClient };

export class Client {
  private internal: InternalClient;

  private constructor(internal: InternalClient) {
    this.internal = internal;
  }

  /**
   * Get the WASM client (throws if using native backend).
   */
  private getWasmClient(): WasmClient {
    if (this.internal.type !== "wasm") {
      throw new Error("This method requires WASM backend");
    }
    return this.internal.client;
  }

  /**
   * Get the native client (throws if using WASM backend).
   */
  private getNativeClient(): NativeClient {
    if (this.internal.type !== "native") {
      throw new Error("This method requires native backend");
    }
    return this.internal.client;
  }

  /**
   * Check if using native backend.
   */
  private isNative(): boolean {
    return this.internal.type === "native";
  }

  /**
   * Create a new ClientBuilder for constructing a client.
   *
   * @example
   * ```typescript
   * const client = Client.builder()
   *   .url('https://api.lendaswap.com')
   *   .storage(storage)
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
    return new Client({ type: "wasm", client: wasmClient });
  }

  /**
   * Create a Client from a native client instance (Node.js with SQLite).
   * Used internally by ClientBuilder.
   */
  static fromNativeClient(nativeClient: NativeClient): Client {
    return new Client({ type: "native", client: nativeClient });
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
    if (this.internal.type === "native") {
      await this.internal.client.init(mnemonic);
    } else {
      await this.internal.client.init(mnemonic);
    }
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
    if (this.isNative()) {
      return (await this.getNativeClient().createArkadeToEvmSwap(
        request.target_address,
        request.source_amount ? Number(request.source_amount) : null,
        request.target_amount ?? null,
        request.target_token,
        targetNetwork,
        request.referral_code,
      )) as unknown as BtcToEvmSwapResponse;
    }
    return await this.getWasmClient().createArkadeToEvmSwap(
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

    if (this.isNative()) {
      return (await this.getNativeClient().createLightningToEvmSwap(
        request.target_address,
        request.source_amount ? Number(request.source_amount) : null,
        request.target_amount ?? null,
        request.target_token,
        targetNetwork,
        request.referral_code,
      )) as unknown as BtcToEvmSwapResponse;
    }
    return await this.getWasmClient().createLightningToEvmSwap(
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
    if (this.isNative()) {
      return (await this.getNativeClient().createEvmToArkadeSwap(
        request.target_address,
        request.user_address,
        request.source_amount,
        request.source_token,
        sourceNetwork,
        request.referral_code,
      )) as unknown as EvmToBtcSwapResponse;
    }
    return await this.getWasmClient().createEvmToArkadeSwap(
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
    if (this.isNative()) {
      return (await this.getNativeClient().createEvmToLightningSwap(
        request.bolt11_invoice,
        request.user_address,
        request.source_token,
        sourceNetwork,
        request.referral_code,
      )) as unknown as EvmToBtcSwapResponse;
    }
    return await this.getWasmClient().createEvmToLightningSwap(
      request.bolt11_invoice,
      request.user_address,
      request.source_token,
      sourceNetwork,
      request.referral_code,
    );
  }

  async getAssetPairs(): Promise<AssetPair[]> {
    if (this.isNative()) {
      // Native returns compatible data structure, cast for type compatibility
      return (await this.getNativeClient().getAssetPairs()) as unknown as AssetPair[];
    }
    return await this.getWasmClient().getAssetPairs();
  }

  async getTokens(): Promise<TokenInfo[]> {
    if (this.isNative()) {
      // Native returns compatible data structure, cast for type compatibility
      return (await this.getNativeClient().getTokens()) as unknown as TokenInfo[];
    }
    return await this.getWasmClient().getTokens();
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
    if (this.isNative()) {
      return (await this.getNativeClient().getQuote(
        from,
        to,
        Number(baseAmount),
      )) as unknown as QuoteResponse;
    }
    return await this.getWasmClient().getQuote(from, to, baseAmount);
  }

  /**
   * Get a swap by its ID.
   *
   * @param id - The swap ID
   * @returns The swap data, or undefined if the swap type is unknown
   */
  async getSwap(id: string): Promise<ExtendedSwapStorageData | undefined> {
    if (this.isNative()) {
      const nativeSwap = await this.getNativeClient().getSwap(id);
      return mapNativeSwapToInterface(nativeSwap);
    }
    return mapWasmSwapToInterface(await this.getWasmClient().getSwap(id));
  }

  /**
   * Gets all stored swaps.
   *
   * @returns Array of swaps (unknown types are filtered out)
   */
  async listAllSwaps(): Promise<ExtendedSwapStorageData[]> {
    if (this.isNative()) {
      const nativeSwaps = await this.getNativeClient().listAll();
      return nativeSwaps
        .map(mapNativeSwapToInterface)
        .filter((s) => s !== undefined);
    }
    const wasmSwaps = await this.getWasmClient().listAll();
    return wasmSwaps.map(mapWasmSwapToInterface).filter((s) => s !== undefined);
  }

  /**
   * Claim a swap via Gelato relay (gasless).
   *
   * @param swapId - The swap ID
   * @param secret - The preimage secret (hex-encoded)
   */
  async claimGelato(swapId: string, secret?: string): Promise<void> {
    if (this.isNative()) {
      await this.getNativeClient().claimGelato(swapId, secret);
      return;
    }
    await this.getWasmClient().claimGelato(swapId, secret);
  }

  /**
   * Get the VHTLC amounts associated with a swap.
   *
   * @param swapId - The swap ID
   * @returns VhtlcAmounts
   */
  async amountsForSwap(swapId: string): Promise<VhtlcAmounts> {
    return await this.getWasmClient().amountsForSwap(swapId);
  }

  /**
   * Claim a swap VHTLC
   *
   * @param swapId - The swap ID
   */
  async claimVhtlc(swapId: string): Promise<void> {
    if (this.isNative()) {
      await this.getNativeClient().claimVhtlc(swapId);
      return;
    }
    await this.getWasmClient().claimVhtlc(swapId);
  }

  /**
   * Claim a swap VHTLC
   *
   * @param swapId - The swap ID
   * @param refundAddress - The address to receive the refund
   * @returns The TXID of the Ark transaction which refunded the VHTLC.
   */
  async refundVhtlc(swapId: string, refundAddress: string): Promise<string> {
    if (this.isNative()) {
      return await this.getNativeClient().refundVhtlc(swapId, refundAddress);
    }
    return await this.getWasmClient().refundVhtlc(swapId, refundAddress);
  }

  /**
   * Get the API version.
   *
   * @returns Version information
   */
  async getVersion(): Promise<Version> {
    if (this.isNative()) {
      return (await this.getNativeClient().getVersion()) as unknown as Version;
    }
    return await this.getWasmClient().getVersion();
  }

  /**
   * Recover swaps for the currently loaded mnemonic.
   *
   * @returns Array of recovered swaps (unknown types are filtered out)
   */
  async recoverSwaps(): Promise<ExtendedSwapStorageData[]> {
    if (this.isNative()) {
      const nativeSwaps = await this.getNativeClient().recoverSwaps();
      return nativeSwaps
        .map(mapNativeSwapToInterface)
        .filter((s) => s !== undefined);
    }
    const wasmSwaps = await this.getWasmClient().recoverSwaps();
    return wasmSwaps.map(mapWasmSwapToInterface).filter((s) => s !== undefined);
  }

  /**
   * Get current loaded mnemonic
   * @returns The mnemonic as string
   */
  async getMnemonic(): Promise<string> {
    if (this.internal.type === "native") {
      return await this.internal.client.getMnemonic();
    }
    return await this.internal.client.getMnemonic();
  }
  /**
   * Get current loaded user id xpub
   * @returns The xpub as string
   */
  async getUserIdXpub(): Promise<string> {
    if (this.internal.type === "native") {
      return await this.internal.client.getUserIdXpub();
    }
    return await this.internal.client.getUserIdXpub();
  }

  /**
   * Deletes all stored swaps
   */
  async clearSwapStorage(): Promise<void> {
    if (this.isNative()) {
      await this.getNativeClient().clearSwapStorage();
      return;
    }
    await this.getWasmClient().clearSwapStorage();
  }

  /**
   * Delete one particular swap by id
   */
  async deleteSwap(id: string): Promise<void> {
    if (this.isNative()) {
      await this.getNativeClient().deleteSwap(id);
      return;
    }
    await this.getWasmClient().deleteSwap(id);
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
    return await this.getWasmClient().estimateVtxoSwap(vtxos);
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
    return await this.getWasmClient().createVtxoSwap(vtxos);
  }

  /**
   * Get VTXO swap details by ID.
   *
   * @param id - The swap ID
   * @returns The extended VTXO swap data
   */
  async getVtxoSwap(id: string): Promise<ExtendedVtxoSwapStorageData> {
    return await this.getWasmClient().getVtxoSwap(id);
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
    return await this.getWasmClient().claimVtxoSwap(
      swap,
      swapParams,
      claimAddress,
    );
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
    return await this.getWasmClient().refundVtxoSwap(swapId, refundAddress);
  }

  /**
   * List all VTXO swaps from local storage.
   *
   * Returns all stored VTXO swaps without fetching from the API.
   *
   * @returns Array of all stored extended VTXO swap data
   */
  async listAllVtxoSwaps(): Promise<ExtendedVtxoSwapStorageData[]> {
    return await this.getWasmClient().listAllVtxoSwaps();
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
    if (this.isNative()) {
      return (await this.getNativeClient().createBitcoinToArkadeSwap(
        request.target_arkade_address,
        request.sats_receive,
        request.referral_code,
      )) as unknown as BtcToArkadeSwapResponse;
    }
    return await this.getWasmClient().createBitcoinToArkadeSwap(
      request.target_arkade_address,
      BigInt(request.sats_receive),
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
    if (this.isNative()) {
      return await this.getNativeClient().claimBtcToArkadeVhtlc(swapId);
    }
    return await this.getWasmClient().claimBtcToArkadeVhtlc(swapId);
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
    if (this.isNative()) {
      return await this.getNativeClient().refundOnchainHtlc(
        swapId,
        refundAddress,
      );
    }
    return await this.getWasmClient().refundOnchainHtlc(swapId, refundAddress);
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
