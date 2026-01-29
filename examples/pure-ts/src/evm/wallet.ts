/**
 * EVM Wallet utilities for the CLI.
 *
 * Creates an EVM wallet from a mnemonic for signing transactions.
 */

import {
  createWalletClient,
  createPublicClient,
  http,
  type WalletClient,
  type PublicClient,
  type Chain,
  type Account,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { polygon, arbitrum, mainnet } from "viem/chains";

/** Supported EVM chains */
export type EvmChainName = "polygon" | "arbitrum" | "ethereum";

/** Chain configuration */
const CHAINS: Record<EvmChainName, Chain> = {
  polygon,
  arbitrum,
  ethereum: mainnet,
};

/** Default RPC URLs (can be overridden via env) */
const DEFAULT_RPC_URLS: Record<EvmChainName, string> = {
  polygon: "https://polygon-rpc.com",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  ethereum: "https://eth.llamarpc.com",
};

export interface EvmWallet {
  /** The wallet client for signing transactions */
  walletClient: WalletClient;
  /** The public client for reading chain state */
  publicClient: PublicClient;
  /** The account derived from mnemonic */
  account: Account;
  /** The chain this wallet is connected to */
  chain: Chain;
  /** The wallet address */
  address: string;
}

/**
 * Creates an EVM wallet from a mnemonic.
 *
 * @param mnemonic - BIP39 mnemonic phrase
 * @param chainName - The chain to connect to
 * @param rpcUrl - Optional custom RPC URL
 * @returns The EVM wallet
 */
export function createEvmWallet(
  mnemonic: string,
  chainName: EvmChainName,
  rpcUrl?: string,
): EvmWallet {
  const chain = CHAINS[chainName];
  if (!chain) {
    throw new Error(`Unsupported chain: ${chainName}`);
  }

  const url = rpcUrl || DEFAULT_RPC_URLS[chainName];

  // Derive account from mnemonic (default path: m/44'/60'/0'/0/0)
  const account = mnemonicToAccount(mnemonic);

  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(url),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(url),
  });

  return {
    walletClient,
    publicClient,
    account,
    chain,
    address: account.address,
  };
}

/**
 * Gets the chain name from a token ID.
 *
 * @param tokenId - Token ID (e.g., "usdc_pol", "usdc_arb", "usdc_eth")
 * @returns The chain name or undefined
 */
export function getChainFromToken(tokenId: string): EvmChainName | undefined {
  if (tokenId.endsWith("_pol")) return "polygon";
  if (tokenId.endsWith("_arb")) return "arbitrum";
  if (tokenId.endsWith("_eth")) return "ethereum";
  return undefined;
}
