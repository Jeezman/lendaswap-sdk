/**
 * EVM utilities for Lendaswap.
 *
 * Provides helpers for encoding call data to interact with EVM HTLC contracts.
 */

export {
  buildRedeemCalls,
  buildRedeemDigest,
  type CoordinatorCall,
  encodeRedeemAndExecute,
  keccak256,
  type RedeemAndExecuteCallData,
  type RedeemAndExecuteParams,
  type RedeemDigestParams,
} from "./coordinator.js";
export {
  type ApproveCallData,
  buildEvmHtlcCallData,
  type CreateSwapCallData,
  type CreateSwapParams,
  encodeApproveCallData,
  encodeCreateSwapCallData,
  encodeRefundSwapCallData,
  type RefundSwapCallData,
  uuidToBytes32,
} from "./htlc.js";
export { deriveEvmAddress, signEvmDigest } from "./signing.js";
