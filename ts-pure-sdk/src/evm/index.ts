/**
 * EVM utilities for Lendaswap.
 *
 * Provides helpers for encoding call data to interact with EVM HTLC contracts.
 */

export {
  type ApproveCallData,
  buildEvmHtlcCallData,
  type CreateSwapCallData,
  type CreateSwapParams,
  encodeApproveCallData,
  encodeCreateSwapCallData,
  uuidToBytes32,
} from "./htlc.js";
