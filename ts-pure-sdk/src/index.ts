export const VERSION = "0.0.1";

// Main client
export { Client, ClientBuilder } from "./client.js";
export type { ClientConfig } from "./client.js";

// API types
export type {
  ApiClient,
  ApiClientOptions,
  ArkadeToArbitrumSwapRequest,
  ArkadeToEthereumSwapRequest,
  // Request types
  ArkadeToPolygonSwapRequest,
  AssetPair,
  BitcoinToArbitrumSwapRequest,
  BitcoinToEthereumSwapRequest,
  BitcoinToPolygonSwapRequest,
  BtcToArkadeSwapResponse,
  BtcToEvmSwapResponse,
  ClaimGelatoRequest,
  components,
  EvmToBtcSwapResponse,
  GetSwapResponse,
  LightningToArbitrumSwapRequest,
  LightningToEthereumSwapRequest,
  LightningToPolygonSwapRequest,
  OnchainToEvmSwapResponse,
  // Types
  paths,
  QuoteResponse,
  SwapStatus,
  TokenId,
  TokenInfo,
} from "./api/client.js";
// API client
export { createApiClient } from "./api/client.js";
