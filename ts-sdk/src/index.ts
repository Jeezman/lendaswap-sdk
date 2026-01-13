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

export type { NetworkInput } from "./api.js";
// Re-export WASM types that are commonly used
// Storage provider types for Client.create()
// API client
// Re-export WASM types and API types
export {
  type AssetPair,
  type BtcToArkadeSwapRequest,
  type BtcToArkadeSwapResponse,
  type BtcToEvmSwapResponse,
  type Chain,
  Client,
  CreateVtxoSwapResult,
  EstimateVtxoSwapResponse,
  type EvmToArkadeSwapRequest,
  type EvmToBtcSwapResponse,
  type EvmToLightningSwapRequest,
  type ExtendedSwapStorageData,
  type ExtendedSwapStorageDataWasm,
  type ExtendedSwapStorageProvider,
  ExtendedVtxoSwapStorageData,
  type GelatoSubmitRequest,
  type GelatoSubmitResponse,
  type GetSwapResponse,
  getLogLevel,
  type LogLevel,
  type Network,
  type QuoteRequest,
  QuoteResponse,
  type RecoveredSwap,
  type RecoverSwapsResponse,
  type SwapRequest,
  SwapStatus,
  swapStatusToString,
  type SwapStorageProvider,
  type SwapType,
  setLogLevel,
  TokenId,
  type TokenIdString,
  type TokenInfo,
  Version,
  VhtlcAmounts,
  VtxoSwapParams,
  VtxoSwapResponse,
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
export {
  calculateSourceAmount,
  calculateTargetAmount,
  computeExchangeRate,
  selectTierRate,
} from "./price-calculations.js";
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
export type { SwapData, SwapParams } from "./types.js";
export {
  type GetUsdPriceOptions,
  getCoinGeckoId,
  getSupportedTokensForUsdPrice,
  getUsdPrice,
  getUsdPrices,
  type UsdPriceResult,
} from "./usd-price.js";
