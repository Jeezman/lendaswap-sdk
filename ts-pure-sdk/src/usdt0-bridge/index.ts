/**
 * USDT0 bridge module.
 *
 * Provides utilities for bridging USDT0 cross-chain via LayerZero's OFT standard:
 * - LayerZero endpoint ID mappings and USDT0 contract addresses
 * - Address conversion helpers
 */

export {
  LZ_EIDS,
  USDT0_ADDRESSES,
  type Usdt0ChainName,
} from "./constants.js";

export {
  getExplorerUrl as getLzExplorerUrl,
  getMessageStatus as getLzMessageStatus,
  type LayerZeroMessageResult,
  type LayerZeroMessageStatus,
  type TrackMessageOptions as TrackLzMessageOptions,
  trackMessage as trackLzMessage,
} from "./tracking.js";

export {
  addressToBytes32,
  bytes32ToAddress,
  getEid,
  needsBridge,
} from "./utils.js";
