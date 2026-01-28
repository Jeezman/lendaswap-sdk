import {
  type ApiClient,
  type AssetPair,
  type BtcToEvmSwapResponse,
  type ClaimGelatoResponse,
  createApiClient,
  type GetSwapResponse,
  type OnchainToEvmSwapResponse,
  type QuoteResponse,
  type TokenInfo,
} from "./api/client.js";
import {
  type BitcoinNetwork,
  buildArkadeRefund,
  buildOnchainRefundTransaction,
} from "./refund";
import { bytesToHex, Signer, type SwapParams } from "./signer";
import {
  type StoredSwap,
  SWAP_STORAGE_VERSION,
  type SwapStorage,
  type WalletStorage,
} from "./storage";

/** Supported EVM chains for swaps */
export type EvmChain = "polygon" | "arbitrum" | "ethereum";

/** Options for creating an Arkade or Lightning to EVM swap */
export interface BtcToEvmSwapOptions {
  /** Target EVM address to receive tokens */
  targetAddress: string;
  /** Target token ID (e.g., "usdc_pol", "usdt_arb") */
  targetToken: string;
  /** Target EVM chain */
  targetChain: EvmChain;
  /** Amount in satoshis to send (optional if targetAmount is set) */
  sourceAmount?: number;
  /** Amount of target token to receive (optional if sourceAmount is set) */
  targetAmount?: number;
  /** Optional referral code for fee exemption */
  referralCode?: string;
}

/** Options for creating a Bitcoin (on-chain) to EVM swap */
export interface BitcoinToEvmSwapOptions {
  /** Target EVM address to receive tokens */
  targetAddress: string;
  /** Target token ID (e.g., "usdc_pol", "usdt_arb") */
  targetToken: string;
  /** Target EVM chain */
  targetChain: EvmChain;
  /** Amount in satoshis to send */
  sourceAmount: number;
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

/**
 * Union type for Bitcoin on-chain swap responses.
 * Note: The API returns different types for different chains due to spec inconsistency.
 * All chains actually return OnchainToEvmSwapResponse in practice.
 */
export type BitcoinToEvmSwapResponse =
  | BtcToEvmSwapResponse
  | OnchainToEvmSwapResponse;

/** Result of creating a Bitcoin (on-chain) to EVM swap */
export interface BitcoinToEvmSwapResult {
  /** The swap response from the API */
  response: BitcoinToEvmSwapResponse;
  /** The swap parameters used (for storage/recovery) */
  swapParams: SwapParams;
}

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

const DEFAULT_BASE_URL = "https://apilendaswap.lendasat.com/";

/** Default Esplora URLs by network */
const DEFAULT_ESPLORA_URLS: Record<string, string> = {
  mainnet: "https://mempool.space/api",
  testnet: "https://mempool.space/testnet/api",
  signet: "https://mempool.space/signet/api",
};

/** Configuration options for the Lendaswap client. */
export interface ClientConfig {
  /** The base URL of the Lendaswap API. */
  baseUrl: string;
  /** Optional API key for authenticated requests. */
  apiKey?: string;
  /** Optional Esplora API URL for broadcasting Bitcoin transactions. */
  esploraUrl?: string;
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
  readonly #signer: Signer;
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
  async getTokens(): Promise<TokenInfo[]> {
    const { data, error } = await this.#apiClient.GET("/tokens");
    if (error) {
      throw new Error(`Failed to get tokens: ${JSON.stringify(error)}`);
    }
    return data ?? [];
  }

  /**
   * Gets the list of available asset pairs for swapping.
   * @returns A promise that resolves to an array of asset pairs.
   * @throws Error if the request fails.
   */
  async getAssetPairs(): Promise<AssetPair[]> {
    const { data, error } = await this.#apiClient.GET("/asset-pairs");
    if (error) {
      throw new Error(`Failed to get asset pairs: ${JSON.stringify(error)}`);
    }
    return data ?? [];
  }

  // =========================================================================
  // Quotes
  // =========================================================================

  /**
   * Gets a quote for swapping between two tokens.
   * @param from - The source token ID (e.g., "btc_arkade", "btc_lightning").
   * @param to - The target token ID (e.g., "usdc_pol", "usdt_eth").
   * @param baseAmount - The amount to swap in the source token's smallest unit.
   * @returns A promise that resolves to the quote response with pricing details.
   * @throws Error if the request fails.
   */
  async getQuote(
    from: string,
    to: string,
    baseAmount: number,
  ): Promise<QuoteResponse> {
    const { data, error } = await this.#apiClient.GET("/quote", {
      params: {
        query: {
          from: from,
          to: to,
          base_amount: baseAmount,
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
   * Claims a swap using Gelato Relay (gasless execution).
   *
   * This reveals the preimage to claim the EVM HTLC. The server will
   * submit the transaction via Gelato for gasless execution.
   *
   * @param id - The UUID of the swap.
   * @param secret - The preimage/secret (32-byte hex string, with or without 0x prefix).
   * @returns A promise that resolves to the claim response with task ID and tx hash.
   * @throws Error if the swap is not in the correct state or claim fails.
   *
   * @example
   * ```ts
   * const result = await client.claimGelato(swapId, storedSwap.preimage);
   * console.log("Claim TX:", result.tx_hash);
   * console.log("Gelato Task:", result.task_id);
   * ```
   */
  async claimGelato(id: string, secret: string): Promise<ClaimGelatoResponse> {
    const { data, error } = await this.#apiClient.POST(
      "/swap/{id}/claim-gelato",
      {
        params: { path: { id } },
        body: { secret },
      },
    );
    if (error) {
      throw new Error(`Failed to claim swap: ${JSON.stringify(error)}`);
    }
    if (!data) {
      throw new Error("No claim response returned");
    }
    return data;
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
   * - **Arkade to EVM**: Off-chain refund (not yet implemented)
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
  async refundSwap(
    id: string,
    options?: OnchainRefundOptions,
  ): Promise<RefundResult> {
    // Get the swap to determine its type
    const swap = await this.getSwap(id);

    // Determine the source token to identify swap type
    const sourceToken = swap.source_token;

    // Lightning swaps cannot be refunded - they auto-expire
    if (sourceToken === "btc_lightning") {
      return {
        success: false,
        message:
          "Lightning swaps cannot be refunded. If the invoice was paid, " +
          "it will refund automatically.",
      };
    }

    // Arkade swaps require off-chain refund
    if (sourceToken === "btc_arkade") {
      return this.#buildArkadeRefund(id, swap, options as ArkadeRefundOptions);
    }

    // Bitcoin on-chain swaps require on-chain refund transaction
    if (sourceToken === "btc_onchain") {
      return this.#buildOnchainRefund(id, swap, options);
    }

    // Unknown source token
    return {
      success: false,
      message: `Unknown source token type: ${sourceToken}. Cannot determine refund method.`,
    };
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

    // Ensure we have an on-chain swap response
    if (swap.direction !== "onchain_to_evm") {
      return {
        success: false,
        message: `Expected onchain_to_evm swap, got ${swap.direction}`,
      };
    }

    // Type assertion - we've verified direction is onchain_to_evm
    const onchainSwap = swap as OnchainToEvmSwapResponse & {
      direction: "onchain_to_evm";
    };

    // Check if funding transaction exists
    if (!onchainSwap.btc_fund_txid) {
      return {
        success: false,
        message:
          "No funding transaction found. The swap was not funded, so there is nothing to refund.",
      };
    }

    // Check refund locktime
    const now = Math.floor(Date.now() / 1000);
    if (now < onchainSwap.btc_refund_locktime) {
      const remainingSeconds = onchainSwap.btc_refund_locktime - now;
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      return {
        success: false,
        message:
          `Refund is not yet available. The locktime expires in ${remainingMinutes} minutes ` +
          `(at ${new Date(onchainSwap.btc_refund_locktime * 1000).toISOString()}).`,
      };
    }

    // Map network string to BitcoinNetwork type
    const networkMap: Record<string, BitcoinNetwork> = {
      mainnet: "mainnet",
      testnet: "testnet",
      signet: "signet",
      regtest: "regtest",
    };
    const network = networkMap[onchainSwap.network];
    if (!network) {
      return {
        success: false,
        message: `Unknown Bitcoin network: ${onchainSwap.network}`,
      };
    }

    // Get user's x-only public key (32 bytes) from stored swap
    // The stored publicKey is the full compressed pubkey (33 bytes)
    // We need to extract the x-only portion (drop the first byte prefix)
    const fullPubKey = storedSwap.publicKey;
    const userPubKey =
      fullPubKey.length === 66 ? fullPubKey.slice(2) : fullPubKey;

    try {
      // Build the refund transaction
      const result = buildOnchainRefundTransaction({
        fundingTxId: onchainSwap.btc_fund_txid,
        fundingVout: 0, // Assuming output index 0
        htlcAmount: BigInt(onchainSwap.source_amount),
        hashLock: onchainSwap.btc_hash_lock,
        serverPubKey: onchainSwap.btc_server_pk,
        userPubKey,
        userSecretKey: storedSwap.secretKey,
        refundLocktime: onchainSwap.btc_refund_locktime,
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
        };
      }

      // Broadcast the transaction
      const esploraUrl =
        this.#config.esploraUrl ?? DEFAULT_ESPLORA_URLS[network];
      if (!esploraUrl) {
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
        };
      }

      try {
        await this.#broadcastTransaction(esploraUrl, result.txHex);
        return {
          success: true,
          message: "Refund transaction broadcast successfully!",
          txHex: result.txHex,
          txId: result.txId,
          refundAmount: result.refundAmount,
          fee: result.fee,
          broadcast: true,
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
    if (swap.direction !== "btc_to_evm") {
      return {
        success: false,
        message: `Expected btc_to_evm swap, got ${swap.direction}`,
      };
    }

    // Type assertion - we've verified direction is btc_to_evm
    const arkadeSwap = swap as BtcToEvmSwapResponse & {
      direction: "btc_to_evm";
    };

    // Check refund locktime
    const now = Math.floor(Date.now() / 1000);
    if (now < arkadeSwap.vhtlc_refund_locktime) {
      const remainingSeconds = arkadeSwap.vhtlc_refund_locktime - now;
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      return {
        success: false,
        message:
          `Refund is not yet available. The VHTLC locktime expires in ${remainingMinutes} minutes ` +
          `(at ${new Date(arkadeSwap.vhtlc_refund_locktime * 1000).toISOString()}).`,
      };
    }

    // Get user's x-only public key (32 bytes) from stored swap
    // The stored publicKey is the full compressed pubkey (33 bytes)
    // We need to extract the x-only portion (drop the first byte prefix)
    const fullPubKey = storedSwap.publicKey;
    const userPubKey =
      fullPubKey.length === 66 ? fullPubKey.slice(2) : fullPubKey;

    // Parse the hash lock - remove 0x prefix if present
    const hashLock = arkadeSwap.hash_lock.startsWith("0x")
      ? arkadeSwap.hash_lock.slice(2)
      : arkadeSwap.hash_lock;

    try {
      const result = await buildArkadeRefund({
        userSecretKey: storedSwap.secretKey,
        userPubKey,
        lendaswapPubKey: arkadeSwap.receiver_pk,
        arkadeServerPubKey: arkadeSwap.server_pk,
        hashLock,
        vhtlcAddress: arkadeSwap.htlc_address_arkade,
        refundLocktime: arkadeSwap.vhtlc_refund_locktime,
        unilateralClaimDelay: arkadeSwap.unilateral_claim_delay,
        unilateralRefundDelay: arkadeSwap.unilateral_refund_delay,
        unilateralRefundWithoutReceiverDelay:
          arkadeSwap.unilateral_refund_without_receiver_delay,
        destinationAddress: options.destinationAddress,
        network: arkadeSwap.network,
        arkadeServerUrl: options.arkadeServerUrl,
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
   * Broadcasts a raw transaction to the Bitcoin network via Esplora API.
   * @internal
   */
  async #broadcastTransaction(
    esploraUrl: string,
    txHex: string,
  ): Promise<string> {
    const response = await fetch(`${esploraUrl}/tx`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: txHex,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Broadcast failed: ${response.status} - ${errorText}`);
    }

    // Esplora returns the txid on success
    return response.text();
  }

  // =========================================================================
  // Swap Creation - BTC to EVM
  // =========================================================================

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
   * Creates a new Arkade to EVM swap.
   *
   * Automatically derives swap parameters and increments the key index.
   *
   * @param options - The swap options.
   * @returns The swap response and parameters for storage.
   * @throws Error if the swap creation fails.
   *
   * @example
   * ```ts
   * const result = await client.createArkadeToEvmSwap({
   *   targetAddress: "0x1234...",
   *   targetToken: "usdc_pol",
   *   targetChain: "polygon",
   *   sourceAmount: 100000, // 100k sats
   * });
   * console.log("Fund this address:", result.response.htlc_address_arkade);
   * ```
   */
  async createArkadeToEvmSwap(
    options: BtcToEvmSwapOptions,
  ): Promise<BtcToEvmSwapResult> {
    const swapParams = await this.deriveSwapParams();
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

    let response: BtcToEvmSwapResponse;

    switch (options.targetChain) {
      case "polygon": {
        const { data, error } = await this.#apiClient.POST(
          "/swap/arkade/polygon",
          { body },
        );
        if (error)
          throw new Error(`Failed to create swap: ${JSON.stringify(error)}`);
        if (!data) throw new Error("No swap data returned");
        response = data;
        break;
      }
      case "arbitrum": {
        const { data, error } = await this.#apiClient.POST(
          "/swap/arkade/arbitrum",
          { body },
        );
        if (error)
          throw new Error(`Failed to create swap: ${JSON.stringify(error)}`);
        if (!data) throw new Error("No swap data returned");
        response = data;
        break;
      }
      case "ethereum": {
        const { data, error } = await this.#apiClient.POST(
          "/swap/arkade/ethereum",
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
    await this.#storeSwap(response.id, swapParams, {
      ...response,
      direction: "btc_to_evm",
    });

    return { response, swapParams };
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
    const swapParams = await this.deriveSwapParams();
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

    let response: BtcToEvmSwapResponse;

    switch (options.targetChain) {
      case "polygon": {
        const { data, error } = await this.#apiClient.POST(
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
        const { data, error } = await this.#apiClient.POST(
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
        const { data, error } = await this.#apiClient.POST(
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
    await this.#storeSwap(response.id, swapParams, {
      ...response,
      direction: "btc_to_evm",
    });

    return { response, swapParams };
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
   *   targetToken: "usdc_pol",
   *   targetChain: "polygon",
   *   sourceAmount: 100000, // 100k sats
   * });
   * console.log("Send BTC to:", result.response.btc_htlc_address);
   * ```
   */
  async createBitcoinToEvmSwap(
    options: BitcoinToEvmSwapOptions,
  ): Promise<BitcoinToEvmSwapResult> {
    const swapParams = await this.deriveSwapParams();
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

    let response: BitcoinToEvmSwapResponse;

    switch (options.targetChain) {
      case "polygon": {
        const { data, error } = await this.#apiClient.POST(
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
        const { data, error } = await this.#apiClient.POST(
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
        const { data, error } = await this.#apiClient.POST(
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
    await this.#storeSwap(response.id, swapParams, {
      ...response,
      direction: "onchain_to_evm",
    } as GetSwapResponse);

    return { response, swapParams };
  }
}
