import createClient from "openapi-fetch";
import type { components, paths } from "../generated/api.js";

export type ApiClient = ReturnType<typeof createClient<paths>>;

export type { paths, components };

// Re-export commonly used types for convenience
export type TokenId = components["schemas"]["TokenId"];
export type TokenInfo = components["schemas"]["TokenInfo"];
export type TokenInfos = components["schemas"]["TokenInfos"];
export type SwapStatus = components["schemas"]["SwapStatus"];
export type QuoteResponse = components["schemas"]["QuoteResponse"];
export type Chain = components["schemas"]["Chain"];
export type GetSwapResponse = components["schemas"]["GetSwapResponse"];
export type BtcToEvmSwapResponse =
  components["schemas"]["BtcToEvmSwapResponse"];
export type EvmToBtcSwapResponse =
  components["schemas"]["EvmToBtcSwapResponse"];
export type BtcToArkadeSwapResponse =
  components["schemas"]["BtcToArkadeSwapResponse"];
export type EvmToArkadeSwapResponse =
  components["schemas"]["EvmToArkadeSwapResponse"];

// Lightning swap request types (still chain-specific)
export type LightningToPolygonSwapRequest =
  components["schemas"]["LightningToPolygonSwapRequest"];
export type LightningToEthereumSwapRequest =
  components["schemas"]["LightningToEthereumSwapRequest"];
export type LightningToArbitrumSwapRequest =
  components["schemas"]["LightningToArbitrumSwapRequest"];

// Gasless claim types
export type ClaimGaslessRequest = components["schemas"]["ClaimGaslessRequest"];
export type ClaimGaslessResponse =
  components["schemas"]["ClaimGaslessResponse"];

// Arkade-to-EVM (generic endpoint) types
export type ArkadeToEvmSwapRequest =
  components["schemas"]["ArkadeToEvmSwapRequest"];
export type ArkadeToEvmSwapResponse =
  components["schemas"]["ArkadeToEvmSwapResponse"];
export type DexCallData = components["schemas"]["DexCallData"];

// Bitcoin-to-EVM (generic endpoint) types
export type BitcoinToEvmSwapRequest =
  components["schemas"]["BitcoinToEvmSwapRequest"];
export type BitcoinToEvmSwapResponse =
  components["schemas"]["BitcoinToEvmSwapResponse"];

// EVM-to-Arkade (generic endpoint) types
export type EvmToArkadeGenericSwapRequest =
  components["schemas"]["EvmToArkadeGenericSwapRequest"];
export type EvmToArkadeGenericSwapResponse =
  components["schemas"]["EvmToArkadeGenericSwapResponse"];

// EVM-to-Bitcoin (generic endpoint) types
export type EvmToBitcoinSwapRequest =
  components["schemas"]["EvmToBitcoinSwapRequest"];
export type EvmToBitcoinSwapResponse =
  components["schemas"]["EvmToBitcoinSwapResponse"];

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
