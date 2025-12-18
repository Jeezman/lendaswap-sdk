/**
 * Lendaswap Client SDK for TypeScript/JavaScript.
 *
 * This SDK provides a high-level interface for interacting with Lendaswap
 * Bitcoin-to-USDC atomic swaps.
 *
 * @example
 * ```typescript
 * import {
 *   Client,
 *   createDexieWalletStorage,
 *   createDexieSwapStorage,
 *   createDexieVtxoSwapStorage,
 * } from '@lendasat/lendaswap-sdk';
 *
 * // Create storage providers using Dexie (IndexedDB)
 * const walletStorage = createDexieWalletStorage();
 * const swapStorage = createDexieSwapStorage();
 * const vtxoSwapStorage = createDexieVtxoSwapStorage();
 *
 * // Create client
 * const client = await Client.create(
 *   'https://apilendaswap.lendasat.com',
 *   walletStorage,
 *   swapStorage,
 *   vtxoSwapStorage,
 *   'bitcoin',
 *   'https://arkade.computer'
 * );
 *
 * // Initialize wallet (generates mnemonic if needed)
 * await client.init();
 *
 * // Get asset pairs
 * const pairs = await client.getAssetPairs();
 * ```
 *
 * @packageDocumentation
 */

// Re-export WASM types that are commonly used
// Storage provider types for Client.create()
export type {
  ExtendedSwapStorageProvider,
  QuoteResponse,
  Version,
} from "./api.js";
// API client
export {
  type AssetPair,
  type BtcToEvmSwapResponse,
  type Chain,
  Client,
  CreateVtxoSwapResult,
  EstimateVtxoSwapResponse,
  type EvmToArkadeSwapRequest,
  type EvmToBtcSwapResponse,
  type EvmToLightningSwapRequest,
  type ExtendedSwapStorageData,
  ExtendedVtxoSwapStorageData,
  type ExtendedVtxoSwapStorageDataPlain,
  type GelatoSubmitRequest,
  type GelatoSubmitResponse,
  type GetSwapResponse,
  getLogLevel,
  type LogLevel,
  type QuoteRequest,
  type QuoteResponseInfo,
  type RecoveredSwap,
  type RecoverSwapsResponse,
  type SwapCommonFields,
  type SwapParamsData,
  type SwapRequest,
  type SwapStatus,
  type SwapStorageProvider,
  setLogLevel,
  TokenId,
  type TokenIdString,
  type TokenInfo,
  type VersionInfo,
  VtxoSwapParams,
  VtxoSwapResponse,
  type VtxoSwapResponseData,
  type VtxoSwapStatus,
  type VtxoSwapStorageProvider,
  type WalletStorageProvider,
} from "./api.js";
export {
  PriceFeedService,
  type PriceTiers,
  type PriceUpdateCallback,
  type PriceUpdateMessage,
  type TradingPairPrices,
} from "./price-feed.js";
// Storage (wallet data)
// Swap storage (typed swap data using Dexie/IndexedDB)
// VTXO swap storage (typed VTXO swap data using Dexie/IndexedDB)
// Wallet storage (typed wallet data using Dexie/IndexedDB)
export {
  createDexieSwapStorage,
  createDexieVtxoSwapStorage,
  createDexieWalletStorage,
  DexieSwapStorageProvider,
  DexieVtxoSwapStorageProvider,
  DexieWalletStorageProvider,
  STORAGE_KEYS,
} from "./storage/index.js";
export type { Network, SwapData, SwapParams, VhtlcAmounts } from "./types.js";
export {
  type GetUsdPriceOptions,
  getCoinGeckoId,
  getSupportedTokensForUsdPrice,
  getUsdPrice,
  getUsdPrices,
  type UsdPriceResult,
} from "./usd-price.js";
