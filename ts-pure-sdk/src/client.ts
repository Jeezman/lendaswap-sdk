import {
  createApiClient,
  type ApiClient,
  type AssetPair,
  type GetSwapResponse,
  type QuoteResponse,
  type TokenInfo,
} from "./api/client.js";

const DEFAULT_BASE_URL = "https://apilendaswap.lendasat.com/";

/** Configuration options for the Lendaswap client. */
export interface ClientConfig {
  /** The base URL of the Lendaswap API. */
  baseUrl: string;
  /** Optional API key for authenticated requests. */
  apiKey?: string;
}

/**
 * Builder for creating a Lendaswap client with a fluent API.
 *
 * @example
 * ```ts
 * const client = Client.builder()
 *   .withBaseUrl("https://custom.api.com")
 *   .withApiKey("your-api-key")
 *   .build();
 * ```
 */
export class ClientBuilder {
  #baseUrl: string = DEFAULT_BASE_URL;
  #apiKey?: string;

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
   * Builds and returns the configured Client instance.
   * @returns A new Client instance with the configured options.
   */
  build(): Client {
    return Client.create({
      baseUrl: this.#baseUrl,
      apiKey: this.#apiKey,
    });
  }
}

/**
 * Main client for interacting with the Lendaswap API.
 *
 * @example
 * ```ts
 * // Using builder pattern (recommended)
 * const client = Client.builder()
 *   .withApiKey("your-api-key")
 *   .build();
 *
 * // Using create method
 * const client = Client.create({
 *   baseUrl: "https://apilendaswap.lendasat.com/",
 *   apiKey: "your-api-key",
 * });
 * ```
 */
export class Client {
  readonly #apiClient: ApiClient;
  readonly #config: ClientConfig;

  private constructor(config: ClientConfig) {
    this.#config = config;
    this.#apiClient = createApiClient({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
    });
  }

  /**
   * Creates a new ClientBuilder for fluent configuration.
   * @returns A new ClientBuilder instance.
   */
  static builder(): ClientBuilder {
    return new ClientBuilder();
  }

  /**
   * Creates a new Client with the provided configuration.
   * @param config - The client configuration options.
   * @returns A new Client instance.
   */
  static create(config: ClientConfig): Client {
    return new Client(config);
  }

  /** The underlying typed API client for direct API access. */
  get api(): ApiClient {
    return this.#apiClient;
  }

  /** The base URL of the API. */
  get baseUrl(): string {
    return this.#config.baseUrl;
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
          from: from as "btc_lightning",
          to: to as "btc_lightning",
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
   * @returns A promise that resolves to the swap details.
   * @throws Error if the request fails or swap is not found.
   */
  async getSwap(id: string): Promise<GetSwapResponse> {
    const { data, error } = await this.#apiClient.GET("/swap/{id}", {
      params: { path: { id } },
    });
    if (error) {
      throw new Error(`Failed to get swap: ${JSON.stringify(error)}`);
    }
    if (!data) {
      throw new Error("No swap data returned");
    }
    return data;
  }
}
