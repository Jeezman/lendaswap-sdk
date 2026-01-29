import {
  type ApiClient,
  type AssetPair,
  type BtcToEvmSwapResponse,
  createApiClient,
  type EvmToBtcSwapResponse,
  type GetSwapResponse,
  type OnchainToEvmSwapResponse,
  type QuoteResponse,
  type TokenInfo,
} from "./api/client.js";
import {
  type BitcoinToEvmSwapOptions,
  type BitcoinToEvmSwapResult,
  type BtcToEvmSwapOptions,
  type BtcToEvmSwapResult,
  type CreateSwapContext,
  createArkadeToEvmSwap,
  createBitcoinToEvmSwap,
  createEvmToArkadeSwap,
  createEvmToLightningSwap,
  createLightningToEvmSwap,
  type EvmToArkadeSwapOptions,
  type EvmToArkadeSwapResult,
  type EvmToLightningSwapOptions,
  type EvmToLightningSwapResult,
} from "./create/index.js";
import { broadcastTransaction, findOutputByAddress } from "./esplora.js";
import { encodeApproveCallData } from "./evm/index.js";
import {
  buildArkadeClaim,
  type ClaimResult,
  claim as redeemClaim,
} from "./redeem/index.js";
import {
  type BitcoinNetwork,
  buildArkadeRefund,
  buildOnchainRefundTransaction,
  verifyHtlcAddress,
} from "./refund/index.js";
import { bytesToHex, Signer, type SwapParams } from "./signer/index.js";
import {
  type StoredSwap,
  SWAP_STORAGE_VERSION,
  type SwapStorage,
  type WalletStorage,
} from "./storage/index.js";

// Re-export types from create module for backwards compatibility
export type {
  BitcoinToEvmSwapOptions,
  BitcoinToEvmSwapResult,
  BtcToEvmSwapOptions,
  BtcToEvmSwapResult,
  EvmChain,
  EvmToArkadeSwapOptions,
  EvmToArkadeSwapResult,
  EvmToLightningSwapOptions,
  EvmToLightningSwapResult,
} from "./create/index.js";
export type { BitcoinToEvmSwapResponse } from "./create/types.js";

// Re-export types from redeem module
export type { ClaimResult, EthereumClaimData } from "./redeem/index.js";

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

/** Options for Arkade (off-chain) claim */
export interface ArkadeClaimOptions {
  /** Destination Arkade address to receive claimed BTC */
  destinationAddress: string;
  /** Arkade server URL (optional, uses default based on network) */
  arkadeServerUrl?: string;
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

  // =========================================================================
  // Redeem
  // =========================================================================

  /**
   * Claims a swap by revealing the preimage.
   *
   * The claim method depends on the target chain:
   * - **Polygon/Arbitrum**: Uses Gelato Relay for gasless execution
   * - **Ethereum**: Returns an error (manual claim required)
   *
   * @param id - The UUID of the swap.
   * @param secret - The preimage/secret (32-byte hex string, with or without 0x prefix).
   * @returns A ClaimResult with the outcome.
   *
   * @example
   * ```ts
   * const result = await client.claim(swapId, storedSwap.preimage);
   * if (result.success) {
   *   console.log("Claim TX:", result.txHash);
   *   console.log("Gelato Task:", result.taskId);
   * } else {
   *   console.error("Claim failed:", result.message);
   * }
   * ```
   */
  async claim(id: string, secret: string): Promise<ClaimResult> {
    return redeemClaim(id, secret, {
      apiClient: this.#apiClient,
      getSwap: (swapId) => this.getSwap(swapId),
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

    // Get swap status from server
    const swap = await this.getSwap(id);

    // Ensure we have an EVM-to-BTC swap (which includes EVM-to-Arkade)
    if (swap.direction !== "evm_to_btc") {
      return {
        success: false,
        message: `Expected evm_to_btc swap, got ${swap.direction}. claimArkade is for EVM-to-Arkade swaps.`,
      };
    }

    // Type assertion - we've verified direction is evm_to_btc
    const evmToArkadeSwap = swap as EvmToBtcSwapResponse & {
      direction: "evm_to_btc";
    };

    // Get stored swap data (contains preimage and secret key)
    const storedSwap = await this.#swapStorage.get(id);
    if (!storedSwap) {
      return {
        success: false,
        message: `Swap ${id} not found in local storage. The preimage is required to claim.`,
      };
    }

    // Get user's x-only public key (32 bytes) from stored swap
    const fullPubKey = storedSwap.publicKey;
    const userPubKey =
      fullPubKey.length === 66 ? fullPubKey.slice(2) : fullPubKey;

    try {
      const result = await buildArkadeClaim({
        userSecretKey: storedSwap.secretKey,
        userPubKey,
        // For claim: lendaswap is SENDER, user is RECEIVER
        // sender_pk from API is the client's key for EVM-to-Arkade swaps
        // receiver_pk from API is lendaswap's key
        lendaswapPubKey: evmToArkadeSwap.sender_pk,
        arkadeServerPubKey: evmToArkadeSwap.server_pk,
        preimage: storedSwap.preimage,
        vhtlcAddress: evmToArkadeSwap.htlc_address_arkade,
        refundLocktime: evmToArkadeSwap.vhtlc_refund_locktime,
        unilateralClaimDelay: evmToArkadeSwap.unilateral_claim_delay,
        unilateralRefundDelay: evmToArkadeSwap.unilateral_refund_delay,
        unilateralRefundWithoutReceiverDelay:
          evmToArkadeSwap.unilateral_refund_without_receiver_delay,
        destinationAddress: options.destinationAddress,
        network: evmToArkadeSwap.network,
        arkadeServerUrl: options.arkadeServerUrl,
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

    // Verify that our computed HTLC address matches the server's address
    const serverHtlcAddress = onchainSwap.btc_htlc_address;
    const addressMatches = verifyHtlcAddress(
      serverHtlcAddress,
      onchainSwap.btc_hash_lock,
      onchainSwap.btc_server_pk,
      userPubKey,
      onchainSwap.btc_refund_locktime,
      network,
    );

    if (!addressMatches) {
      return {
        success: false,
        message:
          `HTLC address mismatch. The computed address does not match the server's address (${serverHtlcAddress}). ` +
          `This could indicate different script construction. ` +
          `Parameters: hashLock=${onchainSwap.btc_hash_lock}, serverPk=${onchainSwap.btc_server_pk}, ` +
          `userPk=${userPubKey}, locktime=${onchainSwap.btc_refund_locktime}, network=${network}`,
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

    const htlcOutput = await findOutputByAddress(
      esploraUrl,
      onchainSwap.btc_fund_txid,
      serverHtlcAddress,
    );

    if (!htlcOutput) {
      return {
        success: false,
        message:
          `Could not find HTLC output in funding transaction ${onchainSwap.btc_fund_txid}. ` +
          `Expected address: ${serverHtlcAddress}`,
      };
    }

    try {
      // Build the refund transaction
      const result = buildOnchainRefundTransaction({
        fundingTxId: onchainSwap.btc_fund_txid,
        fundingVout: htlcOutput.vout,
        htlcAmount: htlcOutput.amount,
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
          htlcAddress: result.htlcAddress,
          serverHtlcAddress,
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
          serverHtlcAddress,
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
          serverHtlcAddress,
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
          serverHtlcAddress,
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
    return createArkadeToEvmSwap(options, this.#getCreateContext());
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
    return createBitcoinToEvmSwap(options, this.#getCreateContext());
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
  async createEvmToArkadeSwap(
    options: EvmToArkadeSwapOptions,
  ): Promise<EvmToArkadeSwapResult> {
    return createEvmToArkadeSwap(options, this.#getCreateContext());
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

    if (swap.direction !== "evm_to_btc") {
      throw new Error(
        `Expected evm_to_btc swap, got ${swap.direction}. This method is for EVM-to-Arkade/Lightning swaps.`,
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
}
