/**
 * EVM HTLC encoding utilities.
 *
 * Provides helpers for encoding call data to interact with the
 * ReverseAtomicSwapHTLC contract for EVM-to-BTC swaps.
 */

/**
 * Parameters for creating an EVM HTLC swap.
 */
export interface CreateSwapParams {
  /** Unique swap identifier (UUID or bytes32 hex) */
  swapId: string;
  /** Address to receive tokens on claim (Lendaswap's address) */
  recipient: string;
  /** Input token address (e.g., USDC) */
  tokenIn: string;
  /** Output token address (e.g., WBTC) */
  tokenOut: string;
  /** Amount of input token (in token's smallest unit, e.g., 6 decimals for USDC) */
  amountIn: bigint;
  /** Hash lock (SHA256 of preimage, 32 bytes hex with 0x prefix) */
  hashLock: string;
  /** Unix timestamp after which refund is possible */
  timelock: number;
  /** Uniswap pool fee tier (500, 3000, or 10000) */
  poolFee: number;
  /** Minimum output amount (slippage protection) */
  minAmountOut: bigint;
}

/**
 * Result of encoding createSwap call data.
 */
export interface CreateSwapCallData {
  /** The HTLC contract address to call */
  to: string;
  /** The encoded call data */
  data: string;
  /** Human-readable function signature */
  functionSignature: string;
}

/**
 * Result of encoding approve call data.
 */
export interface ApproveCallData {
  /** The token contract address to call */
  to: string;
  /** The encoded call data */
  data: string;
  /** Human-readable function signature */
  functionSignature: string;
}

/**
 * Result of encoding refundSwap call data.
 */
export interface RefundSwapCallData {
  /** The HTLC contract address to call */
  to: string;
  /** The encoded call data */
  data: string;
  /** Human-readable function signature */
  functionSignature: string;
}

/**
 * Parameters for creating an HTLCErc20 swap (new contract).
 */
export interface HtlcErc20CreateParams {
  /** Hash lock (SHA256 of preimage, 32 bytes hex with 0x prefix) */
  preimageHash: string;
  /** Amount of tokens (in token's smallest unit) */
  amount: bigint;
  /** Token contract address */
  token: string;
  /** Address that can refund (usually the sender/user) */
  sender: string;
  /** Address that can claim with preimage (usually the server) */
  claimer: string;
  /** Unix timestamp after which refund is possible */
  timelock: number;
}

/**
 * Result of encoding HTLCErc20 create call data.
 */
export interface HtlcErc20CreateCallData {
  /** The HTLC contract address to call */
  to: string;
  /** The encoded call data */
  data: string;
  /** Human-readable function signature */
  functionSignature: string;
}

// Function selectors (first 4 bytes of keccak256 hash of function signature)
// createSwap(bytes32,address,address,address,uint256,bytes32,uint256,uint24,uint256)
const CREATE_SWAP_SELECTOR = "0x9a4efe51";
// approve(address,uint256)
const APPROVE_SELECTOR = "0x095ea7b3";
// refundSwap(bytes32)
const REFUND_SWAP_SELECTOR = "0xfe2510ee";
// HTLCErc20.create(bytes32,uint256,address,address,address,uint256)
const HTLC_ERC20_CREATE_SELECTOR = "0x06799dee";

/**
 * Converts a UUID string to a bytes32 hex string (right-padded with zeros).
 *
 * @param uuid - The UUID string (with or without hyphens)
 * @returns The bytes32 hex string (without 0x prefix)
 */
export function uuidToBytes32(uuid: string): string {
  // Remove hyphens and 0x prefix if present
  let cleanHex = uuid.replace(/-/g, "").replace(/^0x/, "");

  // Ensure it's valid hex
  if (!/^[0-9a-fA-F]+$/.test(cleanHex)) {
    throw new Error(`Invalid UUID hex: ${uuid}`);
  }

  // Right-pad to 64 characters (32 bytes)
  if (cleanHex.length < 64) {
    cleanHex = cleanHex.padEnd(64, "0");
  } else if (cleanHex.length > 64) {
    cleanHex = cleanHex.slice(0, 64);
  }

  return cleanHex.toLowerCase();
}

/**
 * Normalizes a bytes32 value (removes 0x prefix, ensures 64 chars).
 */
function normalizeBytes32(value: string): string {
  let clean = value.replace(/^0x/, "");
  if (clean.length < 64) {
    clean = clean.padStart(64, "0");
  }
  return clean.toLowerCase();
}

/**
 * Normalizes an address to 32 bytes (left-padded with zeros).
 */
function normalizeAddress(address: string): string {
  const clean = address.replace(/^0x/, "").toLowerCase();
  return clean.padStart(64, "0");
}

/**
 * Encodes a uint256 value as 32 bytes hex.
 */
function encodeUint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

/**
 * Encodes a uint24 value as 32 bytes hex (for ABI encoding).
 */
function encodeUint24(value: number): string {
  return value.toString(16).padStart(64, "0");
}

/**
 * Encodes the call data for ERC20 approve function.
 *
 * @param spender - The address to approve (HTLC contract)
 * @param amount - The amount to approve
 * @returns The encoded approve call data
 *
 * @example
 * ```ts
 * const approveData = encodeApproveCallData(htlcAddress, amountIn);
 * // Use with ethers.js:
 * await tokenContract.sendTransaction({ to: tokenAddress, data: approveData.data });
 * ```
 */
export function encodeApproveCallData(
  tokenAddress: string,
  spender: string,
  amount: bigint,
): ApproveCallData {
  const spenderEncoded = normalizeAddress(spender);
  const amountEncoded = encodeUint256(amount);

  const data = `${APPROVE_SELECTOR}${spenderEncoded}${amountEncoded}`;

  return {
    to: tokenAddress,
    data,
    functionSignature: "approve(address,uint256)",
  };
}

/**
 * Encodes the call data for createSwap function on the HTLC contract.
 *
 * @param htlcAddress - The HTLC contract address
 * @param params - The createSwap parameters
 * @returns The encoded createSwap call data
 *
 * @example
 * ```ts
 * const createData = encodeCreateSwapCallData(htlcAddress, {
 *   swapId: "12345678-1234-1234-1234-123456789abc",
 *   recipient: "0x...",
 *   tokenIn: "0x...", // USDC
 *   tokenOut: "0x...", // WBTC
 *   amountIn: 100000000n, // 100 USDC (6 decimals)
 *   hashLock: "0x...",
 *   timelock: Math.floor(Date.now() / 1000) + 3600,
 *   poolFee: 3000,
 *   minAmountOut: 0n,
 * });
 * ```
 */
export function encodeCreateSwapCallData(
  htlcAddress: string,
  params: CreateSwapParams,
): CreateSwapCallData {
  // Encode each parameter
  const swapIdEncoded = uuidToBytes32(params.swapId);
  const recipientEncoded = normalizeAddress(params.recipient);
  const tokenInEncoded = normalizeAddress(params.tokenIn);
  const tokenOutEncoded = normalizeAddress(params.tokenOut);
  const amountInEncoded = encodeUint256(params.amountIn);
  const hashLockEncoded = normalizeBytes32(params.hashLock);
  const timelockEncoded = encodeUint256(BigInt(params.timelock));
  const poolFeeEncoded = encodeUint24(params.poolFee);
  const minAmountOutEncoded = encodeUint256(params.minAmountOut);

  const data = [
    CREATE_SWAP_SELECTOR,
    swapIdEncoded,
    recipientEncoded,
    tokenInEncoded,
    tokenOutEncoded,
    amountInEncoded,
    hashLockEncoded,
    timelockEncoded,
    poolFeeEncoded,
    minAmountOutEncoded,
  ].join("");

  return {
    to: htlcAddress,
    data,
    functionSignature:
      "createSwap(bytes32,address,address,address,uint256,bytes32,uint256,uint24,uint256)",
  };
}

/**
 * Encodes the call data for refundSwap function on the HTLC contract.
 *
 * @param htlcAddress - The HTLC contract address
 * @param swapId - The swap ID (UUID or bytes32 hex)
 * @returns The encoded refundSwap call data
 *
 * @example
 * ```ts
 * const refundData = encodeRefundSwapCallData(htlcAddress, swapId);
 * // Use with viem:
 * await walletClient.sendTransaction({ to: refundData.to, data: refundData.data });
 * ```
 */
export function encodeRefundSwapCallData(
  htlcAddress: string,
  swapId: string,
): RefundSwapCallData {
  const swapIdEncoded = uuidToBytes32(swapId);
  const data = `${REFUND_SWAP_SELECTOR}${swapIdEncoded}`;

  return {
    to: htlcAddress,
    data,
    functionSignature: "refundSwap(bytes32)",
  };
}

/**
 * Encodes the call data for HTLCErc20.create function.
 *
 * This is for the new HTLCErc20 contract used in EVM-to-Lightning swaps.
 *
 * @param htlcAddress - The HTLCErc20 contract address
 * @param params - The create parameters
 * @returns The encoded create call data
 *
 * @example
 * ```ts
 * const createData = encodeHtlcErc20CreateCallData(htlcAddress, {
 *   preimageHash: "0x...",
 *   amount: 100000000n,
 *   token: "0x...",
 *   sender: "0x...",
 *   claimer: "0x...",
 *   timelock: Math.floor(Date.now() / 1000) + 3600,
 * });
 * // Use with viem:
 * await walletClient.sendTransaction({ to: createData.to, data: createData.data });
 * ```
 */
export function encodeHtlcErc20CreateCallData(
  htlcAddress: string,
  params: HtlcErc20CreateParams,
): HtlcErc20CreateCallData {
  const preimageHashEncoded = normalizeBytes32(params.preimageHash);
  const amountEncoded = encodeUint256(params.amount);
  const tokenEncoded = normalizeAddress(params.token);
  const senderEncoded = normalizeAddress(params.sender);
  const claimerEncoded = normalizeAddress(params.claimer);
  const timelockEncoded = encodeUint256(BigInt(params.timelock));

  const data = [
    HTLC_ERC20_CREATE_SELECTOR,
    preimageHashEncoded,
    amountEncoded,
    tokenEncoded,
    senderEncoded,
    claimerEncoded,
    timelockEncoded,
  ].join("");

  return {
    to: htlcAddress,
    data,
    functionSignature:
      "create(bytes32,uint256,address,address,address,uint256)",
  };
}

/**
 * Builds both approve and createSwap call data for an EVM-to-BTC swap.
 *
 * @param htlcAddress - The HTLC contract address
 * @param params - The createSwap parameters
 * @returns Both approve and createSwap call data
 *
 * @example
 * ```ts
 * const { approve, createSwap } = buildEvmHtlcCallData(htlcAddress, params);
 *
 * // Step 1: Approve token spend
 * await wallet.sendTransaction({ to: approve.to, data: approve.data });
 *
 * // Step 2: Create the swap
 * await wallet.sendTransaction({ to: createSwap.to, data: createSwap.data });
 * ```
 */
export function buildEvmHtlcCallData(
  htlcAddress: string,
  params: CreateSwapParams,
): {
  approve: ApproveCallData;
  createSwap: CreateSwapCallData;
} {
  return {
    approve: encodeApproveCallData(
      params.tokenIn,
      htlcAddress,
      params.amountIn,
    ),
    createSwap: encodeCreateSwapCallData(htlcAddress, params),
  };
}
