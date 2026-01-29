/**
 * Swap creation module for Lendaswap.
 *
 * Provides swap creation logic for different source types:
 * - Arkade (off-chain) to EVM
 * - Lightning to EVM
 * - Bitcoin (on-chain) to EVM
 * - EVM to Arkade
 */

export { createArkadeToEvmSwap } from "./arkade.js";
export { createBitcoinToEvmSwap } from "./bitcoin.js";
export { createEvmToArkadeSwap } from "./evm-to-arkade.js";
export { createLightningToEvmSwap } from "./lightning.js";
export type {
  BitcoinToEvmSwapOptions,
  BitcoinToEvmSwapResponse,
  BitcoinToEvmSwapResult,
  BtcToEvmSwapOptions,
  BtcToEvmSwapResult,
  CreateSwapContext,
  EvmChain,
  EvmToArkadeSwapOptions,
  EvmToArkadeSwapResult,
} from "./types.js";
