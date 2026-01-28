/**
 * Refund module for Lendaswap swaps.
 *
 * Provides refund transaction building for different swap types:
 * - On-chain Bitcoin HTLC refunds (BTC → EVM swaps)
 * - Arkade off-chain refunds (future)
 */

export {
  type BitcoinNetwork,
  buildOnchainRefundTransaction,
  computeHash160,
  type OnchainRefundParams,
  type OnchainRefundResult,
  verifyHtlcAddress,
} from "./onchain.js";
