/**
 * Lendaswap Client SDK for TypeScript/JavaScript.
 *
 * This SDK provides a high-level interface for interacting with Lendaswap
 * Bitcoin-to-USDC atomic swaps.
 *
 * @example
 * ```typescript
 * import { Client, ClientBuilder, openIdbDatabase } from '@lendasat/lendaswap-sdk';
 *
 * // Open the IndexedDB database
 * const storage = await openIdbDatabase();
 *
 * // Create client using builder (recommended)
 * const client = Client.builder()
 *   .url('https://apilendaswap.lendasat.com')
 *   .storage(storage)
 *   .network('bitcoin')
 *   .arkadeUrl('https://arkade.computer')
 *   .esploraUrl('https://mempool.space/api')
 *   .build();
 *
 * // Or use the static create method
 * const client2 = await Client.create(
 *   'https://apilendaswap.lendasat.com',
 *   storage,
 *   'bitcoin',
 *   'https://arkade.computer',
 *   'https://mempool.space/api'
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
// Re-export WASM types and API types
export {
  type AssetPair,
  type BtcToArkadeSwapRequest,
  type BtcToArkadeSwapResponse,
  type BtcToEvmSwapResponse,
  type Chain,
  Client,
  ClientBuilder,
  CreateVtxoSwapResult,
  EstimateVtxoSwapResponse,
  type EvmToArkadeSwapRequest,
  type EvmToBtcSwapResponse,
  type EvmToLightningSwapRequest,
  type ExtendedSwapStorageData,
  type ExtendedSwapStorageDataWasm,
  ExtendedVtxoSwapStorageData,
  type GelatoSubmitRequest,
  type GelatoSubmitResponse,
  type GetSwapResponse,
  getLogLevel,
  type IdbStorageHandle,
  type LogLevel,
  type Network,
  type OnchainToEvmSwapRequest,
  type OnchainToEvmSwapResponse,
  openIdbDatabase,
  type QuoteRequest,
  QuoteResponse,
  type RecoveredSwap,
  type RecoverSwapsResponse,
  type SwapRequest,
  SwapStatus,
  swapStatusToString,
  type SwapType,
  setLogLevel,
  TokenId,
  type TokenIdString,
  type TokenInfo,
  Version,
  VhtlcAmounts,
  VtxoSwapParams,
  VtxoSwapResponse,
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
export type { SwapData, SwapParams } from "./types.js";
export {
  type GetUsdPriceOptions,
  getCoinGeckoId,
  getSupportedTokensForUsdPrice,
  getUsdPrice,
  getUsdPrices,
  type UsdPriceResult,
} from "./usd-price.js";
