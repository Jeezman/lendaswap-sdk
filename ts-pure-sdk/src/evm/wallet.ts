/**
 * EVM wallet / signer abstraction.
 *
 * Consumers inject an implementation that wraps their wallet library
 * (wagmi, viem, ethers, etc.). The SDK uses this interface to sign
 * typed data and send transactions without depending on any specific
 * EVM library.
 */

import type { Permit2TypedData } from "./coordinator.js";

// ── Signer interface ─────────────────────────────────────────────────────────

/**
 * Minimal EVM signer that the SDK needs to fund a swap.
 *
 * Example implementation using wagmi/viem:
 * ```ts
 * const signer: EvmSigner = {
 *   address: walletClient.account.address,
 *   chainId: walletClient.chain.id,
 *   signTypedData: (td) => walletClient.signTypedData({ ...td, account: walletClient.account }),
 *   sendTransaction: (tx) => walletClient.sendTransaction({ to: tx.to, data: tx.data, chain, gas: tx.gas }),
 *   call: (tx) => publicClient.call({ to: tx.to, data: tx.data, account: tx.from, blockNumber: tx.blockNumber }),
 *   getTransactionReceipt: (hash) => publicClient.getTransactionReceipt({ hash }),
 *   getTransaction: (hash) => publicClient.getTransaction({ hash }),
 * };
 * ```
 */
export interface EvmSigner {
  /** The connected wallet address (checksummed or lowercase hex). */
  address: string;
  /** Current chain ID the wallet is connected to. */
  chainId: number;

  /**
   * Sign EIP-712 typed data.
   * Must return the 65-byte hex signature (0x-prefixed).
   */
  signTypedData(typedData: Permit2TypedData): Promise<string>;

  /**
   * Send a raw transaction and return the transaction hash (0x-prefixed).
   */
  sendTransaction(tx: {
    to: string;
    data: string;
    gas?: bigint;
  }): Promise<string>;

  /**
   * Get the receipt for a mined transaction.
   * Must throw or return null if the transaction hasn't been mined yet.
   */
  getTransactionReceipt(hash: string): Promise<TxReceipt | null>;

  /**
   * Get a transaction by hash (used to replay reverted txs for error extraction).
   */
  getTransaction(hash: string): Promise<{
    to: string | null;
    input: string;
    from: string;
  }>;

  /**
   * Simulate a call (used to extract revert reasons from failed transactions).
   */
  call(tx: {
    to: string;
    data: string;
    from?: string;
    blockNumber?: bigint;
  }): Promise<string>;
}

// ── Transaction receipt ──────────────────────────────────────────────────────

export interface TxReceipt {
  status: "success" | "reverted";
  blockNumber: bigint;
  transactionHash: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalise a 20-byte address to a 32-byte ABI-encoded word (no 0x prefix).
 */
function padAddress(addr: string): string {
  return addr.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
}

/**
 * Encode a uint256 as a 32-byte ABI word (no 0x prefix).
 */
function encodeUint256(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

// ERC-20 function selectors
const ALLOWANCE_SELECTOR = "0xdd62ed3e"; // allowance(address,address)
const BALANCE_SELECTOR = "0x70a08231"; // balanceOf(address)
const APPROVE_SELECTOR = "0x095ea7b3"; // approve(address,uint256)

const MAX_UINT256 = BigInt(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
);

/**
 * Encode an `allowance(owner, spender)` call.
 */
export function encodeAllowanceCall(
  tokenAddress: string,
  owner: string,
  spender: string,
): { to: string; data: string } {
  return {
    to: tokenAddress,
    data: `${ALLOWANCE_SELECTOR}${padAddress(owner)}${padAddress(spender)}`,
  };
}

/**
 * Encode a `balanceOf(account)` call.
 */
export function encodeBalanceOfCall(
  tokenAddress: string,
  account: string,
): { to: string; data: string } {
  return {
    to: tokenAddress,
    data: `${BALANCE_SELECTOR}${padAddress(account)}`,
  };
}

/**
 * Encode an `approve(spender, type(uint256).max)` transaction.
 */
export function encodeMaxApproveData(
  tokenAddress: string,
  spender: string,
): { to: string; data: string } {
  return {
    to: tokenAddress,
    data: `${APPROVE_SELECTOR}${padAddress(spender)}${encodeUint256(MAX_UINT256)}`,
  };
}

/**
 * Decode a 32-byte ABI-encoded uint256 from a hex string.
 */
export function decodeUint256(hex: string): bigint {
  const clean = hex.replace(/^0x/i, "");
  if (clean.length === 0) return 0n;
  return BigInt(`0x${clean}`);
}

// ── Poll for receipt ─────────────────────────────────────────────────────────

/**
 * Poll for a transaction receipt until it is mined or a timeout is reached.
 */
export async function pollForReceipt(
  signer: EvmSigner,
  hash: string,
  timeoutMs = 60_000,
): Promise<TxReceipt> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const receipt = await signer.getTransactionReceipt(hash);
      if (receipt?.status != null) return receipt;
    } catch {
      // not mined yet — retry
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error("Timed out waiting for transaction receipt");
}

// ── Revert reason extraction ─────────────────────────────────────────────────

/**
 * Replay a reverted transaction to extract the on-chain revert reason.
 */
export async function getRevertReason(
  signer: EvmSigner,
  txHash: string,
  blockNumber: bigint,
): Promise<string> {
  try {
    const tx = await signer.getTransaction(txHash);
    if (!tx.to) return "Transaction reverted";
    await signer.call({
      to: tx.to,
      data: tx.input,
      from: tx.from,
      blockNumber,
    });
    return "Transaction reverted";
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const match =
      msg.match(/reverted with.*?:\s*(.+)/i) ?? msg.match(/reason:\s*(.+)/i);
    return match?.[1]?.trim() ?? msg;
  }
}

// ── Error classification ─────────────────────────────────────────────────────

/**
 * Returns true if the error message indicates the user rejected the
 * transaction in their wallet (MetaMask, etc.).
 */
export function isUserRejection(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /user rejected|user denied|rejected the request/i.test(msg);
}
