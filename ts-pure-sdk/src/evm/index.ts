/**
 * EVM utilities for Lendaswap.
 *
 * Provides helpers for encoding call data to interact with EVM HTLC contracts.
 */

export {
  buildExecuteAndCreateCalls,
  buildRedeemCalls,
  buildRedeemDigest,
  type CoordinatorCall,
  type ExecuteAndCreateCallData,
  type ExecuteAndCreateParams,
  encodeExecuteAndCreate,
  encodeRedeemAndExecute,
  encodeRefundAndExecute,
  encodeRefundTo,
  keccak256,
  type RedeemAndExecuteCallData,
  type RedeemAndExecuteParams,
  type RedeemDigestParams,
  type RefundAndExecuteParams,
  type RefundToParams,
} from "./coordinator.js";
export {
  type ApproveCallData,
  buildEvmHtlcCallData,
  type CreateSwapCallData,
  type CreateSwapParams,
  encodeApproveCallData,
  encodeCreateSwapCallData,
  encodeHtlcErc20CreateCallData,
  encodeHtlcErc20RefundCallData,
  encodeRefundSwapCallData,
  type HtlcErc20CreateCallData,
  type HtlcErc20CreateParams,
  type HtlcErc20RefundCallData,
  type HtlcErc20RefundParams,
  type RefundSwapCallData,
  uuidToBytes32,
} from "./htlc.js";
export { deriveEvmAddress, signEvmDigest } from "./signing.js";
