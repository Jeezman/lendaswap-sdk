/**
 * CCTP utility functions.
 */

import { CCTP_DOMAINS, type CctpChainName } from "./constants.js";

/**
 * Convert an EVM address to CCTP's bytes32 format (left-padded with zeros).
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
 * Convert a CCTP bytes32 back to an EVM address.
 * @param bytes32 - 0x-prefixed bytes32 hex string
 * @returns 0x-prefixed checksummed address
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
 * Get the CCTP domain ID for a chain name.
 * @param chainName - Chain name (e.g. "Ethereum", "Polygon", "Arbitrum")
 * @returns The CCTP domain ID, or undefined if not supported.
 */
export function getDomain(chainName: string): number | undefined {
  return CCTP_DOMAINS[chainName as CctpChainName];
}

/**
 * Check if two chains require CCTP bridging (i.e., they're different chains).
 * @param sourceChain - Source chain name
 * @param targetChain - Target chain name
 * @returns true if CCTP bridging is needed
 */
export function needsBridge(sourceChain: string, targetChain: string): boolean {
  if (sourceChain === targetChain) return false;
  const sourceDomain = getDomain(sourceChain);
  const targetDomain = getDomain(targetChain);
  return sourceDomain !== undefined && targetDomain !== undefined;
}
