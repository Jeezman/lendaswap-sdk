import {
  type ApiClient,
  type ArkadeToEvmSwapResponse,
  type BtcToArkadeSwapResponse,
  type BtcToEvmSwapResponse,
  type Chain,
  createApiClient,
  type EvmToArkadeSwapResponse,
  type EvmToBitcoinSwapResponse,
  type EvmToBtcSwapResponse,
  type GetSwapResponse,
  type LightningToEvmSwapResponse,
  type QuoteResponse,
  type TokenInfos,
} from "./api/client.js";
import { getVhtlcAmounts, type VhtlcAmounts } from "./arkade.js";
import {
  type ArkadeToEvmSwapOptions,
  type ArkadeToEvmSwapResult,
  type BitcoinToArkadeSwapOptions,
  type BitcoinToArkadeSwapResult,
  type BitcoinToEvmSwapOptions,
  type BitcoinToEvmSwapResult,
  type BtcToEvmSwapOptions,
  type BtcToEvmSwapResult,
  type CreateSwapContext,
  createArkadeToEvmSwapGeneric,
  createBitcoinToArkadeSwap,
  createBitcoinToEvmSwap,
  createEvmToArkadeSwapGeneric,
  createEvmToBitcoinSwap,
  createEvmToLightningSwap,
  createLightningToEvmSwap,
  createLightningToEvmSwapGeneric,
  type LightningToEvmSwapGenericOptions,
  type LightningToEvmSwapGenericResult,
  type EvmToArkadeSwapGenericOptions,
  type EvmToArkadeSwapGenericResult,
  type EvmToArkadeSwapOptions,
  type EvmToArkadeSwapResult,
  type EvmToBitcoinSwapOptions,
  type EvmToBitcoinSwapResult,
  type EvmToLightningSwapOptions,
  type EvmToLightningSwapResult,
} from "./create";
import { broadcastTransaction, findOutputByAddress } from "./esplora.js";
import { encodeApproveCallData, encodeRefundSwapCallData } from "./evm";
import {
  buildArkadeClaim,
  type ClaimGaslessResult,
  type ClaimResult,
  claimViaGasless as gaslessClaim,
  claim as redeemClaim,
} from "./redeem/index.js";
import {
  type BitcoinNetwork,
  buildArkadeRefund,
  buildOnchainClaimTransaction,
  buildOnchainRefundTransaction,
  verifyHtlcAddress,
} from "./refund";
import {
  bytesToHex,
  hexToBytes,
  Signer,
  type SwapParams,
} from "./signer/index.js";
import {
  type StoredSwap,
  SWAP_STORAGE_VERSION,
  type SwapStorage,
  type WalletStorage,
} from "./storage";

// Re-export types from create module for backwards compatibility
export type {
  ArkadeToEvmSwapOptions,
  ArkadeToEvmSwapResult,
  BitcoinToArkadeSwapOptions,
  BitcoinToArkadeSwapResult,
  BitcoinToEvmSwapOptions,
  BitcoinToEvmSwapResult,
  BtcToEvmSwapOptions,
  BtcToEvmSwapResult,
  EvmChain,
  EvmToArkadeSwapGenericOptions,
  EvmToArkadeSwapGenericResult,
  EvmToArkadeSwapOptions,
  EvmToArkadeSwapResult,
  EvmToBitcoinSwapOptions,
  EvmToBitcoinSwapResult,
  EvmToLightningSwapOptions,
  EvmToLightningSwapResult,
} from "./create/index.js";
export type { BitcoinToEvmSwapResponse } from "./create/types.js";
// Re-export coordinator utilities for Arkade-to-EVM redeemAndExecute flow
export {
  buildExecuteAndCreateCalls,
  buildRedeemCalls,
  buildRedeemDigest,
  type CoordinatorCall,
  type ExecuteAndCreateCallData,
  type ExecuteAndCreateParams,
  encodeExecuteAndCreate,
  encodeRedeemAndExecute,
  encodeRefundAndExecute,
  encodeRefundTo,
  type RedeemAndExecuteCallData,
  type RedeemAndExecuteParams,
  type RedeemDigestParams,
  type RefundAndExecuteParams,
  type RefundToParams,
} from "./evm/index.js";
// Re-export types from redeem module
export type {
  ClaimGaslessResult,
  ClaimResult,
  CoordinatorClaimData,
  EthereumClaimData,
} from "./redeem/index.js";

/** Result of attempting a refund */
export interface RefundResult {
  /** Whether the refund was successful */
  success: boolean;
  /** Human-readable message about the refund status */
  message: string;
  /** Raw transaction hex (for on-chain refunds) */
  txHex?: string;
  /** Transaction ID (for on-chain refunds) */
  txId?: string;
  /** Amount being refunded in satoshis (after fees) */
  refundAmount?: bigint;
  /** Fee paid in satoshis */
  fee?: bigint;
  /** Whether the transaction was broadcast to the network */
  broadcast?: boolean;
  /** The HTLC address we computed locally (for debugging) */
  htlcAddress?: string;
  /** The HTLC address reported by the server (for debugging) */
  serverHtlcAddress?: string;
  /** EVM refund data (for evm_to_arkade and evm_to_btc swaps) */
  evmRefundData?: {
    /** Address to send the refund transaction to (coordinator or HTLC) */
    to: string;
    /** ABI-encoded calldata for the refund call */
    data: string;
    /** Whether the timelock has already expired (refund is available) */
    timelockExpired: boolean;
    /** Unix timestamp when the timelock expires */
    timelockExpiry: number;
  };
}

/** Options for on-chain refund */
export interface OnchainRefundOptions {
  /** Destination address to receive refunded BTC */
  destinationAddress: string;
  /** Fee rate in satoshis per virtual byte (default: 2) */
  feeRateSatPerVb?: number;
  /** If true, only build the transaction without broadcasting (default: false) */
  dryRun?: boolean;
}

/** Options for Arkade (off-chain) refund */
export interface ArkadeRefundOptions {
  /** Destination Arkade address to receive refunded BTC */
  destinationAddress: string;
  /** Arkade server URL (optional, uses default based on network) */
  arkadeServerUrl?: string;
}

/** General refund options — the method picks the right variant based on swap type */
export type RefundOptions = OnchainRefundOptions | ArkadeRefundOptions;

/** Options for Arkade (off-chain) claim */
export interface ArkadeClaimOptions {
  /** Destination Arkade address to receive claimed BTC */
  destinationAddress: string;
  /** Arkade server URL (optional, uses default based on network) */
  arkadeServerUrl?: string;
}

/** Options for claiming a swap */
export interface ClaimOptions {
  /**
   * @deprecated For Arkade-to-EVM swaps, the destination is now set at swap creation time
   * and stored on the server. This option is ignored for arkade_to_evm swaps.
   */
  destination?: string;
  /** Bitcoin destination address for EVM-to-Bitcoin claims (required for evm_to_bitcoin direction) */
  destinationAddress?: string;
  /** Fee rate in sat/vB for on-chain Bitcoin claims (default: 2) */
  feeRateSatPerVb?: number;
}

/** Result of getting EVM funding call data */
export interface EvmFundingCallData {
  /** Call data for approving token spend (ERC20 approve) */
  approve: {
    /** Token contract address to call */
    to: string;
    /** Encoded approve(spender, amount) call data */
    data: string;
  };
  /** Call data for creating the swap (from server) */
  createSwap: {
    /** HTLC contract address to call */
    to: string;
    /** Encoded createSwap call data (from server) */
    data: string;
  };
}

/** Result of getting coordinator funding call data for EVM-to-BTC swaps */
export interface CoordinatorFundingCallData {
  /** Call data for approving source token spend to the coordinator */
  approve: {
    /** Source token contract address to call */
    to: string;
    /** Encoded approve(coordinator, amount) call data */
    data: string;
  };
  /** Call data for executeAndCreate on the coordinator */
  executeAndCreate: {
    /** Coordinator contract address to call */
    to: string;
    /** Encoded executeAndCreate call data */
    data: string;
  };
}

/** Result of getting coordinator refund call data */
export interface CoordinatorRefundCallData {
  /** Contract address to call */
  to: string;
  /** Encoded refund call data */
  data: string;
  /** Whether the timelock has expired (refund is possible) */
  timelockExpired: boolean;
  /** Unix timestamp when the timelock expires */
  timelockExpiry: number;
  /** Refund mode used */
  mode: "swap-back" | "direct";
}

const DEFAULT_BASE_URL = "https://apilendaswap.lendasat.com/";

/** Default Esplora URLs by network */
const DEFAULT_ESPLORA_URLS: Record<string, string> = {
  mainnet: "https://mempool.space/api",
  signet: "https://mutinynet.com/api",
};

/** Configuration options for the Lendaswap client. */
export interface ClientConfig {
  /** The base URL of the Lendaswap API. */
  baseUrl: string;
  /** Optional API key for authenticated requests. */
  apiKey?: string;
  /** Optional Esplora API URL for broadcasting Bitcoin transactions. */
  esploraUrl?: string;
  /** Optional Arkade server URL (e.g. "https://arkade.computer"). Falls back to network-based defaults. */
  arkadeServerUrl?: string;
}

/**
 * Builder for creating a Lendaswap client with a fluent API.
 *
 * The `build()` method is async and returns a fully initialized client.
 *
 * @example
 * ```ts
 * // Create client with new wallet (generates mnemonic)
 * const client = await Client.builder()
 *   .withSignerStorage(new IdbWalletStorage())
 *   .build();
 *
 * // Create client with existing mnemonic
 * const client = await Client.builder()
 *   .withSignerStorage(new IdbWalletStorage())
 *   .withMnemonic("abandon abandon abandon ...")
 *   .build();
 *
 * // Create client without storage (stateless, generates new mnemonic)
 * const client = await Client.builder().build();
 * ```
 */
export class ClientBuilder {
  #baseUrl: string = DEFAULT_BASE_URL;
  #apiKey?: string;
  #esploraUrl?: string;
  #arkadeServerUrl?: string;
  #signerStorage?: WalletStorage;
  #swapStorage?: SwapStorage;
  #mnemonic?: string;

  /**
   * Sets the base URL for the API.
   * @param baseUrl - The base URL of the Lendaswap API.
   * @returns The builder instance for chaining.
   */
  withBaseUrl(baseUrl: string): this {
    this.#baseUrl = baseUrl;
    return this;
  }

  /**
   * Sets the API key for authenticated requests.
   * @param apiKey - The API key to use for authentication.
   * @returns The builder instance for chaining.
   */
  withApiKey(apiKey: string): this {
    this.#apiKey = apiKey;
    return this;
  }

  /**
   * Sets the Esplora API URL for broadcasting Bitcoin transactions.
   *
   * If not set, defaults will be used based on the network:
   * - mainnet: https://mempool.space/api
   * - testnet: https://mempool.space/testnet/api
   * - signet: https://mempool.space/signet/api
   *
   * @param esploraUrl - The Esplora API base URL.
   * @returns The builder instance for chaining.
   */
  withEsploraUrl(esploraUrl: string): this {
    this.#esploraUrl = esploraUrl;
    return this;
  }

  /**
   * Sets the Arkade server URL for VHTLC operations (claim, refund, amounts).
   *
   * If not set, defaults are used based on the network:
   * - bitcoin: https://arkade.computer
   * - signet: wa
   *
   * @param arkadeServerUrl - The Arkade server base URL.
   * @returns The builder instance for chaining.
   */
  withArkadeServerUrl(arkadeServerUrl: string): this {
    this.#arkadeServerUrl = arkadeServerUrl;
    return this;
  }

  /**
   * Sets the storage backend for signer data (mnemonic and key index).
   * @param storage - The storage implementation to use.
   * @returns The builder instance for chaining.
   */
  withSignerStorage(storage: WalletStorage): this {
    this.#signerStorage = storage;
    return this;
  }

  /**
   * Sets the storage backend for swap data.
   *
   * When configured, swaps will be automatically persisted after creation.
   *
   * @param storage - The swap storage implementation to use.
   * @returns The builder instance for chaining.
   */
  withSwapStorage(storage: SwapStorage): this {
    this.#swapStorage = storage;
    return this;
  }

  /**
   * Sets the mnemonic phrase to use for the signer.
   *
   * If provided, this mnemonic will be used instead of loading from storage
   * or generating a new one. The mnemonic will be persisted to storage if
   * storage is configured.
   *
   * @param mnemonic - The BIP39 mnemonic phrase (12, 15, 18, 21, or 24 words).
   * @returns The builder instance for chaining.
   */
  withMnemonic(mnemonic: string): this {
    this.#mnemonic = mnemonic;
    return this;
  }

  /**
   * Builds and returns a fully initialized Client instance.
   *
   * Initialization order:
   * 1. If `withMnemonic()` was called, use that mnemonic
   * 2. Else if storage is configured and contains a mnemonic, load it
   * 3. Else generate a new mnemonic
   *
   * The mnemonic is persisted to storage if storage is configured.
   *
   * @returns A promise that resolves to a fully initialized Client.
   * @throws Error if the provided mnemonic is invalid.
   */
  async build(): Promise<Client> {
    let signer: Signer;

    if (this.#mnemonic) {
      // Use provided mnemonic
      signer = Signer.fromMnemonic(this.#mnemonic);
      if (this.#signerStorage) {
        await this.#signerStorage.setMnemonic(signer.mnemonic);
      }
    } else if (this.#signerStorage) {
      // Try to load from storage
      const storedMnemonic = await this.#signerStorage.getMnemonic();
      if (storedMnemonic) {
        signer = Signer.fromMnemonic(storedMnemonic);
      } else {
        // Generate new and persist
        signer = Signer.generate();
        await this.#signerStorage.setMnemonic(signer.mnemonic);
      }
    } else {
      // No storage, generate new (stateless mode)
      signer = Signer.generate();
    }

    return new Client(
      {
        baseUrl: this.#baseUrl,
        apiKey: this.#apiKey,
        esploraUrl: this.#esploraUrl,
        arkadeServerUrl: this.#arkadeServerUrl,
      },
      signer,
      this.#signerStorage,
      this.#swapStorage,
    );
  }
}

/**
 * Main client for interacting with the Lendaswap API.
 *
 * The client manages:
 * - API communication
 * - Signer (HD wallet) for key derivation
 * - Storage for persisting mnemonic and key index
 *
 * Use `Client.builder()` to create a new instance.
 *
 * @example
 * ```ts
 * const client = await Client.builder()
 *   .withSignerStorage(new IdbWalletStorage())
 *   .withApiKey("your-api-key")
 *   .build();
 *
 * // Get mnemonic (for backup)
 * const mnemonic = client.getMnemonic();
 *
 * // Derive swap parameters
 * const params = await client.deriveSwapParams();
 * ```
 */
export class Client {
  readonly #apiClient: ApiClient;
  readonly #config: ClientConfig;
  #signer: Signer;
  readonly #signerStorage?: WalletStorage;
  readonly #swapStorage?: SwapStorage;

  /**
   * Creates a new Client instance.
   *
   * Use `Client.builder()` instead of calling this constructor directly.
   *
   * @internal
   */
  constructor(
    config: ClientConfig,
    signer: Signer,
    signerStorage?: WalletStorage,
    swapStorage?: SwapStorage,
  ) {
    this.#config = config;
    this.#apiClient = createApiClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
    });
    this.#signer = signer;
    this.#signerStorage = signerStorage;
    this.#swapStorage = swapStorage;
  }

  /**
   * Creates a new ClientBuilder for fluent configuration.
   * @returns A new ClientBuilder instance.
   */
  static builder(): ClientBuilder {
    return new ClientBuilder();
  }

  /** The underlying typed API client for direct API access. */
  get api(): ApiClient {
    return this.#apiClient;
  }

  /** The base URL of the API. */
  get baseUrl(): string {
    return this.#config.baseUrl;
  }

  /** The swap storage, if configured. */
  get swapStorage(): SwapStorage | undefined {
    return this.#swapStorage;
  }

  // =========================================================================
  // Signer Methods
  // =========================================================================

  /**
   * Gets the mnemonic phrase.
   *
   * Store this securely - it's the only way to recover the wallet.
   *
   * @returns The BIP39 mnemonic phrase.
   */
  getMnemonic(): string {
    return this.#signer.mnemonic;
  }

  /**
   * Loads a mnemonic phrase, replacing the current signer.
   *
   * The new mnemonic is persisted to storage if storage is configured.
   *
   * @param mnemonic - The BIP39 mnemonic phrase to load.
   * @throws Error if the mnemonic is invalid.
   */
  async loadMnemonic(mnemonic: string): Promise<void> {
    this.#signer = Signer.fromMnemonic(mnemonic);
    if (this.#signerStorage) {
      await this.#signerStorage.setMnemonic(mnemonic);
    }
  }

  /**
   * Gets the user ID extended public key for wallet recovery.
   *
   * This can be shared with the server for recovering swap history.
   *
   * @returns The hex-encoded user ID xpub.
   */
  getUserIdXpub(): string {
    return this.#signer.getUserIdXpubString();
  }

  /**
   * Derives swap parameters at the next available index.
   *
   * Automatically increments the key index in storage (if configured).
   *
   * @returns The derived swap parameters.
   */
  async deriveSwapParams(): Promise<SwapParams> {
    let index = 0;
    if (this.#signerStorage) {
      index = await this.#signerStorage.incrementKeyIndex();
    }
    return this.#signer.deriveSwapParams(index);
  }

  /**
   * Derives swap parameters at a specific index.
   *
   * Does not modify the stored key index. Useful for recovery scenarios.
   *
   * @param index - The key index to derive.
   * @returns The derived swap parameters.
   */
  deriveSwapParamsAtIndex(index: number): SwapParams {
    return this.#signer.deriveSwapParams(index);
  }

  /**
   * Gets the current key index from storage.
   * @returns The current key index, or 0 if no storage is configured.
   */
  async getKeyIndex(): Promise<number> {
    if (this.#signerStorage) {
      return this.#signerStorage.getKeyIndex();
    }
    return 0;
  }

  /**
   * Sets the key index in storage.
   *
   * Useful for recovery scenarios where you need to set the index
   * to a specific value.
   *
   * @param index - The new key index.
   * @throws Error if no storage is configured.
   */
  async setKeyIndex(index: number): Promise<void> {
    if (!this.#signerStorage) {
      throw new Error("No signer storage configured");
    }
    await this.#signerStorage.setKeyIndex(index);
  }

  // =========================================================================
  // Health & Info
  // =========================================================================

  /**
   * Checks the health status of the API.
   * @returns A promise that resolves to "ok" if the API is healthy.
   * @throws Error if the health check fails.
   */
  async healthCheck(): Promise<string> {
    const { data, error } = await this.#apiClient.GET("/health");
    if (error) {
      throw new Error(`Health check failed: ${JSON.stringify(error)}`);
    }
    return data ?? "ok";
  }

  /**
   * Gets the version information of the API.
   * @returns A promise that resolves to the version info containing tag and commit hash.
   * @throws Error if the request fails.
   */
  async getVersion(): Promise<{ tag: string; commit_hash: string }> {
    const { data, error } = await this.#apiClient.GET("/version");
    if (error) {
      throw new Error(`Failed to get version: ${JSON.stringify(error)}`);
    }
    if (!data) {
      throw new Error("No version data returned");
    }
    return data;
  }

  // =========================================================================
  // Tokens & Asset Pairs
  // =========================================================================

  /**
   * Gets the list of supported tokens.
   * @returns A promise that resolves to an array of token information.
   * @throws Error if the request fails.
   */
  async getTokens(): Promise<TokenInfos> {
    const { data, error } = await this.#apiClient.GET("/tokens");
    if (error || !data) {
      throw new Error(`Failed to get tokens: ${JSON.stringify(error)}`);
    }
    return data;
  }

  // =========================================================================
  // Quotes
  // =========================================================================

  /**
   * Gets a quote for swapping between two tokens.
   * @param params - Quote parameters.
   * @param params.sourceChain - Source blockchain (e.g., "Arkade", "Polygon").
   * @param params.sourceToken - Source token: contract address for EVM tokens, or "btc" for BTC.
   * @param params.targetChain - Target blockchain (e.g., "Polygon", "Lightning").
   * @param params.targetToken - Target token: contract address for EVM tokens, or "btc" for BTC.
   * @param params.sourceAmount - Amount in smallest unit of source token (mutually exclusive with targetAmount).
   * @param params.targetAmount - Amount in smallest unit of target token (mutually exclusive with sourceAmount).
   * @returns A promise that resolves to the quote response with pricing details.
   * @throws Error if the request fails.
   */
  async getQuote(params: {
    sourceChain: Chain;
    sourceToken: string;
    targetChain: Chain;
    targetToken: string;
    sourceAmount?: number;
    targetAmount?: number;
  }): Promise<QuoteResponse> {
    const { data, error } = await this.#apiClient.GET("/quote", {
      params: {
        query: {
          source_chain: params.sourceChain,
          source_token: params.sourceToken,
          target_chain: params.targetChain,
          target_token: params.targetToken,
          source_amount: params.sourceAmount,
          target_amount: params.targetAmount,
        },
      },
    });
    if (error) {
      throw new Error(`Failed to get quote: ${JSON.stringify(error)}`);
    }
    if (!data) {
      throw new Error("No quote data returned");
    }
    return data;
  }

  // =========================================================================
  // Swap Status
  // =========================================================================

  /**
   * Gets the status and details of a swap by its ID.
   * @param id - The UUID of the swap.
   * @param options - Optional settings.
   * @param options.updateStorage - If true, updates the swap in storage after fetching.
   * @returns A promise that resolves to the swap details.
   * @throws Error if the request fails or swap is not found.
   */
  async getSwap(
    id: string,
    options?: { updateStorage?: boolean },
  ): Promise<GetSwapResponse> {
    const { data, error } = await this.#apiClient.GET("/swap/{id}", {
      params: { path: { id } },
    });
    if (error) {
      throw new Error(`Failed to get swap: ${JSON.stringify(error)}`);
    }
    if (!data) {
      throw new Error("No swap data returned");
    }

    if (options?.updateStorage && this.#swapStorage) {
      await this.#swapStorage.update(id, data);
    }

    return data;
  }

  /**
   * Gets a swap from local storage without making a server request.
   *
   * Use this when you need swap data but don't need the latest status
   * from the server. The stored swap includes the preimage, keys, and
   * the last known swap response.
   *
   * @param id - The UUID of the swap.
   * @returns The stored swap data, or null if not found.
   *
   * @example
   * ```ts
   * const stored = await client.getStoredSwap(swapId);
   * if (stored) {
   *   console.log("Target:", stored.response.target_token);
   *   console.log("Status:", stored.response.status);
   * }
   * ```
   */
  async getStoredSwap(id: string): Promise<StoredSwap | null> {
    if (!this.#swapStorage) {
      return null;
    }
    return this.#swapStorage.get(id);
  }

  /**
   * Gets all stored swaps from local storage.
   *
   * @returns Array of all stored swap data, or empty array if no storage is configured.
   */
  async listAllSwaps(): Promise<StoredSwap[]> {
    if (!this.#swapStorage) {
      return [];
    }
    return this.#swapStorage.getAll();
  }

  async deleteSwap(id: string): Promise<void> {
    if (!this.#swapStorage) {
      return;
    }
    await this.#swapStorage.delete(id);
  }

  async clearSwapStorage(): Promise<void> {
    if (!this.#swapStorage) {
      return;
    }
    await this.#swapStorage.clear();
  }

  /**
   * Recovers all swaps associated with the current wallet from the server.
   *
   * Sends the user's xpub to the server, which returns all swaps belonging
   * to that wallet. For each recovered swap, re-derives the keys using the
   * swap's derivation index and stores it locally.
   *
   * After recovery, the key index is set to `highest_index + 1` so that
   * new swaps don't reuse derivation indices.
   *
   * @returns The recovered swaps stored locally.
   */
  async recoverSwaps(): Promise<StoredSwap[]> {
    console.log(`Recovering ...`);
    const xpub = this.getUserIdXpub();
    console.log(`Recovering ${xpub}`);

    const { data, error } = await this.#apiClient.POST("/swap/recover", {
      body: { xpub },
    });
    if (error) {
      throw new Error(`Failed to recover swaps: ${JSON.stringify(error)}`);
    }
    if (!data) {
      throw new Error("No recovery data returned");
    }

    const storedSwaps: StoredSwap[] = [];
    console.log(`Recovered data ${JSON.stringify(data)}`);

    for (const recoveredSwap of data.swaps) {
      const { index, ...response } = recoveredSwap;
      const swapParams = this.deriveSwapParamsAtIndex(index);

      await this.#storeSwap(response.id, swapParams, response);

      const stored = await this.getStoredSwap(response.id);
      if (stored) {
        storedSwaps.push(stored);
      }
    }

    // Update key index so new swaps don't reuse indices
    if (data.highest_index >= 0) {
      await this.setKeyIndex(data.highest_index + 1);
    }

    return storedSwaps;
  }

  /**
   * Gets VHTLC amounts for an Arkade swap.
   *
   * Queries the Arkade indexer for spendable, spent, and recoverable balances
   * at the VHTLC address associated with a swap. Works for:
   * - BTC → EVM swaps where the source asset is Arkade
   * - EVM → BTC swaps where the target asset is Arkade
   *
   * Reads swap data from local storage (does not contact the server).
   *
   * @param id - The UUID of the swap.
   * @returns The VHTLC amounts in satoshis.
   */
  async amountsForSwap(id: string): Promise<VhtlcAmounts> {
    const stored = await this.getStoredSwap(id);
    if (!stored) {
      throw new Error(`Swap not found in local storage: ${id}`);
    }

    const swap = stored.response;

    if (
      swap.direction !== "btc_to_evm" &&
      swap.direction !== "evm_to_btc" &&
      swap.direction !== "btc_to_arkade" &&
      swap.direction !== "arkade_to_evm" &&
      swap.direction !== "evm_to_arkade"
    ) {
      throw new Error(
        `amountsForSwap only applies to VHTLC-based swaps, got ${swap.direction}`,
      );
    }

    // Get VHTLC address based on swap direction
    let vhtlcAddress: string | undefined;
    if (swap.direction === "btc_to_arkade") {
      vhtlcAddress = (swap as BtcToArkadeSwapResponse).arkade_vhtlc_address;
    } else if (
      swap.direction === "arkade_to_evm" ||
      swap.direction === "evm_to_arkade"
    ) {
      vhtlcAddress = (
        swap as
          | (ArkadeToEvmSwapResponse & { direction: "arkade_to_evm" })
          | (EvmToArkadeSwapResponse & { direction: "evm_to_arkade" })
      ).btc_vhtlc_address;
    } else {
      vhtlcAddress = (swap as BtcToEvmSwapResponse | EvmToBtcSwapResponse)
        .htlc_address_arkade;
    }
    if (!vhtlcAddress) {
      throw new Error("Swap does not have an Arkade VHTLC address");
    }

    return getVhtlcAmounts({
      vhtlcAddress,
      network: swap.network,
      arkadeServerUrl: this.#config.arkadeServerUrl,
    });
  }

  // =========================================================================
  // Redeem
  // =========================================================================

  /**
   * Claims a swap by revealing the preimage.
   *
   * Reads swap data and preimage from local storage. The claim method
   * depends on the swap direction and target chain:
   * - **Arkade/Lightning-to-EVM**: Gasless claim via server
   * - **Other EVM swaps**: Returns call data for manual claiming
   * - **Arkade**: Claims via Arkade protocol
   *
   * @param id - The UUID of the swap.
   * @param _options - Deprecated. For Arkade/Lightning-to-EVM, destination is set at swap creation.
   * @returns A ClaimResult with the outcome.
   *
   * @example
   * ```ts
   * // Arkade-to-EVM (gasless via server, uses stored target address)
   * const result = await client.claim(swapId);
   *
   * // Other swap types
   * const result = await client.claim(swapId);
   * if (result.success) {
   *   console.log("Claim TX:", result.txHash);
   * }
   * ```
   */
  async claim(id: string, _options?: ClaimOptions): Promise<ClaimResult> {
    // Check swap storage is configured
    if (!this.#swapStorage) {
      return {
        success: false,
        message:
          "Swap storage is not configured. Cannot retrieve swap data needed for claim.",
      };
    }

    // Get stored swap data (contains preimage, keys, and swap response)
    const storedSwap = await this.#swapStorage.get(id);
    if (!storedSwap) {
      return {
        success: false,
        message: `Swap ${id} not found in local storage. Cannot claim without stored data.`,
      };
    }

    const swap = storedSwap.response;
    const secret = storedSwap.preimage;

    // EVM-targeted swaps: use gasless claim via server (SDK signs internally)
    // The destination is always the stored target_evm_address (set at swap creation time)
    if (
      swap.direction === "arkade_to_evm" ||
      swap.direction === "lightning_to_evm"
    ) {
      const evmSwap = swap as (
        | ArkadeToEvmSwapResponse
        | LightningToEvmSwapResponse
      ) & {
        direction: string;
      };
      // Use the stored target address - this was set when the swap was created
      const destination =
        evmSwap.target_evm_address ?? evmSwap.client_evm_address;

      if (!destination) {
        return {
          success: false,
          message:
            "Gasless claim failed: no target address found. " +
            "This swap may have been created before target address storage was implemented.",
        };
      }
      const gaslessResult = await this.claimViaGasless(id, destination);
      return {
        success: true,
        message: gaslessResult.message,
        txHash: gaslessResult.txHash,
      };
    }

    // EVM-to-Bitcoin: user claims BTC from on-chain Taproot HTLC with preimage
    if (swap.direction === "evm_to_bitcoin") {
      return this.#claimOnchainBtc(id, _options);
    }

    // Check if target is Arkade (handle both string "btc_arkade" and TokenInfo object)
    const isArkadeTarget =
      swap.target_token === "btc_arkade" ||
      (typeof swap.target_token === "object" &&
        swap.target_token !== null &&
        (swap.target_token as { symbol: string }).symbol === "BTC");

    if (isArkadeTarget) {
      // Determine destination address based on swap direction
      let destinationAddress: string | undefined;

      if (swap.direction === "btc_to_arkade") {
        const btcToArkadeSwap = swap as BtcToArkadeSwapResponse & {
          direction: "btc_to_arkade";
        };
        destinationAddress = btcToArkadeSwap.target_arkade_address;
      } else if (swap.direction === "evm_to_btc") {
        const evmSwap = swap as EvmToBtcSwapResponse & {
          direction: "evm_to_btc";
        };
        destinationAddress = evmSwap.user_address_arkade ?? undefined;
      } else if (swap.direction === "evm_to_arkade") {
        // For evm_to_arkade swaps, check if we have target_arkade_address in stored response
        // The creation response (EvmToArkadeGenericSwapResponse) doesn't have it,
        // but the GET response (EvmToArkadeSwapResponse) does.
        const storedResponse = swap as { target_arkade_address?: string };
        if (storedResponse.target_arkade_address) {
          destinationAddress = storedResponse.target_arkade_address;
        } else {
          // Fetch from API to get the full response with target_arkade_address
          const freshSwap = await this.getSwap(id);
          const evmToArkadeSwap = freshSwap as {
            target_arkade_address: string;
          };
          destinationAddress = evmToArkadeSwap.target_arkade_address;
        }
      }

      if (!destinationAddress) {
        return {
          success: false,
          message:
            "No Arkade destination address found in swap. Use claimArkade() with explicit destinationAddress.",
        };
      }

      const arkadeResult = await this.claimArkade(id, { destinationAddress });

      // Convert to ClaimResult format
      return {
        success: arkadeResult.success,
        message: arkadeResult.message,
        chain: "arkade",
        txHash: arkadeResult.txId,
      };
    }

    // For EVM chains, use the existing claim logic
    return redeemClaim(id, secret, {
      apiClient: this.#apiClient,
      getSwap: () => Promise.resolve(swap),
    });
  }

  /**
   * Claims an Arkade-to-EVM swap gaslessly via the server.
   *
   * The SDK builds the EIP-712 digest, signs it with the swap's internally
   * derived EVM key, and sends the signature + secret to the server. The
   * server submits the `coordinator.redeemAndExecute` transaction.
   *
   * @param id - The UUID of the swap.
   * @param destination - The EVM address where tokens should be sent.
   * @returns The gasless claim result with transaction hash.
   *
   * @example
   * ```ts
   * const result = await client.claimViaGasless(swapId, "0xYourAddress");
   * console.log("Claimed! TX:", result.txHash);
   * ```
   */
  async claimViaGasless(
    id: string,
    destination: string,
    options?: { slippage?: number },
  ): Promise<ClaimGaslessResult> {
    if (!this.#swapStorage) {
      throw new Error(
        "Swap storage is not configured. Cannot retrieve preimage needed for gasless claim.",
      );
    }

    // Fetch all data upfront
    const stored = await this.#swapStorage.get(id);
    if (!stored) {
      throw new Error(`Swap ${id} not found in local storage.`);
    }

    const swap = (await this.getSwap(id, {
      updateStorage: true,
    })) as (ArkadeToEvmSwapResponse | LightningToEvmSwapResponse) & {
      direction: string;
    };

    if (
      swap.direction !== "arkade_to_evm" &&
      swap.direction !== "lightning_to_evm"
    ) {
      throw new Error(
        `Expected arkade_to_evm or lightning_to_evm swap, got ${swap.direction}. claimViaGasless is for EVM-targeted swaps.`,
      );
    }

    // Fetch DEX calldata if the target token differs from WBTC
    const targetTokenAddress = String(swap.target_token.token_id);
    const needsDexSwap =
      targetTokenAddress.toLowerCase() !== swap.wbtc_address.toLowerCase();

    let dexCalldata: { to: string; data: string; value: string } | undefined;
    if (needsDexSwap) {
      const slippage = options?.slippage ?? 1.0;
      const calldataResponse = await this.#apiClient.GET(
        "/swap/{id}/redeem-and-swap-calldata",
        {
          params: {
            path: { id },
            query: { destination, slippage },
          },
        },
      );
      if (calldataResponse.error) {
        throw new Error(
          `Failed to fetch DEX calldata: ${calldataResponse.error.error}`,
        );
      }
      if (calldataResponse.data) {
        dexCalldata = {
          to: calldataResponse.data.to,
          data: calldataResponse.data.data,
          value: calldataResponse.data.value,
        };
      }
    }

    return gaslessClaim({
      baseUrl: this.#config.baseUrl,
      preimage: stored.preimage,
      secretKey: hexToBytes(stored.secretKey),
      swap,
      destination,
      dexCalldata,
    });
  }

  /**
   * Claims an Arkade (off-chain) VHTLC swap by revealing the preimage.
   *
   * This is used for EVM-to-Arkade swaps where the user claims BTC
   * on Arkade after the server has funded the VHTLC.
   *
   * @param id - The UUID of the swap.
   * @param options - Claim options including destination address.
   * @returns The claim result with transaction ID and amount.
   *
   * @example
   * ```ts
   * const result = await client.claimArkade(swapId, {
   *   destinationAddress: "ark1q...", // Where to receive BTC
   * });
   * if (result.success) {
   *   console.log("Claim TX:", result.txId);
   *   console.log("Amount:", result.claimAmount);
   * }
   * ```
   */
  async claimArkade(
    id: string,
    options: ArkadeClaimOptions,
  ): Promise<{
    success: boolean;
    message: string;
    txId?: string;
    claimAmount?: bigint;
  }> {
    // Validate options
    if (!options?.destinationAddress) {
      return {
        success: false,
        message:
          "Destination address is required for Arkade claims. " +
          'Provide it via the options parameter: { destinationAddress: "ark1..." }',
      };
    }

    // Check swap storage is configured
    if (!this.#swapStorage) {
      return {
        success: false,
        message:
          "Swap storage is not configured. Cannot retrieve the preimage needed for claim.",
      };
    }

    // Get stored swap data (contains preimage and secret key)
    const storedSwap = await this.#swapStorage.get(id);
    if (!storedSwap) {
      return {
        success: false,
        message: `Swap ${id} not found in local storage. The preimage is required to claim.`,
      };
    }

    const swap = storedSwap.response;

    // Ensure we have an Arkade-target swap
    if (
      swap.direction !== "evm_to_btc" &&
      swap.direction !== "btc_to_arkade" &&
      swap.direction !== "evm_to_arkade"
    ) {
      return {
        success: false,
        message: `Expected evm_to_btc, btc_to_arkade, or evm_to_arkade swap, got ${swap.direction}. claimArkade is for swaps targeting Arkade.`,
      };
    }

    // Get user's x-only public key (32 bytes) from stored swap
    const fullPubKey = storedSwap.publicKey;
    const userPubKey =
      fullPubKey.length === 66 ? fullPubKey.slice(2) : fullPubKey;

    // Build claim parameters based on swap direction
    let lendaswapPubKey: string;
    let arkadeServerPubKey: string;
    let vhtlcAddress: string;
    let refundLocktime: number;
    let unilateralClaimDelay: number;
    let unilateralRefundDelay: number;
    let unilateralRefundWithoutReceiverDelay: number;
    let network: string;

    if (swap.direction === "btc_to_arkade") {
      const btcToArkadeSwap = swap as BtcToArkadeSwapResponse & {
        direction: "btc_to_arkade";
      };
      lendaswapPubKey = btcToArkadeSwap.server_vhtlc_pk;
      arkadeServerPubKey = btcToArkadeSwap.arkade_server_pk;
      vhtlcAddress = btcToArkadeSwap.arkade_vhtlc_address;
      refundLocktime = btcToArkadeSwap.vhtlc_refund_locktime;
      unilateralClaimDelay = btcToArkadeSwap.unilateral_claim_delay;
      unilateralRefundDelay = btcToArkadeSwap.unilateral_refund_delay;
      unilateralRefundWithoutReceiverDelay =
        btcToArkadeSwap.unilateral_refund_without_receiver_delay;
      network = btcToArkadeSwap.network;
    } else if (swap.direction === "evm_to_arkade") {
      // New generic evm_to_arkade endpoint - works with both creation and GET responses
      const evmToArkadeSwap = swap as {
        sender_pk: string;
        arkade_server_pk: string;
        btc_vhtlc_address: string;
        vhtlc_refund_locktime: number;
        unilateral_claim_delay: number;
        unilateral_refund_delay: number;
        unilateral_refund_without_receiver_delay: number;
        network: string;
      };
      // For EVM-to-Arkade: Lendaswap is SENDER in the VHTLC (locks BTC), user is RECEIVER
      // In the API response:
      //   sender_pk = lendaswap's derived key (VHTLC sender, locks BTC)
      //   receiver_pk = user's key (VHTLC receiver, claims BTC)
      lendaswapPubKey = evmToArkadeSwap.sender_pk;
      arkadeServerPubKey = evmToArkadeSwap.arkade_server_pk;
      vhtlcAddress = evmToArkadeSwap.btc_vhtlc_address;
      refundLocktime = evmToArkadeSwap.vhtlc_refund_locktime;
      unilateralClaimDelay = evmToArkadeSwap.unilateral_claim_delay;
      unilateralRefundDelay = evmToArkadeSwap.unilateral_refund_delay;
      unilateralRefundWithoutReceiverDelay =
        evmToArkadeSwap.unilateral_refund_without_receiver_delay;
      network = evmToArkadeSwap.network;
    } else {
      // Old evm_to_btc endpoint (targeting Arkade)
      const evmToArkadeSwap = swap as EvmToBtcSwapResponse & {
        direction: "evm_to_btc";
      };
      // For claim: lendaswap is SENDER in the VHTLC, user is RECEIVER
      // In the API response:
      //   sender_pk = client's public key
      //   receiver_pk = lendaswap's public key
      lendaswapPubKey = evmToArkadeSwap.receiver_pk;
      arkadeServerPubKey = evmToArkadeSwap.server_pk;
      vhtlcAddress = evmToArkadeSwap.htlc_address_arkade;
      refundLocktime = evmToArkadeSwap.vhtlc_refund_locktime;
      unilateralClaimDelay = evmToArkadeSwap.unilateral_claim_delay;
      unilateralRefundDelay = evmToArkadeSwap.unilateral_refund_delay;
      unilateralRefundWithoutReceiverDelay =
        evmToArkadeSwap.unilateral_refund_without_receiver_delay;
      network = evmToArkadeSwap.network;
    }

    try {
      const result = await buildArkadeClaim({
        userSecretKey: storedSwap.secretKey,
        userPubKey,
        lendaswapPubKey,
        arkadeServerPubKey,
        preimage: storedSwap.preimage,
        preimageHash: storedSwap.preimageHash,
        vhtlcAddress,
        refundLocktime,
        unilateralClaimDelay,
        unilateralRefundDelay,
        unilateralRefundWithoutReceiverDelay,
        destinationAddress: options.destinationAddress,
        network,
        arkadeServerUrl:
          options.arkadeServerUrl ?? this.#config.arkadeServerUrl,
      });

      return {
        success: true,
        message: "Arkade claim executed successfully!",
        txId: result.txId,
        claimAmount: result.claimAmount,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to execute Arkade claim: ${message}`,
      };
    }
  }

  // =========================================================================
  // Refund
  // =========================================================================

  /**
   * Attempts to refund a swap.
   *
   * Refund behavior depends on the swap type:
   * - **Lightning to EVM**: Cannot refund - Lightning swaps auto-expire if not completed.
   *   The invoice will simply expire and no funds are locked.
   * - **Arkade to EVM**: Off-chain refund via Arkade server
   * - **Bitcoin (on-chain) to EVM**: Builds a signed refund transaction that the user
   *   must broadcast to reclaim their funds after the locktime.
   *
   * @param id - The UUID of the swap to refund.
   * @param options - Options for on-chain refunds (required for btc_onchain swaps).
   * @returns A RefundResult with the transaction details (for on-chain) or status message.
   * @throws Error if the swap cannot be found, storage is not configured, or params are invalid.
   *
   * @example
   * ```ts
   * // For on-chain swaps
   * const result = await client.refundSwap(swapId, {
   *   destinationAddress: "bc1q...",
   *   feeRateSatPerVb: 5,
   * });
   * if (result.success) {
   *   console.log("Broadcast this transaction:", result.txHex);
   *   console.log("Transaction ID:", result.txId);
   * }
   * ```
   */
  async refundSwap(id: string, options?: RefundOptions): Promise<RefundResult> {
    // Get the swap to determine its type
    const storedSwap = await this.getStoredSwap(id);
    if (!storedSwap) {
      throw Error("Swap not found");
    }
    const swap = storedSwap.response;

    // Use direction to determine refund method (source_token may be a TokenSummary object)
    const direction = swap.direction;

    // Lightning (btc_to_evm) swaps cannot be refunded - they auto-expire
    if (direction === "btc_to_evm") {
      return {
        success: false,
        message:
          "Lightning swaps cannot be refunded. If the invoice was paid, " +
          "it will refund automatically.",
      };
    }

    // Arkade swaps require off-chain refund
    if (direction === "arkade_to_evm") {
      return this.#buildArkadeRefund(id, swap, options as ArkadeRefundOptions);
    }

    // Bitcoin on-chain swaps require on-chain refund transaction
    if (direction === "onchain_to_evm") {
      return this.#buildOnchainRefund(id, swap, options);
    }

    // EVM-sourced swaps return calldata for manual execution
    if (direction === "evm_to_arkade") {
      return this.#buildEvmToArkadeRefund(id, swap);
    }

    if (direction === "evm_to_btc") {
      return this.#buildEvmToBtcRefund(id, swap);
    }

    // EVM-to-Bitcoin uses coordinator refund (same pattern as EVM-to-Arkade)
    if (direction === "evm_to_bitcoin") {
      return this.#buildEvmToBitcoinRefund(id, swap);
    }

    return {
      success: false,
      message: `Refund not supported for direction: ${direction}.`,
    };
  }

  /**
   * Claims BTC from an on-chain Taproot HTLC for an EVM-to-Bitcoin swap.
   *
   * The user reveals the preimage to spend from the hashlock script path.
   * @internal
   */
  async #claimOnchainBtc(
    id: string,
    options?: ClaimOptions,
  ): Promise<ClaimResult> {
    if (!this.#swapStorage) {
      return {
        success: false,
        message:
          "Swap storage is not configured. Cannot retrieve preimage and keys needed for claim.",
      };
    }

    const storedSwap = await this.#swapStorage.get(id);
    if (!storedSwap) {
      return {
        success: false,
        message: `Swap ${id} not found in local storage.`,
      };
    }

    // Fetch the latest swap state from API
    const swap = (await this.getSwap(id, {
      updateStorage: true,
    })) as EvmToBitcoinSwapResponse & { direction: "evm_to_bitcoin" };

    if (swap.direction !== "evm_to_bitcoin") {
      return {
        success: false,
        message: `Expected evm_to_bitcoin swap, got ${swap.direction}`,
      };
    }

    // Extract BTC HTLC parameters
    const btcHtlcAddress = swap.btc_htlc_address;
    const btcHashLock = swap.btc_hash_lock;
    const btcRefundLocktime = swap.btc_refund_locktime;
    const networkStr = swap.network;

    // Get server refund pk (needed to reconstruct the Taproot tree)
    const serverRefundPkRaw = (swap as { btc_server_refund_pk?: string })
      .btc_server_refund_pk;
    if (!serverRefundPkRaw) {
      return {
        success: false,
        message:
          "Server refund public key not available. The API response may need to be updated.",
      };
    }

    // Map network string
    const networkMap: Record<string, BitcoinNetwork> = {
      mainnet: "mainnet",
      testnet: "testnet",
      signet: "signet",
      regtest: "regtest",
    };
    const network = networkMap[networkStr];
    if (!network) {
      return {
        success: false,
        message: `Unknown Bitcoin network: ${networkStr}`,
      };
    }

    // Get user's x-only public key (32 bytes from 33-byte compressed)
    const fullPubKey = storedSwap.publicKey;
    const userClaimPk =
      fullPubKey.length === 66 ? fullPubKey.slice(2) : fullPubKey;

    // Strip compressed key prefix if present
    const serverRefundPk =
      serverRefundPkRaw.length === 66
        ? serverRefundPkRaw.slice(2)
        : serverRefundPkRaw;

    // Verify HTLC address matches our reconstruction
    const addressMatches = verifyHtlcAddress(
      btcHtlcAddress,
      btcHashLock,
      userClaimPk, // claimer = user (goes in hashlock position)
      serverRefundPk, // refunder = server (goes in timelock position)
      btcRefundLocktime,
      network,
    );

    if (!addressMatches) {
      return {
        success: false,
        message:
          `HTLC address mismatch. Computed address does not match server's (${btcHtlcAddress}). ` +
          `Parameters: hashLock='${btcHashLock}', userPk='${userClaimPk}', ` +
          `serverPk='${serverRefundPk}', locktime='${btcRefundLocktime}', network='${network}'`,
      };
    }

    // Find the UTXO at the HTLC address
    const esploraUrl = this.#config.esploraUrl ?? DEFAULT_ESPLORA_URLS[network];
    if (!esploraUrl) {
      return {
        success: false,
        message: `No Esplora URL configured for network ${network}.`,
      };
    }

    const htlcOutput = await findOutputByAddress(esploraUrl, btcHtlcAddress);
    if (!htlcOutput) {
      return {
        success: false,
        message: `Could not find UTXO at HTLC address ${btcHtlcAddress}. The server may not have funded the HTLC yet.`,
      };
    }

    // Determine destination address
    const destinationAddress = options?.destinationAddress;
    if (!destinationAddress) {
      return {
        success: false,
        message:
          "Destination address is required to claim BTC. " +
          'Provide it via options: { destinationAddress: "bc1p..." }',
      };
    }

    try {
      const result = buildOnchainClaimTransaction({
        fundingTxId: htlcOutput.txid,
        fundingVout: htlcOutput.vout,
        htlcAmount: htlcOutput.amount,
        hashLock: btcHashLock,
        userClaimPubKey: userClaimPk,
        serverRefundPubKey: serverRefundPk,
        userSecretKey: storedSwap.secretKey,
        preimage: storedSwap.preimage,
        refundLocktime: btcRefundLocktime,
        destinationAddress,
        feeRateSatPerVb: options?.feeRateSatPerVb ?? 2,
        network,
      });

      // Broadcast
      try {
        await broadcastTransaction(esploraUrl, result.txHex);
        return {
          success: true,
          message: "BTC claim transaction broadcast successfully!",
          txHash: result.txId,
          // chain: "bitcoin" — not in ClaimChain type
        };
      } catch (broadcastError) {
        const msg =
          broadcastError instanceof Error
            ? broadcastError.message
            : String(broadcastError);
        return {
          success: true,
          message: `Claim transaction built but broadcast failed: ${msg}. TxHex: ${result.txHex}`,
          txHash: result.txId,
          // chain: "bitcoin" — not in ClaimChain type
        };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to build claim transaction: ${msg}`,
      };
    }
  }

  /**
   * Builds an on-chain Bitcoin refund transaction.
   * @internal
   */
  async #buildOnchainRefund(
    id: string,
    swap: GetSwapResponse,
    options?: OnchainRefundOptions,
  ): Promise<RefundResult> {
    // Validate options
    if (!options?.destinationAddress) {
      return {
        success: false,
        message:
          "Destination address is required for on-chain refunds. " +
          'Provide it via the options parameter: { destinationAddress: "bc1q..." }',
      };
    }

    // Check swap storage is configured
    if (!this.#swapStorage) {
      return {
        success: false,
        message:
          "Swap storage is not configured. Cannot retrieve the secret key needed for refund.",
      };
    }

    // Get stored swap data (contains secret key)
    const storedSwap = await this.#swapStorage.get(id);
    if (!storedSwap) {
      return {
        success: false,
        message: `Swap ${id} not found in local storage. The secret key is required to sign the refund transaction.`,
      };
    }

    // Ensure we have an on-chain funded swap
    if (
      swap.direction !== "onchain_to_evm" &&
      swap.direction !== "btc_to_arkade"
    ) {
      return {
        success: false,
        message: `Expected bitcoin_to_evm or btc_to_arkade swap, got ${swap.direction}`,
      };
    }

    // Extract on-chain HTLC fields based on direction
    // Both directions have the same on-chain HTLC but fields are named differently
    let btcHtlcAddress: string;
    let btcRefundLocktime: number;
    let hashLock: string;
    let serverPubKeyFull: string;
    let networkStr: string;

    if (swap.direction === "btc_to_arkade") {
      const arkadeSwap = swap as BtcToArkadeSwapResponse & {
        direction: "btc_to_arkade";
      };
      btcHtlcAddress = arkadeSwap.btc_htlc_address;
      btcRefundLocktime = arkadeSwap.btc_refund_locktime;
      hashLock = arkadeSwap.hash_lock;
      serverPubKeyFull = arkadeSwap.server_vhtlc_pk;
      networkStr = arkadeSwap.network;
    } else {
      // OnchainToEvmSwapResponse (on-chain Bitcoin to EVM)
      const onchainSwap = swap as unknown as {
        btc_htlc_address: string;
        btc_refund_locktime: number;
        btc_hash_lock: string;
        btc_server_pk: string;
        network: string;
      };
      btcHtlcAddress = onchainSwap.btc_htlc_address;
      btcRefundLocktime = onchainSwap.btc_refund_locktime;
      hashLock = onchainSwap.btc_hash_lock;
      serverPubKeyFull = onchainSwap.btc_server_pk;
      networkStr = onchainSwap.network;
    }

    // Check refund locktime
    const now = Math.floor(Date.now() / 1000);
    if (now < btcRefundLocktime) {
      const remainingSeconds = btcRefundLocktime - now;
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      return {
        success: false,
        message:
          `Refund is not yet available. The locktime expires in ${remainingMinutes} minutes ` +
          `(at ${new Date(btcRefundLocktime * 1000).toISOString()}).`,
      };
    }

    // Map network string to BitcoinNetwork type
    const networkMap: Record<string, BitcoinNetwork> = {
      mainnet: "mainnet",
      testnet: "testnet",
      signet: "signet",
      regtest: "regtest",
    };
    const network = networkMap[networkStr];
    if (!network) {
      return {
        success: false,
        message: `Unknown Bitcoin network: ${networkStr}`,
      };
    }

    // Get user's x-only public key (32 bytes) from stored swap
    // The stored publicKey is the full compressed pubkey (33 bytes)
    // We need to extract the x-only portion (drop the first byte prefix)
    const fullPubKey = storedSwap.publicKey;
    const userPubKey =
      fullPubKey.length === 66 ? fullPubKey.slice(2) : fullPubKey;

    // Strip compressed key prefix if present (33-byte → 32-byte x-only)
    const serverXOnlyPubKey =
      serverPubKeyFull.length === 66
        ? serverPubKeyFull.slice(2)
        : serverPubKeyFull;

    // Verify that our computed HTLC address matches the server's address
    const addressMatches = verifyHtlcAddress(
      btcHtlcAddress,
      hashLock,
      serverXOnlyPubKey,
      userPubKey,
      btcRefundLocktime,
      network,
    );

    if (!addressMatches) {
      return {
        success: false,
        message:
          `HTLC address mismatch. The computed address does not match the server's address (${btcHtlcAddress}). ` +
          `This could indicate different script construction. ` +
          `Parameters: \nhashLock='${hashLock}', \nserverPk='${serverPubKeyFull}', ` +
          `\nuserPk='${userPubKey}', \nlocktime='${btcRefundLocktime}',` +
          `\nnetwork='${network}'`,
      };
    }

    // Find the correct vout by looking up the funding transaction
    const esploraUrl = this.#config.esploraUrl ?? DEFAULT_ESPLORA_URLS[network];
    if (!esploraUrl) {
      return {
        success: false,
        message: `No Esplora URL configured for network ${network}. Cannot look up funding transaction.`,
      };
    }

    const htlcOutput = await findOutputByAddress(esploraUrl, btcHtlcAddress);

    if (!htlcOutput) {
      return {
        success: false,
        message:
          `Could not find UTXO at HTLC address ${btcHtlcAddress}. ` +
          `The address may not have been funded yet.`,
      };
    }

    try {
      // Build the refund transaction
      const result = buildOnchainRefundTransaction({
        fundingTxId: htlcOutput.txid,
        fundingVout: htlcOutput.vout,
        htlcAmount: htlcOutput.amount,
        hashLock,
        serverPubKey: serverXOnlyPubKey,
        userPubKey,
        userSecretKey: storedSwap.secretKey,
        refundLocktime: btcRefundLocktime,
        destinationAddress: options.destinationAddress,
        feeRateSatPerVb: options.feeRateSatPerVb ?? 2,
        network,
      });

      // If dry run, just return the transaction without broadcasting
      if (options.dryRun) {
        return {
          success: true,
          message:
            "Refund transaction built successfully (dry run - not broadcast).",
          txHex: result.txHex,
          txId: result.txId,
          refundAmount: result.refundAmount,
          fee: result.fee,
          broadcast: false,
          htlcAddress: result.htlcAddress,
          serverHtlcAddress: btcHtlcAddress,
        };
      }

      // Broadcast the transaction
      const broadcastEsploraUrl =
        this.#config.esploraUrl ?? DEFAULT_ESPLORA_URLS[network];
      if (!broadcastEsploraUrl) {
        return {
          success: true,
          message:
            "Refund transaction built successfully. No Esplora URL configured for broadcast. " +
            "Broadcast the txHex manually to the Bitcoin network.",
          txHex: result.txHex,
          txId: result.txId,
          refundAmount: result.refundAmount,
          fee: result.fee,
          broadcast: false,
          htlcAddress: result.htlcAddress,
          serverHtlcAddress: btcHtlcAddress,
        };
      }

      try {
        await broadcastTransaction(broadcastEsploraUrl, result.txHex);
        return {
          success: true,
          message: "Refund transaction broadcast successfully!",
          txHex: result.txHex,
          txId: result.txId,
          refundAmount: result.refundAmount,
          fee: result.fee,
          broadcast: true,
          htlcAddress: result.htlcAddress,
          serverHtlcAddress: btcHtlcAddress,
        };
      } catch (broadcastError) {
        const broadcastMessage =
          broadcastError instanceof Error
            ? broadcastError.message
            : String(broadcastError);
        return {
          success: true,
          message:
            `Transaction built but broadcast failed: ${broadcastMessage}. ` +
            "You can broadcast the txHex manually.",
          txHex: result.txHex,
          txId: result.txId,
          refundAmount: result.refundAmount,
          fee: result.fee,
          broadcast: false,
          htlcAddress: result.htlcAddress,
          serverHtlcAddress: btcHtlcAddress,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to build refund transaction: ${message}`,
      };
    }
  }

  /**
   * Builds and executes an Arkade (off-chain) VHTLC refund.
   * @internal
   */
  async #buildArkadeRefund(
    id: string,
    swap: GetSwapResponse,
    options?: ArkadeRefundOptions,
  ): Promise<RefundResult> {
    // Validate options
    if (!options?.destinationAddress) {
      return {
        success: false,
        message:
          "Destination address is required for Arkade refunds. " +
          'Provide it via the options parameter: { destinationAddress: "ark1..." }',
      };
    }

    // Check swap storage is configured
    if (!this.#swapStorage) {
      return {
        success: false,
        message:
          "Swap storage is not configured. Cannot retrieve the secret key needed for refund.",
      };
    }

    // Get stored swap data (contains secret key)
    const storedSwap = await this.#swapStorage.get(id);
    if (!storedSwap) {
      return {
        success: false,
        message: `Swap ${id} not found in local storage. The secret key is required to sign the refund transaction.`,
      };
    }

    // Ensure we have a btc_to_evm swap response (Arkade swaps)
    if (swap.direction !== "btc_to_evm" && swap.direction !== "arkade_to_evm") {
      return {
        success: false,
        message: `Expected btc_to_evm swap, got ${swap.direction}`,
      };
    }

    // Extract VHTLC parameters — field names differ between btc_to_evm and arkade_to_evm
    let lendaswapPubKey: string;
    let arkadeServerPubKey: string;
    let vhtlcAddress: string;
    let vhtlcRefundLocktime: number;
    let unilateralClaimDelay: number;
    let unilateralRefundDelay: number;
    let unilateralRefundWithoutReceiverDelay: number;
    let hashLockRaw: string;
    let network: string;

    if (swap.direction === "arkade_to_evm") {
      const s = swap as ArkadeToEvmSwapResponse & {
        direction: "arkade_to_evm";
      };
      lendaswapPubKey = s.receiver_pk;
      arkadeServerPubKey = s.arkade_server_pk;
      vhtlcAddress = s.btc_vhtlc_address;
      vhtlcRefundLocktime = s.vhtlc_refund_locktime;
      unilateralClaimDelay = s.unilateral_claim_delay;
      unilateralRefundDelay = s.unilateral_refund_delay;
      unilateralRefundWithoutReceiverDelay =
        s.unilateral_refund_without_receiver_delay;
      hashLockRaw = s.hash_lock;
      network = s.network;
    } else {
      const s = swap as BtcToEvmSwapResponse & {
        direction: "btc_to_evm";
      };
      lendaswapPubKey = s.receiver_pk;
      arkadeServerPubKey = s.server_pk;
      vhtlcAddress = s.htlc_address_arkade;
      vhtlcRefundLocktime = s.vhtlc_refund_locktime;
      unilateralClaimDelay = s.unilateral_claim_delay;
      unilateralRefundDelay = s.unilateral_refund_delay;
      unilateralRefundWithoutReceiverDelay =
        s.unilateral_refund_without_receiver_delay;
      hashLockRaw = s.hash_lock;
      network = s.network;
    }

    // Check refund locktime
    const now = Math.floor(Date.now() / 1000);
    if (now < vhtlcRefundLocktime) {
      const remainingSeconds = vhtlcRefundLocktime - now;
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      return {
        success: false,
        message:
          `Refund is not yet available. The VHTLC locktime expires in ${remainingMinutes} minutes ` +
          `(at ${new Date(vhtlcRefundLocktime * 1000).toISOString()}).`,
      };
    }

    // Get user's x-only public key (32 bytes) from stored swap
    // The stored publicKey is the full compressed pubkey (33 bytes)
    // We need to extract the x-only portion (drop the first byte prefix)
    const fullPubKey = storedSwap.publicKey;
    const userPubKey =
      fullPubKey.length === 66 ? fullPubKey.slice(2) : fullPubKey;

    // Parse the hash lock - remove 0x prefix if present
    const hashLock = hashLockRaw.startsWith("0x")
      ? hashLockRaw.slice(2)
      : hashLockRaw;

    try {
      const result = await buildArkadeRefund({
        userSecretKey: storedSwap.secretKey,
        userPubKey,
        lendaswapPubKey,
        arkadeServerPubKey,
        hashLock,
        vhtlcAddress,
        refundLocktime: vhtlcRefundLocktime,
        unilateralClaimDelay,
        unilateralRefundDelay,
        unilateralRefundWithoutReceiverDelay,
        destinationAddress: options.destinationAddress,
        network,
        arkadeServerUrl:
          options.arkadeServerUrl ?? this.#config.arkadeServerUrl,
      });

      return {
        success: true,
        message: "Arkade refund executed successfully!",
        txId: result.txId,
        refundAmount: result.refundAmount,
        broadcast: true, // Arkade refunds are automatically submitted
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Failed to execute Arkade refund: ${message}`,
      };
    }
  }

  /**
   * Builds refund data for an EVM-to-Arkade swap via the coordinator.
   *
   * Calls the server's refund-calldata endpoint which builds coordinator
   * calldata for `refundAndExecute` (swap WBTC back to source token) or
   * `refundTo` (return WBTC directly).
   *
   * @internal
   */
  async #buildEvmToArkadeRefund(
    id: string,
    swap: GetSwapResponse,
  ): Promise<RefundResult> {
    const evmSwap = swap as EvmToArkadeSwapResponse & {
      direction: "evm_to_arkade";
    };

    const timelock = evmSwap.evm_refund_locktime;
    const now = Math.floor(Date.now() / 1000);
    const timelockExpired = now >= timelock;

    // Fetch coordinator refund calldata from server (default mode: swap-back)
    const response = await this.#apiClient.GET(
      "/swap/{id}/refund-and-swap-calldata",
      {
        params: {
          path: { id },
          query: { mode: "swap-back" },
        },
      },
    );

    if (response.error) {
      return {
        success: false,
        message: `Failed to fetch refund calldata: ${response.error.error || "Unknown error"}`,
      };
    }

    const { coordinator_address, calldata } = response.data;

    return {
      success: true,
      message: timelockExpired
        ? "EVM refund calldata ready. Submit this transaction with your EVM wallet."
        : `Timelock has not expired yet. Refund will be available at ${new Date(timelock * 1000).toISOString()}.`,
      evmRefundData: {
        to: coordinator_address,
        data: calldata,
        timelockExpired,
        timelockExpiry: timelock,
      },
    };
  }

  /**
   * Builds refund data for an EVM-to-BTC swap (direct HTLC refund).
   * @internal
   */
  async #buildEvmToBtcRefund(
    id: string,
    swap: GetSwapResponse,
  ): Promise<RefundResult> {
    const evmSwap = swap as EvmToBtcSwapResponse;
    const htlcAddress = evmSwap.htlc_address_evm;
    const timelock = evmSwap.evm_refund_locktime;

    const now = Math.floor(Date.now() / 1000);
    const timelockExpired = now >= timelock;

    const refundData = encodeRefundSwapCallData(htlcAddress, id);

    return {
      success: true,
      message: timelockExpired
        ? "EVM refund calldata ready. Submit this transaction with your EVM wallet."
        : `Timelock has not expired yet. Refund will be available at ${new Date(timelock * 1000).toISOString()}.`,
      evmRefundData: {
        to: refundData.to,
        data: refundData.data,
        timelockExpired,
        timelockExpiry: timelock,
      },
    };
  }

  /**
   * Builds refund data for an EVM-to-Bitcoin swap via the coordinator.
   * Same pattern as EVM-to-Arkade: uses the coordinator refund-and-swap-calldata endpoint.
   * @internal
   */
  async #buildEvmToBitcoinRefund(
    id: string,
    swap: GetSwapResponse,
  ): Promise<RefundResult> {
    const evmSwap = swap as EvmToBitcoinSwapResponse & {
      direction: "evm_to_bitcoin";
    };

    const timelock = evmSwap.evm_refund_locktime;
    const now = Math.floor(Date.now() / 1000);
    const timelockExpired = now >= timelock;

    // Fetch coordinator refund calldata from server (default mode: swap-back)
    const response = await this.#apiClient.GET(
      "/swap/{id}/refund-and-swap-calldata",
      {
        params: {
          path: { id },
          query: { mode: "swap-back" },
        },
      },
    );

    if (response.error) {
      return {
        success: false,
        message: `Failed to fetch refund calldata: ${response.error.error || "Unknown error"}`,
      };
    }

    const { coordinator_address, calldata } = response.data;

    return {
      success: true,
      message: timelockExpired
        ? "EVM refund calldata ready. Submit this transaction with your EVM wallet."
        : `Timelock has not expired yet. Refund will be available at ${new Date(timelock * 1000).toISOString()}.`,
      evmRefundData: {
        to: coordinator_address,
        data: calldata,
        timelockExpired,
        timelockExpiry: timelock,
      },
    };
  }

  // =========================================================================
  // Swap Creation - BTC to EVM
  // =========================================================================

  /**
   * Gets the context object for swap creation functions.
   * @internal
   */
  #getCreateContext(): CreateSwapContext {
    return {
      apiClient: this.#apiClient,
      baseUrl: this.#config.baseUrl,
      deriveSwapParams: () => this.deriveSwapParams(),
      storeSwap: (swapId, swapParams, response) =>
        this.#storeSwap(swapId, swapParams, response),
    };
  }

  /**
   * Stores a swap in the configured swap storage.
   * @internal
   */
  async #storeSwap(
    swapId: string,
    swapParams: SwapParams,
    response: GetSwapResponse,
  ): Promise<void> {
    if (!this.#swapStorage) return;

    const storedSwap: StoredSwap = {
      version: SWAP_STORAGE_VERSION,
      swapId,
      keyIndex: swapParams.keyIndex,
      response,
      publicKey: bytesToHex(swapParams.publicKey),
      preimage: bytesToHex(swapParams.preimage),
      preimageHash: bytesToHex(swapParams.preimageHash),
      secretKey: bytesToHex(swapParams.secretKey),
      storedAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.#swapStorage.store(storedSwap);
  }

  /**
   * @deprecated Use `createArkadeToEvmSwapGeneric` instead. Chain-specific endpoints have been removed.
   */
  async createArkadeToEvmSwap(
    _options: BtcToEvmSwapOptions,
  ): Promise<BtcToEvmSwapResult> {
    throw new Error(
      "createArkadeToEvmSwap is deprecated. Use createArkadeToEvmSwapGeneric instead.",
    );
  }

  /**
   * Creates a new Arkade-to-EVM swap via the generic chain-agnostic endpoint.
   *
   * Uses the `/swap/arkade/evm` endpoint which supports any ERC-20 token
   * reachable through 1inch aggregation. Returns coordinator address and
   * optional 1inch calldata for the redeem-and-swap flow.
   *
   * @param options - The swap options.
   * @returns The swap response and parameters for storage.
   * @throws Error if the swap creation fails.
   *
   * @example
   * ```ts
   * const result = await client.createArkadeToEvmSwapGeneric({
   *   targetAddress: "0x1234...",
   *   tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC on Polygon
   *   evmChainId: 137,
   *   sourceAmount: 100000, // 100k sats
   * });
   * console.log("Fund:", result.response.btc_vhtlc_address);
   * console.log("Coordinator:", result.response.evm_coordinator_address);
   * ```
   */
  async createArkadeToEvmSwapGeneric(
    options: ArkadeToEvmSwapOptions,
  ): Promise<ArkadeToEvmSwapResult> {
    return createArkadeToEvmSwapGeneric(options, this.#getCreateContext());
  }

  /**
   * Creates a new Lightning to EVM swap.
   *
   * Automatically derives swap parameters and increments the key index.
   *
   * @param options - The swap options.
   * @returns The swap response and parameters for storage.
   * @throws Error if the swap creation fails.
   *
   * @example
   * ```ts
   * const result = await client.createLightningToEvmSwap({
   *   targetAddress: "0x1234...",
   *   targetToken: "usdc_pol",
   *   targetChain: "polygon",
   *   sourceAmount: 100000, // 100k sats
   * });
   * console.log("Pay this invoice:", result.response.ln_invoice);
   * ```
   */
  async createLightningToEvmSwap(
    options: BtcToEvmSwapOptions,
  ): Promise<BtcToEvmSwapResult> {
    return createLightningToEvmSwap(options, this.#getCreateContext());
  }

  /**
   * Creates a new Lightning to EVM swap using the generic chain-agnostic endpoint.
   *
   * @param options - The swap options including evmChainId and tokenAddress.
   * @returns The swap response and parameters for storage.
   */
  async createLightningToEvmSwapGeneric(
    options: LightningToEvmSwapGenericOptions,
  ): Promise<LightningToEvmSwapGenericResult> {
    return createLightningToEvmSwapGeneric(options, this.#getCreateContext());
  }

  /**
   * Creates a new Bitcoin (on-chain) to EVM swap.
   *
   * Automatically derives swap parameters and increments the key index.
   *
   * @param options - The swap options.
   * @returns The swap response and parameters for storage.
   * @throws Error if the swap creation fails.
   *
   * @example
   * ```ts
   * const result = await client.createBitcoinToEvmSwap({
   *   targetAddress: "0x1234...",
   *   tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC on Polygon
   *   evmChainId: 137,
   *   sourceAmount: 100000, // 100k sats
   * });
   * console.log("Send BTC to:", result.response.btc_htlc_address);
   * ```
   */
  async createBitcoinToEvmSwap(
    options: BitcoinToEvmSwapOptions,
  ): Promise<BitcoinToEvmSwapResult> {
    return createBitcoinToEvmSwap(options, this.#getCreateContext());
  }

  // =========================================================================
  // Swap Creation - Bitcoin (on-chain) to Arkade
  // =========================================================================

  /**
   * Creates a new Bitcoin (on-chain) to Arkade swap.
   *
   * The user sends on-chain BTC to a Taproot HTLC address and receives
   * Arkade VTXOs after the server funds the Arkade VHTLC.
   *
   * Automatically derives swap parameters and increments the key index.
   *
   * @param options - The swap options.
   * @returns The swap response and parameters for storage.
   * @throws Error if the swap creation fails.
   *
   * @example
   * ```ts
   * const result = await client.createBitcoinToArkadeSwap({
   *   satsReceive: 100000, // 100k sats to receive on Arkade
   *   targetAddress: "ark1q...", // Arkade address
   * });
   * console.log("Send BTC to:", result.response.btc_htlc_address);
   * console.log("Amount to send:", result.response.source_amount, "sats");
   * ```
   */
  async createBitcoinToArkadeSwap(
    options: BitcoinToArkadeSwapOptions,
  ): Promise<BitcoinToArkadeSwapResult> {
    return createBitcoinToArkadeSwap(options, this.#getCreateContext());
  }

  // =========================================================================
  // Swap Creation - EVM to Arkade
  // =========================================================================

  /**
   * Creates a new EVM to Arkade swap.
   *
   * This allows users to swap ERC-20 tokens (USDC, USDT, etc.) from EVM chains
   * to receive BTC on Arkade.
   *
   * Automatically derives swap parameters and increments the key index.
   *
   * @param options - The swap options.
   * @returns The swap response and parameters for storage.
   * @throws Error if the swap creation fails.
   *
   * @example
   * ```ts
   * const result = await client.createEvmToArkadeSwap({
   *   sourceChain: "polygon",
   *   sourceToken: "usdc_pol",
   *   sourceAmount: 100.0, // 100 USDC
   *   targetAddress: "ark1q...", // Arkade address
   *   userAddress: "0x1234...", // EVM wallet address
   * });
   * console.log("Approve token:", result.response.source_token_address);
   * console.log("HTLC contract:", result.response.htlc_address_evm);
   * ```
   */
  /**
   * @deprecated Use `createEvmToArkadeSwapGeneric` instead. Chain-specific endpoints have been removed.
   */
  async createEvmToArkadeSwap(
    _options: EvmToArkadeSwapOptions,
  ): Promise<EvmToArkadeSwapResult> {
    throw new Error(
      "createEvmToArkadeSwap is deprecated. Use createEvmToArkadeSwapGeneric instead.",
    );
  }

  /**
   * Creates a new EVM-to-Arkade swap via the generic endpoint.
   *
   * Uses the chain-agnostic `/swap/evm/arkade` endpoint which supports any
   * ERC-20 token reachable through 1inch aggregation.
   *
   * @param options - The swap options.
   * @returns The swap response and parameters for storage.
   * @throws Error if the swap creation fails.
   *
   * @example
   * ```ts
   * const result = await client.createEvmToArkadeSwapGeneric({
   *   targetAddress: "ark1q...",
   *   tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC on Polygon
   *   evmChainId: 137,
   *   userAddress: "0x1234...",
   *   sourceAmount: 100000000, // 100 USDC (6 decimals)
   * });
   * console.log("HTLC:", result.response.evm_htlc_address);
   * ```
   */
  async createEvmToArkadeSwapGeneric(
    options: EvmToArkadeSwapGenericOptions,
  ): Promise<EvmToArkadeSwapGenericResult> {
    return createEvmToArkadeSwapGeneric(options, this.#getCreateContext());
  }

  /**
   * Creates a new EVM-to-Bitcoin (on-chain) swap.
   *
   * Uses the chain-agnostic `/swap/evm/bitcoin` endpoint which supports any
   * ERC-20 token reachable through 1inch aggregation. The user locks tokens
   * in an EVM HTLC and receives BTC to an on-chain Taproot HTLC.
   *
   * @param options - The swap options.
   * @returns The swap response and parameters for storage.
   * @throws Error if the swap creation fails.
   *
   * @example
   * ```ts
   * const result = await client.createEvmToBitcoinSwap({
   *   tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC on Polygon
   *   evmChainId: 137,
   *   userAddress: "0x1234...",
   *   sourceAmount: 100000000n, // 100 USDC (6 decimals)
   * });
   * console.log("EVM HTLC:", result.response.evm_htlc_address);
   * console.log("BTC HTLC:", result.response.btc_htlc_address);
   * ```
   */
  async createEvmToBitcoinSwap(
    options: EvmToBitcoinSwapOptions,
  ): Promise<EvmToBitcoinSwapResult> {
    return createEvmToBitcoinSwap(options, this.#getCreateContext());
  }

  /**
   * Creates a new EVM to Lightning swap.
   *
   * This allows users to swap ERC-20 tokens (USDC, USDT, etc.) from EVM chains
   * to pay a Lightning invoice.
   *
   * @param options - The swap options including bolt11 invoice.
   * @returns The swap response and parameters for storage.
   * @throws Error if the swap creation fails.
   *
   * @example
   * ```ts
   * const result = await client.createEvmToLightningSwap({
   *   sourceChain: "polygon",
   *   sourceToken: "usdc_pol",
   *   bolt11Invoice: "lnbc...", // Lightning invoice to pay
   *   userAddress: "0x1234...", // EVM wallet address
   * });
   * console.log("Approve token:", result.response.source_token_address);
   * console.log("HTLC contract:", result.response.htlc_address_evm);
   * ```
   */
  async createEvmToLightningSwap(
    options: EvmToLightningSwapOptions,
  ): Promise<EvmToLightningSwapResult> {
    return createEvmToLightningSwap(options, this.#getCreateContext());
  }

  // =========================================================================
  // EVM HTLC Funding Helpers
  // =========================================================================

  /**
   * Gets the call data needed to fund an EVM-to-Arkade/Lightning swap.
   *
   * Returns both:
   * 1. `approve` - ERC20 approve call data (computed locally)
   * 2. `createSwap` - HTLC createSwap call data (from server)
   *
   * @param swapId - The UUID of the swap.
   * @param tokenDecimals - Decimals of the source token (e.g., 6 for USDC).
   * @param approveMax - If true, approves max uint256. If false, approves exact amount. Default: true.
   * @returns The approve and createSwap call data.
   *
   * @example
   * ```ts
   * const swap = await client.createEvmToArkadeSwap({...});
   *
   * // Get funding call data
   * const funding = await client.getEvmFundingCallData(swap.response.id, 6);
   *
   * // Step 1: Approve token spend
   * await wallet.sendTransaction({
   *   to: funding.approve.to,
   *   data: funding.approve.data,
   * });
   *
   * // Step 2: Create the swap
   * await wallet.sendTransaction({
   *   to: funding.createSwap.to,
   *   data: funding.createSwap.data,
   * });
   * ```
   */
  async getEvmFundingCallData(
    swapId: string,
    tokenDecimals: number,
    approveMax = true,
  ): Promise<EvmFundingCallData> {
    const swap = await this.getSwap(swapId);

    if (swap.direction !== "evm_to_btc" && swap.direction !== "evm_to_arkade") {
      throw new Error(
        `Expected evm_to_btc swap, got ${swap.direction}. Even funding call data method is for EVM-to-Arkade/Lightning swaps.`,
      );
    }

    const evmSwap = swap as EvmToBtcSwapResponse & { direction: "evm_to_btc" };

    if (!evmSwap.create_swap_tx) {
      throw new Error("Server did not return create_swap_tx call data");
    }

    // Calculate approve amount
    const exactAmount = BigInt(
      Math.floor(evmSwap.source_amount * 10 ** tokenDecimals),
    );
    const maxUint256 = BigInt(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    );
    const approveAmount = approveMax ? maxUint256 : exactAmount;

    // Build approve call data locally
    const approve = encodeApproveCallData(
      evmSwap.source_token_address,
      evmSwap.htlc_address_evm,
      approveAmount,
    );

    return {
      approve: {
        to: approve.to,
        data: approve.data,
      },
      createSwap: {
        to: evmSwap.htlc_address_evm,
        data: evmSwap.create_swap_tx,
      },
    };
  }

  /**
   * Gets call data for refunding an EVM HTLC.
   *
   * For EVM-to-Arkade/Lightning swaps, if the swap times out (server doesn't
   * complete it), users can refund their tokens by calling refundSwap on
   * the HTLC contract.
   *
   * @param swapId - The UUID of the swap.
   * @returns The refund call data.
   *
   * @example
   * ```ts
   * // Get refund call data
   * const refund = await client.getEvmRefundCallData(swapId);
   *
   * // Submit the refund transaction
   * await wallet.sendTransaction({
   *   to: refund.to,
   *   data: refund.data,
   * });
   * ```
   */
  async getEvmRefundCallData(swapId: string): Promise<{
    to: string;
    data: string;
    timelockExpired: boolean;
    timelockExpiry: number;
  }> {
    // Try to get from storage first
    const storedSwap = this.#swapStorage
      ? await this.#swapStorage.get(swapId)
      : null;

    const swap = storedSwap?.response ?? (await this.getSwap(swapId));

    if (swap.direction !== "evm_to_btc" && swap.direction !== "evm_to_arkade") {
      throw new Error(
        `Expected evm_to_btc swap, got ${swap.direction}. Evm refund call data is for EVM-to-Arkade/Lightning swaps.`,
      );
    }

    const evmSwap = swap as EvmToBtcSwapResponse;
    const htlcAddress = evmSwap.htlc_address_evm;
    const timelock = evmSwap.evm_refund_locktime;

    const now = Math.floor(Date.now() / 1000);
    const timelockExpired = now >= timelock;

    const refundData = encodeRefundSwapCallData(htlcAddress, swapId);

    return {
      to: refundData.to,
      data: refundData.data,
      timelockExpired,
      timelockExpiry: timelock,
    };
  }

  // =========================================================================
  // Coordinator Funding (EVM-to-BTC via DEX + HTLC)
  // =========================================================================

  /**
   * Gets call data to fund an EVM-to-BTC swap via the HTLCCoordinator.
   *
   * The coordinator atomically swaps source tokens (e.g. USDC) to WBTC via DEX
   * and locks the WBTC into an HTLC in a single transaction.
   *
   * Fetches the coordinator calldata from the server, which builds the 1inch
   * swap calldata and computes the refundCallsHash.
   *
   * @param swapId - The UUID of the swap.
   * @param tokenDecimals - Decimals of the source token (e.g., 6 for USDC).
   * @param approveMax - If true, approves max uint256. If false, approves exact amount. Default: true.
   * @returns The approve and executeAndCreate call data.
   *
   * @example
   * ```ts
   * const swap = await client.createEvmToArkadeSwap({...});
   * const funding = await client.getCoordinatorFundingCallData(swap.response.id, 6);
   *
   * // Step 1: Approve source token to coordinator
   * await wallet.sendTransaction({ to: funding.approve.to, data: funding.approve.data });
   *
   * // Step 2: Execute swap + create HTLC
   * await wallet.sendTransaction({ to: funding.executeAndCreate.to, data: funding.executeAndCreate.data });
   * ```
   */
  async getCoordinatorFundingCallData(
    swapId: string,
    tokenDecimals: number,
    approveMax = true,
  ): Promise<CoordinatorFundingCallData> {
    const swap = await this.getSwap(swapId);

    if (
      swap.direction !== "evm_to_btc" &&
      swap.direction !== "evm_to_arkade" &&
      swap.direction !== "evm_to_bitcoin"
    ) {
      throw new Error(
        `Expected evm_to_btc/evm_to_arkade/evm_to_bitcoin swap, got ${swap.direction}. Coordinator fund call data method is for EVM-sourced swaps via coordinator.`,
      );
    }

    // Get source amount based on swap direction
    // For evm_to_arkade/evm_to_bitcoin: source_amount is already in smallest units (integer)
    // For evm_to_btc: source_amount is in human-readable units (decimal)
    let exactAmount: bigint;
    if (
      swap.direction === "evm_to_arkade" ||
      swap.direction === "evm_to_bitcoin"
    ) {
      const evmSwap = swap as GetSwapResponse & {
        source_amount: number;
      };
      exactAmount = BigInt(evmSwap.source_amount);
    } else {
      const evmSwap = swap as EvmToBtcSwapResponse & {
        direction: "evm_to_btc";
      };
      exactAmount = BigInt(
        Math.floor(evmSwap.source_amount * 10 ** tokenDecimals),
      );
    }

    // Fetch coordinator funding calldata from server
    const baseUrl = this.#config.baseUrl.replace(/\/$/, "");
    const url = `${baseUrl}/swap/${swapId}/swap-and-lock-calldata`;
    const headers: Record<string, string> = {};
    if (this.#config.apiKey) {
      headers["X-API-Key"] = this.#config.apiKey;
    }

    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(
        `Failed to get coordinator funding calldata: ${resp.status} ${body}`,
      );
    }

    const serverData = (await resp.json()) as {
      coordinator_address: string;
      source_token_address: string;
      approve_amount: string;
      execute_and_create_calldata: string;
    };

    // Build approve call data: approve source token to coordinator
    const maxUint256 = BigInt(
      "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    );
    const approveAmount = approveMax ? maxUint256 : exactAmount;

    const approve = encodeApproveCallData(
      serverData.source_token_address,
      serverData.coordinator_address,
      approveAmount,
    );

    return {
      approve: {
        to: approve.to,
        data: approve.data,
      },
      executeAndCreate: {
        to: serverData.coordinator_address,
        data: serverData.execute_and_create_calldata,
      },
    };
  }

  /**
   * Gets call data for refunding an EVM HTLC created via the coordinator.
   *
   * Two modes:
   * - `"swap-back"`: calls `refundAndExecute` to swap WBTC back to source token via DEX
   * - `"direct"`: calls `refundTo` to get WBTC directly
   *
   * Both are permissionless — anyone can call after the timelock expires.
   *
   * @param swapId - The UUID of the swap.
   * @param mode - `"swap-back"` to reverse the DEX swap, or `"direct"` to get WBTC.
   * @returns The refund call data.
   */
  async getCoordinatorRefundCallData(
    swapId: string,
    mode: "swap-back" | "direct",
  ): Promise<CoordinatorRefundCallData> {
    const swap = await this.getSwap(swapId);

    if (swap.direction !== "evm_to_btc") {
      throw new Error(
        `Expected evm_to_btc swap, got ${swap.direction}. Coordinator refund call data method is for EVM-to-Arkade/Lightning swaps via coordinator.`,
      );
    }

    const evmSwap = swap as EvmToBtcSwapResponse;
    const timelock = evmSwap.evm_refund_locktime;
    const now = Math.floor(Date.now() / 1000);
    const timelockExpired = now >= timelock;

    if (mode === "direct") {
      // refundTo — get WBTC directly, no DEX swap
      // We need to fetch swap details from server to get coordinator address and HTLC params
      const baseUrl = this.#config.baseUrl.replace(/\/$/, "");
      const url = `${baseUrl}/swap/${swapId}/refund-and-swap-calldata?mode=direct`;
      const headers: Record<string, string> = {};
      if (this.#config.apiKey) {
        headers["X-API-Key"] = this.#config.apiKey;
      }

      const resp = await fetch(url, { headers });
      if (!resp.ok) {
        const body = await resp.text();
        throw new Error(
          `Failed to get coordinator refund calldata: ${resp.status} ${body}`,
        );
      }

      const serverData = (await resp.json()) as {
        coordinator_address: string;
        calldata: string;
      };

      return {
        to: serverData.coordinator_address,
        data: serverData.calldata,
        timelockExpired,
        timelockExpiry: timelock,
        mode,
      };
    }

    // swap-back mode — refundAndExecute with reverse DEX swap
    const baseUrl = this.#config.baseUrl.replace(/\/$/, "");
    const url = `${baseUrl}/swap/${swapId}/refund-and-swap-calldata?mode=swap-back`;
    const headers: Record<string, string> = {};
    if (this.#config.apiKey) {
      headers["X-API-Key"] = this.#config.apiKey;
    }

    const resp = await fetch(url, { headers });
    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(
        `Failed to get coordinator refund calldata: ${resp.status} ${body}`,
      );
    }

    const serverData = (await resp.json()) as {
      coordinator_address: string;
      calldata: string;
    };

    return {
      to: serverData.coordinator_address,
      data: serverData.calldata,
      timelockExpired,
      timelockExpiry: timelock,
      mode,
    };
  }
}
