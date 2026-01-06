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
  type BtcToEvmSwapResponse,
  type CreateVtxoSwapResult,
  type EstimateVtxoSwapResponse,
  type EvmToBtcSwapResponse,
  type ExtendedSwapStorageData as WasmExtendedSwapStorageData,
  type ExtendedVtxoSwapStorageData,
  JsSwapStorageProvider,
  JsVtxoSwapStorageProvider,
  JsWalletStorageProvider,
  type QuoteResponse,
  type SwapParams,
  type TokenInfo,
  type Version,
  type VhtlcAmounts,
  type VtxoSwapResponse,
  Client as WasmClient,
  getLogLevel as wasmGetLogLevel,
  setLogLevel as wasmSetLogLevel,
} from "../wasm/lendaswap_wasm_sdk.js";

// Re-export WASM types directly
export {
  AssetPair,
  BtcToEvmSwapResponse,
  Chain,
  CreateVtxoSwapResult,
  EstimateVtxoSwapResponse,
  EvmToBtcSwapResponse,
  ExtendedSwapStorageData as ExtendedSwapStorageDataWasm,
  ExtendedVtxoSwapStorageData,
  Network,
  QuoteResponse,
  SwapParams as VtxoSwapParams,
  SwapStatus,
  swapStatusToString,
  SwapType,
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
  const response = wasmSwap.btcToEvmResponse ?? wasmSwap.evmToBtcResponse;
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
export type GetSwapResponse = BtcToEvmSwapResponse | EvmToBtcSwapResponse;

/**
 * Extended swap storage data combining the API response with client-side swap parameters.
 * Used for storage providers and as a common interface for swap data.
 */
export interface ExtendedSwapStorageData {
  response: BtcToEvmSwapResponse | EvmToBtcSwapResponse;
  swap_params: SwapParams;
}

/**
 * Request to create an Arkade to EVM swap (BTC → Token).
 */
export interface SwapRequest {
  target_address: string;
  target_amount: number;
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
 * Typed storage provider interface for wallet data (mnemonic, key index).
 * Provides typed async methods for wallet credential storage.
 */
export interface WalletStorageProvider {
  /** Get the mnemonic phrase. Returns null if not stored. */
  getMnemonic: () => Promise<string | null>;
  /** Store the mnemonic phrase. Overwrites any existing mnemonic. */
  setMnemonic: (mnemonic: string) => Promise<void>;
  /** Get the current key derivation index. Returns 0 if not set. */
  getKeyIndex: () => Promise<number>;
  /** Set the key derivation index. */
  setKeyIndex: (index: number) => Promise<void>;
}

/**
 * Typed storage provider interface for swap data.
 * Storage receives plain objects from serde serialization.
 */
export interface SwapStorageProvider {
  /** Get swap data by swap ID. Returns null if not found. */
  get: (swapId: string) => Promise<ExtendedSwapStorageData | null>;
  /** Store swap data. Overwrites any existing swap with the same ID. */
  store: (swapId: string, data: ExtendedSwapStorageData) => Promise<void>;
  /** Delete swap data by swap ID. */
  delete: (swapId: string) => Promise<void>;
  /** List all stored swap IDs. */
  list: () => Promise<string[]>;
  /** List all stored swaps. */
  getAll: () => Promise<ExtendedSwapStorageData[]>;
}

/**
 * Typed storage provider interface for VTXO swap data.
 * Storage receives plain objects matching ExtendedVtxoSwapStorageData structure.
 */
export interface VtxoSwapStorageProvider {
  /** Get VTXO swap data by swap ID. Returns null if not found. */
  get: (swapId: string) => Promise<ExtendedVtxoSwapStorageData | null>;
  /** Store VTXO swap data. Overwrites any existing swap with the same ID. */
  store: (swapId: string, data: ExtendedVtxoSwapStorageData) => Promise<void>;
  /** Delete VTXO swap data by swap ID. */
  delete: (swapId: string) => Promise<void>;
  /** List all stored VTXO swap IDs. */
  list: () => Promise<string[]>;
  /** List all stored VTXO swaps. */
  getAll: () => Promise<ExtendedVtxoSwapStorageData[]>;
}

/**
 * Network input type for Bitcoin networks (string union for API convenience).
 */
export type NetworkInput = "bitcoin" | "testnet" | "regtest" | "mutinynet";

/**
 * Extended swap storage provider with repair capabilities.
 */
export interface ExtendedSwapStorageProvider extends SwapStorageProvider {
  /** Get raw swap_params for a potentially corrupted entry. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRawSwapParams?: (swapId: string) => Promise<Record<string, any> | null>;
}

export class Client {
  private client: WasmClient;
  private baseUrl: string;
  private swapStorage: ExtendedSwapStorageProvider;

  private constructor(
    client: WasmClient,
    baseUrl: string,
    swapStorage: ExtendedSwapStorageProvider,
  ) {
    this.client = client;
    this.baseUrl = baseUrl;
    this.swapStorage = swapStorage;
  }

  /**
   * Create a new Client instance.
   *
   * @param baseUrl - The base URL of the Lendaswap API
   * @param walletStorage - Storage provider for persisting wallet data (mnemonic, key index)
   * @param swapStorage - Storage provider for persisting swap data (uses Dexie/IndexedDB)
   * @param vtxoSwapStorage - Storage provider for persisting VTXO swap data (uses Dexie/IndexedDB)
   * @param network - Bitcoin network ("bitcoin", "testnet", "regtest", "mutinynet")
   * @param arkadeUrl - Arkade's server url
   * @returns A new Client instance
   *
   * @example
   * ```typescript
   * import {
   *   Client,
   *   createDexieWalletStorage,
   *   createDexieSwapStorage,
   *   createDexieVtxoSwapStorage
   * } from '@lendasat/lendaswap-sdk';
   *
   * const walletStorage = createDexieWalletStorage();
   * const swapStorage = createDexieSwapStorage();
   * const vtxoSwapStorage = createDexieVtxoSwapStorage();
   *
   * const client = await Client.create(
   *   'https://apilendaswap.lendasat.com',
   *   walletStorage,
   *   swapStorage,
   *   vtxoSwapStorage,
   *   'bitcoin',
   *   'https://arkade.computer'
   * );
   * ```
   */
  static async create(
    baseUrl: string,
    walletStorage: WalletStorageProvider,
    swapStorage: ExtendedSwapStorageProvider,
    vtxoSwapStorage: VtxoSwapStorageProvider,
    network: NetworkInput,
    arkadeUrl: string,
  ): Promise<Client> {
    // Bind wallet storage methods to preserve 'this' context when called from WASM
    const jsWalletStorageProvider = new JsWalletStorageProvider(
      walletStorage.getMnemonic.bind(walletStorage),
      walletStorage.setMnemonic.bind(walletStorage),
      walletStorage.getKeyIndex.bind(walletStorage),
      walletStorage.setKeyIndex.bind(walletStorage),
    );
    // Bind swap storage methods to preserve 'this' context when called from WASM
    const jsSwapStorageProvider = new JsSwapStorageProvider(
      swapStorage.get.bind(swapStorage),
      swapStorage.store.bind(swapStorage),
      swapStorage.delete.bind(swapStorage),
      swapStorage.list.bind(swapStorage),
      swapStorage.getAll.bind(swapStorage),
    );
    // Bind VTXO swap storage methods to preserve 'this' context when called from WASM
    const jsVtxoSwapStorageProvider = new JsVtxoSwapStorageProvider(
      vtxoSwapStorage.get.bind(vtxoSwapStorage),
      vtxoSwapStorage.store.bind(vtxoSwapStorage),
      vtxoSwapStorage.delete.bind(vtxoSwapStorage),
      vtxoSwapStorage.list.bind(vtxoSwapStorage),
      vtxoSwapStorage.getAll.bind(vtxoSwapStorage),
    );
    const wasmClient = new WasmClient(
      baseUrl,
      jsWalletStorageProvider,
      jsSwapStorageProvider,
      jsVtxoSwapStorageProvider,
      network,
      arkadeUrl,
    );

    return new Client(wasmClient, baseUrl, swapStorage);
  }

  async init(mnemonic?: string): Promise<void> {
    await this.client.init(mnemonic);
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
    return await this.client.createArkadeToEvmSwap(
      request.target_address,
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
    return await this.client.createEvmToArkadeSwap(
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
    return await this.client.createEvmToLightningSwap(
      request.bolt11_invoice,
      request.user_address,
      request.source_token,
      sourceNetwork,
      request.referral_code,
    );
  }

  async getAssetPairs(): Promise<AssetPair[]> {
    return await this.client.getAssetPairs();
  }

  async getTokens(): Promise<TokenInfo[]> {
    return await this.client.getTokens();
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
    return await this.client.getQuote(from, to, baseAmount);
  }

  /**
   * Get a swap by its ID.
   *
   * @param id - The swap ID
   * @returns The swap data, or undefined if the swap type is unknown
   */
  async getSwap(id: string): Promise<ExtendedSwapStorageData | undefined> {
    return mapWasmSwapToInterface(await this.client.getSwap(id));
  }

  /**
   * Gets all stored swaps.
   *
   * @returns Array of swaps (unknown types are filtered out)
   */
  async listAllSwaps(): Promise<ExtendedSwapStorageData[]> {
    const wasmSwaps = await this.client.listAll();
    return wasmSwaps.map(mapWasmSwapToInterface).filter((s) => s !== undefined);
  }

  /**
   * Claim a swap via Gelato relay (gasless).
   *
   * @param swapId - The swap ID
   * @param secret - The preimage secret (hex-encoded)
   */
  async claimGelato(swapId: string, secret?: string): Promise<void> {
    await this.client.claimGelato(swapId, secret);
  }

  /**
   * Get the VHTLC amounts associated with a swap.
   *
   * @param swapId - The swap ID
   * @returns VhtlcAmounts
   */
  async amountsForSwap(swapId: string): Promise<VhtlcAmounts> {
    return await this.client.amountsForSwap(swapId);
  }

  /**
   * Claim a swap VHTLC
   *
   * @param swapId - The swap ID
   */
  async claimVhtlc(swapId: string): Promise<void> {
    await this.client.claimVhtlc(swapId);
  }

  /**
   * Claim a swap VHTLC
   *
   * @param swapId - The swap ID
   * @returns The TXID of the Ark transaction which refunded the VHTLC.
   */
  async refundVhtlc(swapId: string, refundAddress: string): Promise<string> {
    return await this.client.refundVhtlc(swapId, refundAddress);
  }

  /**
   * Get the API version.
   *
   * @returns Version information
   */
  async getVersion(): Promise<Version> {
    return await this.client.getVersion();
  }

  /**
   * Recover swaps for the currently loaded mnemonic.
   *
   * @returns Array of recovered swaps (unknown types are filtered out)
   */
  async recoverSwaps(): Promise<ExtendedSwapStorageData[]> {
    const wasmSwaps = await this.client.recoverSwaps();
    return wasmSwaps.map(mapWasmSwapToInterface).filter((s) => s !== undefined);
  }

  /**
   * Get current loaded mnemonic
   * @returns The mnemonic as string
   */
  async getMnemonic(): Promise<string> {
    return await this.client.getMnemonic();
  }
  /**
   * Get current loaded user id xpub
   * @returns The xpub as string
   */
  async getUserIdXpub(): Promise<string> {
    return await this.client.getUserIdXpub();
  }

  /**
   * Deletes all stored swaps
   */
  async clearSwapStorage(): Promise<void> {
    return await this.client.clearSwapStorage();
  }

  /**
   * Delete one particular swap by id
   */
  async deleteSwap(id: string): Promise<void> {
    return await this.client.deleteSwap(id);
  }

  /**
   * Get the list of swap IDs that failed to deserialize during the last listAllSwaps() call.
   * These are "corrupted" entries that couldn't be loaded due to invalid or missing data.
   *
   * @returns Array of swap IDs that failed to load
   */
  getCorruptedSwapIds(): string[] {
    return this.client.getCorruptedSwapIds();
  }

  /**
   * Delete all corrupted swap entries from storage.
   * Call this after listAllSwaps() to clean up entries that couldn't be deserialized.
   *
   * @returns The number of corrupted entries that were deleted
   */
  async deleteCorruptedSwaps(): Promise<number> {
    return await this.client.deleteCorruptedSwaps();
  }

  /**
   * Attempt to repair corrupted swap entries by fetching missing data from the server.
   *
   * For each corrupted swap ID:
   * 1. Reads the raw swap_params from local storage
   * 2. Fetches the swap response from the server via GET /swap/:id
   * 3. Combines them and stores the repaired entry
   *
   * @returns Object with repaired count and any failed IDs
   */
  async repairCorruptedSwaps(): Promise<{
    repaired: number;
    failed: string[];
  }> {
    const corruptedIds = this.getCorruptedSwapIds();
    if (corruptedIds.length === 0) {
      return { repaired: 0, failed: [] };
    }

    // Check if storage provider supports raw access
    if (!this.swapStorage.getRawSwapParams) {
      console.warn(
        "Storage provider does not support getRawSwapParams - cannot repair corrupted entries",
      );
      return { repaired: 0, failed: corruptedIds };
    }

    const failed: string[] = [];
    let repaired = 0;

    for (const swapId of corruptedIds) {
      try {
        // Get raw swap_params from storage
        const swapParams = await this.swapStorage.getRawSwapParams(swapId);
        if (!swapParams) {
          console.warn(`No swap_params found for corrupted swap ${swapId}`);
          failed.push(swapId);
          continue;
        }

        // Fetch response from server
        const response = await fetch(`${this.baseUrl}/swap/${swapId}`);
        if (!response.ok) {
          console.warn(
            `Failed to fetch swap ${swapId} from server: ${response.status}`,
          );
          failed.push(swapId);
          continue;
        }

        const serverResponse = await response.json();

        // Combine and store
        const repairedData: ExtendedSwapStorageData = {
          response: serverResponse,
          swap_params: swapParams as unknown as SwapParams,
        };

        await this.swapStorage.store(swapId, repairedData);
        repaired++;
        console.log(`Repaired swap ${swapId}`);
      } catch (error) {
        console.error(`Error repairing swap ${swapId}:`, error);
        failed.push(swapId);
      }
    }

    return { repaired, failed };
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
    return await this.client.estimateVtxoSwap(vtxos);
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
    return await this.client.createVtxoSwap(vtxos);
  }

  /**
   * Get VTXO swap details by ID.
   *
   * @param id - The swap ID
   * @returns The extended VTXO swap data
   */
  async getVtxoSwap(id: string): Promise<ExtendedVtxoSwapStorageData> {
    return await this.client.getVtxoSwap(id);
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
    return await this.client.claimVtxoSwap(swap, swapParams, claimAddress);
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
    return await this.client.refundVtxoSwap(swapId, refundAddress);
  }

  /**
   * List all VTXO swaps from local storage.
   *
   * Returns all stored VTXO swaps without fetching from the API.
   *
   * @returns Array of all stored extended VTXO swap data
   */
  async listAllVtxoSwaps(): Promise<ExtendedVtxoSwapStorageData[]> {
    return await this.client.listAllVtxoSwaps();
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
