export const VERSION = "0.0.1";

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
  ClaimGelatoResponse,
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
export type {
  BitcoinToEvmSwapOptions,
  BitcoinToEvmSwapResponse,
  BitcoinToEvmSwapResult,
  BtcToEvmSwapOptions,
  BtcToEvmSwapResult,
  ClaimResult,
  ClientConfig,
  EthereumClaimData,
  EvmChain,
  EvmToArkadeSwapOptions,
  EvmToArkadeSwapResult,
  OnchainRefundOptions,
  RefundResult,
} from "./client.js";
// Main client
export { Client, ClientBuilder } from "./client.js";
// Refund module
export {
  type BitcoinNetwork,
  buildOnchainRefundTransaction,
  computeHash160,
  type OnchainRefundParams,
  type OnchainRefundResult,
  verifyHtlcAddress,
} from "./refund/index.js";
export type { SwapParams } from "./signer/index.js";
// Signer (HD wallet key derivation)
export { bytesToHex, hexToBytes, Signer } from "./signer/index.js";
// IndexedDB storage (browser)
export {
  IdbSwapStorage,
  IdbWalletStorage,
  idbStorageFactory,
} from "./storage/idb.js";
export type {
  StorageFactory,
  StoredSwap,
  SwapStorage,
  WalletStorage,
} from "./storage/index.js";
// Storage interfaces and implementations
export {
  InMemorySwapStorage,
  InMemoryWalletStorage,
  inMemoryStorageFactory,
  SWAP_STORAGE_VERSION,
} from "./storage/index.js";
