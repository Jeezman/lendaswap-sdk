/**
 * USDT0 bridge utility functions.
 */

import { LZ_EIDS, type Usdt0ChainName } from "./constants.js";

/**
 * Convert an EVM address to OFT's bytes32 format (left-padded with zeros).
 * @param address - 0x-prefixed hex address (20 bytes)
 * @returns 0x-prefixed bytes32 hex string (32 bytes)
 */
export function addressToBytes32(address: string): string {
  const clean = address.toLowerCase().replace("0x", "");
  if (clean.length !== 40) {
    throw new Error(
      `Invalid address length: expected 40 hex chars, got ${clean.length}`,
    );
  }
  return `0x${clean.padStart(64, "0")}`;
}

/**
 * Convert an OFT bytes32 back to an EVM address.
 * @param bytes32 - 0x-prefixed bytes32 hex string
 * @returns 0x-prefixed address
 */
export function bytes32ToAddress(bytes32: string): string {
  const clean = bytes32.replace("0x", "");
  if (clean.length !== 64) {
    throw new Error(
      `Invalid bytes32 length: expected 64 hex chars, got ${clean.length}`,
    );
  }
  return `0x${clean.slice(24)}`;
}

/**
 * Get the LayerZero endpoint ID for a chain name.
 * @param chainName - Chain name (e.g. "Ethereum", "Arbitrum", "Base")
 * @returns The LayerZero EID, or undefined if not supported.
 */
export function getEid(chainName: string): number | undefined {
  return LZ_EIDS[chainName as Usdt0ChainName];
}

/**
 * Check if two chains require USDT0 OFT bridging (i.e., they're different
 * and both supported by USDT0).
 * @param sourceChain - Source chain name
 * @param targetChain - Target chain name
 * @returns true if USDT0 bridging is needed
 */
export function needsBridge(sourceChain: string, targetChain: string): boolean {
  if (sourceChain === targetChain) return false;
  const sourceEid = getEid(sourceChain);
  const targetEid = getEid(targetChain);
  return sourceEid !== undefined && targetEid !== undefined;
}
