/**
 * HTLCCoordinator contract utilities.
 *
 * Provides helpers for EIP-712 signing and encoding `redeemAndExecute` call data
 * for the HTLCCoordinator contract used in Arkade-to-EVM swaps.
 */

// ── ABI helpers ──────────────────────────────────────────────────────────────

/** A single call struct for the coordinator's calls array: (address target, uint256 value, bytes data) */
export interface CoordinatorCall {
  /** Target contract address */
  target: string;
  /** ETH value to send (usually "0") */
  value: bigint;
  /** Encoded call data */
  data: string;
}

/** Parameters for building the EIP-712 redeem digest */
export interface RedeemDigestParams {
  /** HTLCErc20 contract address (verifyingContract) */
  htlcAddress: string;
  /** EVM chain ID */
  chainId: number;
  /** Preimage (32-byte hex with 0x prefix) */
  preimage: string;
  /** WBTC amount locked in the HTLC (in smallest unit) */
  amount: bigint;
  /** WBTC token address */
  token: string;
  /** HTLC sender (server's EVM address) */
  sender: string;
  /** HTLC timelock (unix timestamp) */
  timelock: number;
  /** Caller address (coordinator contract) */
  caller: string;
  /** Destination address where tokens are swept */
  destination: string;
  /** Token to sweep after calls (target token, or WBTC if no swap) */
  sweepToken: string;
  /** Minimum amount of sweepToken to receive (slippage protection) */
  minAmountOut: bigint;
}

/** Parameters for encoding redeemAndExecute call data */
export interface RedeemAndExecuteParams {
  /** Preimage (32-byte hex with 0x prefix) */
  preimage: string;
  /** WBTC amount locked in the HTLC */
  amount: bigint;
  /** WBTC token address */
  token: string;
  /** HTLC sender (server's EVM address) */
  sender: string;
  /** HTLC timelock */
  timelock: number;
  /** Array of calls to execute after redeem (approve + 1inch swap, or empty for WBTC) */
  calls: CoordinatorCall[];
  /** Token to sweep to the user after calls (target token, or WBTC if no swap) */
  sweepToken: string;
  /** Minimum amount of sweepToken to receive (slippage protection, 0 for no check) */
  minAmountOut: bigint;
  /** Destination address where tokens are swept */
  destination: string;
  /** EIP-712 signature v */
  v: number;
  /** EIP-712 signature r (32-byte hex with 0x prefix) */
  r: string;
  /** EIP-712 signature s (32-byte hex with 0x prefix) */
  s: string;
}

/** Result of building redeemAndExecute call data */
export interface RedeemAndExecuteCallData {
  /** The coordinator contract address */
  to: string;
  /** The encoded call data */
  data: string;
  /** Human-readable function signature */
  functionSignature: string;
}

// ── EIP-712 constants ────────────────────────────────────────────────────────
// hardcoded so that we can potentially support multiple versions
const EIP712_DOMAIN_TYPEHASH =
  "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
const REDEEM_TYPEHASH =
  "Redeem(bytes32 preimage,uint256 amount,address token,address sender,uint256 timelock,address caller,address destination,address sweepToken,uint256 minAmountOut)";
const HTLC_NAME = "HTLCErc20";
const HTLC_VERSION = "2";

// ── redeemAndExecute selector ────────────────────────────────────────────────
// keccak256("redeemAndExecute(bytes32,uint256,address,address,uint256,(address,uint256,bytes)[],address,uint256,address,uint8,bytes32,bytes32)")
const REDEEM_AND_EXECUTE_SELECTOR = keccak256(
  stringToUtf8Bytes(
    "redeemAndExecute(bytes32,uint256,address,address,uint256,(address,uint256,bytes)[],address,uint256,address,uint8,bytes32,bytes32)",
  ),
).slice(0, 10);

// ── keccak256 ────────────────────────────────────────────────────────────────

/**
 * Computes keccak256 hash. Uses a minimal JS implementation to avoid
 * external dependencies (the SDK is a pure library).
 *
 * @param input - Hex string (with or without 0x) or Uint8Array
 * @returns 32-byte hex string with 0x prefix
 */
export function keccak256(input: string | Uint8Array): string {
  const data = typeof input === "string" ? hexToBytes(input) : input;
  const hash = keccak256Bytes(data);
  return `0x${bytesToHex(hash)}`;
}

// ── EIP-712 digest ───────────────────────────────────────────────────────────

/**
 * Builds the EIP-712 digest that the user must sign to authorize
 * the coordinator to call `HTLC.redeem` on their behalf.
 *
 * @param params - The redeem parameters
 * @returns The 32-byte digest as hex string with 0x prefix
 *
 * @example
 * ```ts
 * const digest = buildRedeemDigest({
 *   htlcAddress: "0x...",
 *   chainId: 137,
 *   preimage: "0x...",
 *   amount: 100000n,
 *   token: "0x...", // WBTC
 *   sender: "0x...", // server
 *   timelock: 1700000000,
 *   caller: "0x...", // coordinator
 * });
 * // Sign `digest` with user's EVM wallet
 * ```
 */
export function buildRedeemDigest(params: RedeemDigestParams): string {
  // Domain separator
  const domainSeparator = keccak256(
    abiEncode([
      {
        type: "bytes32",
        value: keccak256(stringToUtf8Bytes(EIP712_DOMAIN_TYPEHASH)),
      },
      { type: "bytes32", value: keccak256(stringToUtf8Bytes(HTLC_NAME)) },
      { type: "bytes32", value: keccak256(stringToUtf8Bytes(HTLC_VERSION)) },
      { type: "uint256", value: BigInt(params.chainId) },
      { type: "address", value: params.htlcAddress },
    ]),
  );

  // Struct hash
  const typeHash = keccak256(stringToUtf8Bytes(REDEEM_TYPEHASH));
  const structHash = keccak256(
    abiEncode([
      { type: "bytes32", value: typeHash },
      { type: "bytes32", value: params.preimage },
      { type: "uint256", value: params.amount },
      { type: "address", value: params.token },
      { type: "address", value: params.sender },
      { type: "uint256", value: BigInt(params.timelock) },
      { type: "address", value: params.caller },
      { type: "address", value: params.destination },
      { type: "address", value: params.sweepToken },
      { type: "uint256", value: params.minAmountOut },
    ]),
  );

  // EIP-712 digest: \x19\x01 ‖ domainSeparator ‖ structHash
  const prefix = new Uint8Array([0x19, 0x01]);
  const domainBytes = hexToBytes(domainSeparator);
  const structBytes = hexToBytes(structHash);
  const message = new Uint8Array(
    prefix.length + domainBytes.length + structBytes.length,
  );
  message.set(prefix, 0);
  message.set(domainBytes, prefix.length);
  message.set(structBytes, prefix.length + domainBytes.length);

  return keccak256(message);
}

// ── Calls builder ────────────────────────────────────────────────────────────

/**
 * Builds the calls array for `redeemAndExecute` based on 1inch calldata.
 *
 * - If `oneinchCalldata` is provided: returns [approve WBTC to 1inch, execute 1inch swap]
 * - If `oneinchCalldata` is null/undefined (WBTC target): returns empty array
 *
 * @param wbtcAddress - WBTC token contract address
 * @param amount - WBTC amount to approve
 * @param oneinchCalldata - 1inch swap calldata from the creation response (optional)
 * @returns Array of CoordinatorCall structs
 */
export function buildRedeemCalls(
  wbtcAddress: string,
  amount: bigint,
  oneinchCalldata?: { to: string; data: string; value: string } | null,
): CoordinatorCall[] {
  if (!oneinchCalldata) {
    return [];
  }

  // Build approve calldata: WBTC.approve(1inch_router, amount)
  const approveData = encodeApprove(oneinchCalldata.to, amount);

  return [
    {
      target: wbtcAddress,
      value: 0n,
      data: approveData,
    },
    {
      target: oneinchCalldata.to,
      value: BigInt(oneinchCalldata.value || "0"),
      data: oneinchCalldata.data,
    },
  ];
}

// ── redeemAndExecute calldata ────────────────────────────────────────────────

/**
 * Encodes the call data for `coordinator.redeemAndExecute(...)`.
 *
 * @param coordinatorAddress - The HTLCCoordinator contract address
 * @param params - All parameters for the call
 * @returns The encoded call data
 *
 * @example
 * ```ts
 * const txData = encodeRedeemAndExecute("0xCoordinator...", {
 *   preimage: "0x...",
 *   amount: 100000n,
 *   token: "0xWBTC...",
 *   sender: "0xServer...",
 *   timelock: 1700000000,
 *   calls: buildRedeemCalls(wbtcAddr, amount, oneinchCalldata),
 *   sweepToken: targetTokenAddr,
 *   minAmountOut: 0n,
 *   v: 27,
 *   r: "0x...",
 *   s: "0x...",
 * });
 * // Send transaction: { to: txData.to, data: txData.data }
 * ```
 */
export function encodeRedeemAndExecute(
  coordinatorAddress: string,
  params: RedeemAndExecuteParams,
): RedeemAndExecuteCallData {
  // Fixed-length head: 12 slots of 32 bytes each
  // preimage (bytes32), amount (uint256), token (address), sender (address),
  // timelock (uint256), calls_offset (uint256), sweepToken (address),
  // minAmountOut (uint256), destination (address), v (uint8), r (bytes32), s (bytes32)
  const preimage = normalizeBytes32(params.preimage);
  const amount = encodeUint256(params.amount);
  const token = normalizeAddress(params.token);
  const sender = normalizeAddress(params.sender);
  const timelock = encodeUint256(BigInt(params.timelock));

  // Calls is a dynamic type — offset points to where the array data starts.
  // Head has 12 slots × 32 bytes = 384 = 0x180
  const callsOffset = encodeUint256(12n * 32n);

  const sweepToken = normalizeAddress(params.sweepToken);
  const minAmountOut = encodeUint256(params.minAmountOut);
  const destination = normalizeAddress(params.destination);
  const v = encodeUint256(BigInt(params.v));
  const r = normalizeBytes32(params.r);
  const s = normalizeBytes32(params.s);

  // Encode the calls array
  const callsEncoded = encodeCalls(params.calls);

  const data = [
    REDEEM_AND_EXECUTE_SELECTOR,
    preimage,
    amount,
    token,
    sender,
    timelock,
    callsOffset,
    sweepToken,
    minAmountOut,
    destination,
    v,
    r,
    s,
    callsEncoded,
  ].join("");

  return {
    to: coordinatorAddress,
    data,
    functionSignature:
      "redeemAndExecute(bytes32,uint256,address,address,uint256,(address,uint256,bytes)[],address,uint256,address,uint8,bytes32,bytes32)",
  };
}

// ── Internal encoding helpers ────────────────────────────────────────────────

/** Encode ERC20 approve(address,uint256) call data */
function encodeApprove(spender: string, amount: bigint): string {
  const selector = "0x095ea7b3";
  return `${selector}${normalizeAddress(spender)}${encodeUint256(amount)}`;
}

/** Encode the dynamic (address,uint256,bytes)[] array for ABI */
function encodeCalls(calls: CoordinatorCall[]): string {
  // Array length
  const length = encodeUint256(BigInt(calls.length));

  if (calls.length === 0) {
    return length;
  }

  // Each element is a tuple (address, uint256, bytes) — a dynamic type.
  // We encode offsets first, then each element's data.

  // Calculate offsets: each element offset is relative to the start of the array data
  // (after the length word). First we have N offset words, then the actual data.
  const elementDataParts: string[] = [];
  const offsets: bigint[] = [];

  // First pass: encode each element and compute sizes
  for (const call of calls) {
    const encoded = encodeSingleCall(call);
    elementDataParts.push(encoded);
  }

  // Compute offsets: offset[0] = N * 32, offset[i] = offset[i-1] + size(element[i-1])
  let currentOffset = BigInt(calls.length) * 32n;
  for (let i = 0; i < calls.length; i++) {
    offsets.push(currentOffset);
    // Each encoded element is hex chars / 2 = bytes
    currentOffset += BigInt(elementDataParts[i].length / 2);
  }

  const offsetsEncoded = offsets.map((o) => encodeUint256(o)).join("");
  const dataEncoded = elementDataParts.join("");

  return length + offsetsEncoded + dataEncoded;
}

/** Encode a single (address, uint256, bytes) tuple */
function encodeSingleCall(call: CoordinatorCall): string {
  const target = normalizeAddress(call.target);
  const value = encodeUint256(call.value);

  // bytes is dynamic: offset (32 bytes) + length (32 bytes) + padded data
  const bytesOffset = encodeUint256(3n * 32n); // offset after target, value, and this offset word

  const callData = call.data.startsWith("0x") ? call.data.slice(2) : call.data;
  const dataLength = callData.length / 2;
  const bytesLength = encodeUint256(BigInt(dataLength));

  // Pad data to 32-byte boundary
  const paddedLength = Math.ceil(dataLength / 32) * 32;
  const paddedData = callData.padEnd(paddedLength * 2, "0");

  return target + value + bytesOffset + bytesLength + paddedData;
}

// ── Low-level ABI encoding ───────────────────────────────────────────────────

interface AbiValue {
  type: "bytes32" | "uint256" | "address";
  value: string | bigint;
}

function abiEncode(values: AbiValue[]): string {
  return values
    .map((v) => {
      switch (v.type) {
        case "bytes32":
          return normalizeBytes32(v.value as string);
        case "uint256":
          return encodeUint256(v.value as bigint);
        case "address":
          return normalizeAddress(v.value as string);
      }
    })
    .join("");
}

function normalizeBytes32(value: string): string {
  let clean = value.replace(/^0x/, "");
  if (clean.length < 64) {
    clean = clean.padStart(64, "0");
  }
  return clean.toLowerCase().slice(0, 64);
}

function normalizeAddress(address: string): string {
  const clean = address.replace(/^0x/, "").toLowerCase();
  return clean.padStart(64, "0");
}

function encodeUint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

// ── Hex / bytes utilities ────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function stringToUtf8Bytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// ── Keccak-256 implementation ────────────────────────────────────────────────
// Minimal pure-JS keccak-256 (no dependencies).

const RC = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n,
];

const ROTC = [
  1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14, 27, 41, 56, 8, 25, 43, 62, 18, 39,
  61, 20, 44,
];

const PI = [
  10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4, 15, 23, 19, 13, 12, 2, 20, 14, 22,
  9, 6, 1,
];

function keccakF(state: bigint[]): void {
  for (let round = 0; round < 24; round++) {
    // θ
    const C: bigint[] = [];
    for (let x = 0; x < 5; x++) {
      C[x] =
        state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    const D: bigint[] = [];
    for (let x = 0; x < 5; x++) {
      D[x] = C[(x + 4) % 5] ^ rot64(C[(x + 1) % 5], 1);
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        state[x + 5 * y] ^= D[x];
      }
    }
    // ρ and π
    let last = state[1];
    for (let i = 0; i < 24; i++) {
      const j = PI[i];
      const temp = state[j];
      state[j] = rot64(last, ROTC[i]);
      last = temp;
    }
    // χ
    for (let y = 0; y < 5; y++) {
      const row: bigint[] = [];
      for (let x = 0; x < 5; x++) row[x] = state[x + 5 * y];
      for (let x = 0; x < 5; x++) {
        state[x + 5 * y] = row[x] ^ (~row[(x + 1) % 5] & row[(x + 2) % 5]);
      }
    }
    // ι
    state[0] ^= RC[round];
  }
}

function rot64(x: bigint, n: number): bigint {
  const mask = (1n << 64n) - 1n;
  return ((x << BigInt(n)) | (x >> BigInt(64 - n))) & mask;
}

function keccak256Bytes(data: Uint8Array): Uint8Array {
  const rate = 136; // 1088 bits / 8  (capacity = 512 bits)

  // Pad
  const blockSize = rate;
  const padLen = blockSize - (data.length % blockSize);
  const padded = new Uint8Array(data.length + padLen);
  padded.set(data);
  padded[data.length] = 0x01;
  padded[padded.length - 1] |= 0x80;

  // Absorb
  const state = new Array<bigint>(25).fill(0n);
  const mask64 = (1n << 64n) - 1n;

  for (let offset = 0; offset < padded.length; offset += blockSize) {
    for (let i = 0; i < blockSize / 8; i++) {
      let lane = 0n;
      for (let b = 0; b < 8; b++) {
        lane |= BigInt(padded[offset + i * 8 + b]) << BigInt(b * 8);
      }
      state[i] ^= lane & mask64;
    }
    keccakF(state);
  }

  // Squeeze (32 bytes)
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    const lane = state[i];
    for (let b = 0; b < 8; b++) {
      out[i * 8 + b] = Number((lane >> BigInt(b * 8)) & 0xffn);
    }
  }
  return out;
}
