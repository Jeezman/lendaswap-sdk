import createClient from "openapi-fetch";
import type { components, paths } from "../generated/api.js";

export type ApiClient = ReturnType<typeof createClient<paths>>;

export type { paths, components };

// Re-export commonly used types for convenience
export type TokenId = components["schemas"]["TokenId"];
export type TokenInfo = components["schemas"]["TokenInfo"];
export type AssetPair = components["schemas"]["AssetPair"];
export type SwapStatus = components["schemas"]["SwapStatus"];
export type QuoteResponse = components["schemas"]["QuoteResponse"];
export type GetSwapResponse = components["schemas"]["GetSwapResponse"];
export type BtcToEvmSwapResponse =
  components["schemas"]["BtcToEvmSwapResponse"];
export type OnchainToEvmSwapResponse =
  components["schemas"]["OnchainToEvmSwapResponse"];
export type EvmToBtcSwapResponse =
  components["schemas"]["EvmToBtcSwapResponse"];
export type BtcToArkadeSwapResponse =
  components["schemas"]["BtcToArkadeSwapResponse"];

// Request types for btc_to_evm
export type ArkadeToPolygonSwapRequest =
  components["schemas"]["ArkadeToPolygonSwapRequest"];
export type ArkadeToEthereumSwapRequest =
  components["schemas"]["ArkadeToEthereumSwapRequest"];
export type ArkadeToArbitrumSwapRequest =
  components["schemas"]["ArkadeToArbitrumSwapRequest"];
export type LightningToPolygonSwapRequest =
  components["schemas"]["LightningToPolygonSwapRequest"];
export type LightningToEthereumSwapRequest =
  components["schemas"]["LightningToEthereumSwapRequest"];
export type LightningToArbitrumSwapRequest =
  components["schemas"]["LightningToArbitrumSwapRequest"];
export type BitcoinToPolygonSwapRequest =
  components["schemas"]["BitcoinToPolygonSwapRequest"];
export type BitcoinToEthereumSwapRequest =
  components["schemas"]["BitcoinToEthereumSwapRequest"];
export type BitcoinToArbitrumSwapRequest =
  components["schemas"]["BitcoinToArbitrumSwapRequest"];

export type ClaimGelatoRequest = components["schemas"]["ClaimGelatoRequest"];
export type ClaimGelatoResponse = components["schemas"]["ClaimGelatoResponse"];

export interface ApiClientOptions {
  baseUrl: string;
  apiKey?: string;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const headers: Record<string, string> = {};
  if (options.apiKey) {
    headers["X-API-Key"] = options.apiKey;
  }

  return createClient<paths>({
    baseUrl: options.baseUrl,
    headers,
  });
}
