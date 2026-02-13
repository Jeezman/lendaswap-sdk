/**
 * Ethereum claim logic with contract call data encoding.
 *
 * EVM claims use the HTLCErc20 contract's redeem() function which requires
 * all original swap parameters for verification.
 */

import type {
  BtcToEvmSwapResponse,
  GetSwapResponse,
} from "../api/client.js";
import type { ClaimResult } from "./types.js";

/**
 * Builds the claim data for an EVM swap (Ethereum, Polygon, or Arbitrum).
 *
 * The HTLCErc20 contract requires all original swap parameters for verification:
 * - preimage: The secret whose SHA-256 hash matches the preimageHash
 * - amount: Token amount that was locked
 * - token: ERC20 token address that was locked
 * - sender: Address that created the swap (server)
 * - timelock: Unix timestamp after which sender can refund
 *
 * @param id - The UUID of the swap (not used in contract call, kept for reference).
 * @param secret - The preimage/secret (32-byte hex string, with or without 0x prefix).
 * @param swap - The swap response from the API.
 * @param chain - The target chain for the claim.
 * @returns A ClaimResult with the EVM claim data.
 */
export function buildEthereumClaimData(
  id: string,
  secret: string,
  swap: GetSwapResponse,
  chain: "polygon" | "arbitrum" | "ethereum",
): ClaimResult {
  const contractAddress = getEvmHtlcAddress(swap);
  if (!contractAddress) {
    return {
      success: false,
      message: "Could not find HTLC contract address in swap response.",
      chain,
    };
  }

  // Extract swap parameters needed for redeem()
  const params = getRedeemParams(swap);
  if (!params) {
    return {
      success: false,
      message: "Could not extract redeem parameters from swap response. Missing amount, token, sender, or timelock.",
      chain,
    };
  }

  // Normalize the secret - strip any double 0x prefix first
  let normalizedSecret = secret;
  while (normalizedSecret.startsWith("0x0x")) {
    normalizedSecret = normalizedSecret.slice(2);
  }
  normalizedSecret = normalizedSecret.startsWith("0x") ? normalizedSecret : `0x${normalizedSecret}`;

  // Encode the call data for redeem(bytes32,uint256,address,address,uint256)
  const callData = encodeRedeemCallData(
    normalizedSecret,
    params.amount,
    params.token,
    params.sender,
    params.timelock,
  );

  return {
    success: true,
    message:
      `${chain.charAt(0).toUpperCase() + chain.slice(1)} claims require manual execution. Use the provided call data to submit the transaction.`,
    chain,
    ethereumClaimData: {
      contractAddress,
      callData,
      swapId: id, // Keep for reference (not used in contract)
      secret: normalizedSecret,
      functionSignature: "redeem(bytes32 preimage, uint256 amount, address token, address sender, uint256 timelock)",
      // Additional params for manual construction
      amount: params.amount,
      token: params.token,
      sender: params.sender,
      timelock: params.timelock,
    },
  };
}

/**
 * Extracts redeem parameters from a swap response.
 * 
 * Note: Lightning-to-EVM and Arkade-to-EVM swaps use the gasless claim path
 * and don't go through this function.
 */
function getRedeemParams(swap: GetSwapResponse): {
  amount: bigint;
  token: string;
  sender: string;
  timelock: bigint;
} | undefined {
  // BTC-to-EVM swaps (BtcToEvmSwapResponse) - legacy type
  if ("htlc_address_evm" in swap) {
    // These swaps use different field names - not supported for manual redeem
    return undefined;
  }

  // EVM swaps with the newer field structure
  // Check for the fields we need
  const evmSwap = swap as {
    evm_expected_sats?: number;
    wbtc_address?: string;
    server_evm_address?: string;
    evm_refund_locktime?: number;
  };

  if (
    evmSwap.evm_expected_sats !== undefined &&
    evmSwap.wbtc_address &&
    evmSwap.server_evm_address &&
    evmSwap.evm_refund_locktime !== undefined
  ) {
    return {
      amount: BigInt(evmSwap.evm_expected_sats),
      token: evmSwap.wbtc_address,
      sender: evmSwap.server_evm_address,
      timelock: BigInt(evmSwap.evm_refund_locktime),
    };
  }

  return undefined;
}

/**
 * Encodes call data for the redeem(bytes32,uint256,address,address,uint256) function.
 *
 * Function selector: keccak256("redeem(bytes32,uint256,address,address,uint256)")[0:4]
 *
 * @param preimage - The preimage/secret as a bytes32 hex string
 * @param amount - The token amount
 * @param token - The ERC20 token address
 * @param sender - The swap sender (server) address
 * @param timelock - The refund timelock
 * @returns The encoded call data as a hex string with 0x prefix
 */
export function encodeRedeemCallData(
  preimage: string,
  amount: bigint,
  token: string,
  sender: string,
  timelock: bigint,
): string {
  // Function selector for redeem(bytes32,uint256,address,address,uint256)
  // keccak256("redeem(bytes32,uint256,address,address,uint256)") = 0xb31597ad
  const selector = "0xb31597ad";

  // Normalize preimage to 32 bytes (64 hex chars)
  const normalizedPreimage = normalizeBytes32(preimage);

  // Encode amount as uint256 (32 bytes, left-padded)
  const encodedAmount = amount.toString(16).padStart(64, "0");

  // Encode addresses as 32 bytes (left-padded with zeros)
  const encodedToken = normalizeAddress(token);
  const encodedSender = normalizeAddress(sender);

  // Encode timelock as uint256 (32 bytes, left-padded)
  const encodedTimelock = timelock.toString(16).padStart(64, "0");

  return `${selector}${normalizedPreimage}${encodedAmount}${encodedToken}${encodedSender}${encodedTimelock}`;
}

/**
 * Encodes call data for the legacy claimSwap(bytes32,bytes32) function.
 * @deprecated Use encodeRedeemCallData instead for HTLCErc20 v2 contracts.
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
 * Normalizes an Ethereum address to a 32-byte (64 character) representation.
 * Left-pads with zeros (addresses are 20 bytes, need 12 bytes of padding).
 *
 * @param address - Ethereum address (with or without 0x prefix)
 * @returns 64-character hex string (without 0x prefix)
 */
function normalizeAddress(address: string): string {
  // Remove 0x prefix if present
  let hex = address.startsWith("0x") ? address.slice(2) : address;

  // Addresses are 20 bytes (40 hex chars), pad to 32 bytes (64 hex chars)
  return hex.padStart(64, "0").toLowerCase();
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
  // Other EVM swap types use evm_htlc_address
  if ("evm_htlc_address" in swap) {
    return (swap as { evm_htlc_address: string }).evm_htlc_address;
  }
  return undefined;
}
