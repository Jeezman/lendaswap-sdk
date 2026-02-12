/**
 * Refund module for Lendaswap swaps.
 *
 * Provides refund transaction building for different swap types:
 * - On-chain Bitcoin HTLC refunds (BTC → EVM swaps)
 * - Arkade off-chain VHTLC refunds (Arkade → EVM swaps)
 */

export {
  type ArkadeRefundParams,
  type ArkadeRefundResult,
  buildArkadeRefund,
} from "./arkade.js";
export {
  type BitcoinNetwork,
  buildOnchainClaimTransaction,
  buildOnchainRefundTransaction,
  computeHash160,
  type OnchainClaimParams,
  type OnchainClaimResult,
  type OnchainRefundParams,
  type OnchainRefundResult,
  verifyHtlcAddress,
} from "./onchain.js";
