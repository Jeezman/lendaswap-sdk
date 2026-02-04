/**
 * Swap creation module for Lendaswap.
 *
 * Provides swap creation logic for different source types:
 * - Arkade (off-chain) to EVM
 * - Lightning to EVM
 * - Bitcoin (on-chain) to EVM
 * - EVM to Arkade
 * - EVM to Lightning
 */

export {
  createArkadeToEvmSwap,
  createArkadeToEvmSwapGeneric,
} from "./arkade.js";
export { createBitcoinToEvmSwap } from "./bitcoin.js";
export { createBitcoinToArkadeSwap } from "./bitcoin-to-arkade.js";
export { createEvmToArkadeSwap } from "./evm-to-arkade.js";
export { createEvmToLightningSwap } from "./evm-to-lightning.js";
export { createLightningToEvmSwap } from "./lightning.js";
export type {
  ArkadeToEvmSwapOptions,
  ArkadeToEvmSwapResult,
  BitcoinToArkadeSwapOptions,
  BitcoinToArkadeSwapResult,
  BitcoinToEvmSwapOptions,
  BitcoinToEvmSwapResponse,
  BitcoinToEvmSwapResult,
  BtcToEvmSwapOptions,
  BtcToEvmSwapResult,
  CreateSwapContext,
  EvmChain,
  EvmToArkadeSwapOptions,
  EvmToArkadeSwapResult,
  EvmToLightningSwapOptions,
  EvmToLightningSwapResult,
} from "./types.js";
