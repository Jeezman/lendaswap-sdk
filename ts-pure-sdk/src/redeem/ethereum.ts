/**
 * Ethereum claim logic with contract call data encoding.
 *
 * Ethereum claims are not supported via Gelato relay, so we provide
 * the call data for users to submit the transaction themselves.
 */

import type {
  BitcoinToEvmSwapResponse,
  BtcToEvmSwapResponse,
  GetSwapResponse,
} from "../api/client.js";
import type { ClaimResult } from "./types.js";

/**
 * Builds the claim data for an Ethereum swap.
 *
 * @param id - The UUID of the swap.
 * @param secret - The preimage/secret (32-byte hex string, with or without 0x prefix).
 * @param swap - The swap response from the API.
 * @returns A ClaimResult with the Ethereum claim data.
 */
export function buildEthereumClaimData(
  id: string,
  secret: string,
  swap: GetSwapResponse,
): ClaimResult {
  const contractAddress = getEvmHtlcAddress(swap);
  if (!contractAddress) {
    return {
      success: false,
      message: "Could not find HTLC contract address in swap response.",
      chain: "ethereum",
    };
  }

  // Convert UUID to bytes32 (right-padded with zeros)
  const swapIdBytes32 = uuidToBytes32(id);

  // Normalize the secret
  const normalizedSecret = secret.startsWith("0x") ? secret : `0x${secret}`;

  // Encode the call data using the UUID-based swapId
  const callData = encodeClaimSwapCallData(swapIdBytes32, normalizedSecret);

  return {
    success: true,
    message:
      "Ethereum claims require manual execution. Use the provided call data to submit the transaction.",
    chain: "ethereum",
    ethereumClaimData: {
      contractAddress,
      callData,
      swapId: `0x${swapIdBytes32}`,
      secret: normalizedSecret,
      functionSignature: "claimSwap(bytes32 swapId, bytes32 secret)",
    },
  };
}

/**
 * Encodes call data for the claimSwap(bytes32,bytes32) function.
 *
 * Function selector: keccak256("claimSwap(bytes32,bytes32)")[0:4]
 *
 * @param swapId - The swap ID as a bytes32 hex string (with or without 0x prefix)
 * @param secret - The preimage/secret as a bytes32 hex string (with or without 0x prefix)
 * @returns The encoded call data as a hex string with 0x prefix
 */
export function encodeClaimSwapCallData(
  swapId: string,
  secret: string,
): string {
  // Function selector for claimSwap(bytes32,bytes32)
  // keccak256("claimSwap(bytes32,bytes32)") = 0x84cc315b...
  const selector = "0x84cc315b";

  // Normalize inputs - remove 0x prefix if present and ensure 64 chars (32 bytes)
  const normalizedSwapId = normalizeBytes32(swapId);
  const normalizedSecret = normalizeBytes32(secret);

  return `${selector}${normalizedSwapId}${normalizedSecret}`;
}

/**
 * Normalizes a hex string to a 32-byte (64 character) representation.
 * Left-pads with zeros (for secrets/hashes).
 *
 * @param input - Hex string
 * @returns 64-character hex string (without 0x prefix)
 */
function normalizeBytes32(input: string): string {
  // Remove 0x prefix if present
  let hex = input.startsWith("0x") ? input.slice(2) : input;

  // Pad to 64 characters (32 bytes) if needed - left pad for hashes
  if (hex.length < 64) {
    hex = hex.padStart(64, "0");
  }

  // Truncate if longer (shouldn't happen for valid inputs)
  if (hex.length > 64) {
    hex = hex.slice(0, 64);
  }

  return hex.toLowerCase();
}

/**
 * Converts a UUID to a bytes32 hex string.
 * Removes dashes and right-pads with zeros to make 32 bytes.
 *
 * @param uuid - UUID string (e.g., "550e8400-e29b-41d4-a716-446655440000")
 * @returns 64-character hex string (without 0x prefix)
 */
export function uuidToBytes32(uuid: string): string {
  // Remove dashes and 0x prefix if present
  let hex = uuid.replace(/-/g, "");
  if (hex.startsWith("0x")) {
    hex = hex.slice(2);
  }

  // Right-pad to 64 characters (32 bytes)
  if (hex.length < 64) {
    hex = hex.padEnd(64, "0");
  }

  // Truncate if longer (shouldn't happen for valid UUIDs)
  if (hex.length > 64) {
    hex = hex.slice(0, 64);
  }

  return hex.toLowerCase();
}

/**
 * Gets the EVM HTLC contract address from a swap response.
 *
 * @param swap - The swap response
 * @returns The HTLC contract address or undefined if not found
 */
function getEvmHtlcAddress(swap: GetSwapResponse): string | undefined {
  // BtcToEvmSwapResponse uses htlc_address_evm
  if ("htlc_address_evm" in swap) {
    return (swap as BtcToEvmSwapResponse).htlc_address_evm;
  }
  // BitcoinToEvmSwapResponse uses evm_htlc_address
  if ("evm_htlc_address" in swap) {
    return (swap as BitcoinToEvmSwapResponse).evm_htlc_address;
  }
  return undefined;
}
