/**
 * Show EVM wallet balances across all supported chains.
 *
 * Displays USDC/USDT balances on Polygon, Arbitrum, Ethereum
 * and native token balances (POL, ETH).
 */

import { createPublicClient, http, formatUnits, type PublicClient } from "viem";
import { polygon, arbitrum, mainnet } from "viem/chains";
import { mnemonicToAccount } from "viem/accounts";

// ERC20 balanceOf ABI
const ERC20_ABI = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Token addresses by chain
const TOKEN_ADDRESSES = {
  polygon: {
    usdc: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" as `0x${string}`, // Native USDC
    usdt: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" as `0x${string}`,
    wbtc: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6" as `0x${string}`,
  },
  arbitrum: {
    usdc: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" as `0x${string}`, // Native USDC
    usdt: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" as `0x${string}`,
    wbtc: "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f" as `0x${string}`,
  },
  ethereum: {
    usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as `0x${string}`,
    usdt: "0xdAC17F958D2ee523a2206206994597C13D831ec7" as `0x${string}`,
    wbtc: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599" as `0x${string}`,
  },
};

// RPC URLs
const RPC_URLS = {
  polygon: "https://polygon.drpc.org",
  arbitrum: "https://arb1.arbitrum.io/rpc",
  ethereum: "https://eth.llamarpc.com",
};

interface TokenBalance {
  symbol: string;
  balance: string;
  raw: bigint;
  displayDecimals: number;
}

interface ChainBalances {
  native: TokenBalance;
  tokens: TokenBalance[];
}

async function getTokenBalance(
  client: PublicClient,
  tokenAddress: `0x${string}`,
  walletAddress: `0x${string}`,
  symbol: string,
  decimals: number,
  displayDecimals: number,
): Promise<TokenBalance> {
  try {
    const balance = await client.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [walletAddress],
    });
    return {
      symbol,
      balance: formatUnits(balance, decimals),
      raw: balance,
      displayDecimals,
    };
  } catch {
    return { symbol, balance: "error", raw: 0n, displayDecimals };
  }
}

async function getNativeBalance(
  client: PublicClient,
  walletAddress: `0x${string}`,
  symbol: string,
): Promise<TokenBalance> {
  try {
    const balance = await client.getBalance({ address: walletAddress });
    return {
      symbol,
      balance: formatUnits(balance, 18),
      raw: balance,
      displayDecimals: 6, // ETH/POL show 6 decimals
    };
  } catch {
    return { symbol, balance: "error", raw: 0n, displayDecimals: 6 };
  }
}

async function getChainBalances(
  chainName: "polygon" | "arbitrum" | "ethereum",
  walletAddress: `0x${string}`,
): Promise<ChainBalances> {
  const chains = { polygon, arbitrum, ethereum: mainnet };
  const nativeSymbols = { polygon: "POL", arbitrum: "ETH", ethereum: "ETH" };

  const client = createPublicClient({
    chain: chains[chainName],
    transport: http(RPC_URLS[chainName]),
  });

  const [native, usdc, usdt, wbtc] = await Promise.all([
    getNativeBalance(client, walletAddress, nativeSymbols[chainName]),
    getTokenBalance(
      client,
      TOKEN_ADDRESSES[chainName].usdc,
      walletAddress,
      "USDC",
      6,  // token decimals
      2,  // display decimals
    ),
    getTokenBalance(
      client,
      TOKEN_ADDRESSES[chainName].usdt,
      walletAddress,
      "USDT",
      6,  // token decimals
      2,  // display decimals
    ),
    getTokenBalance(
      client,
      TOKEN_ADDRESSES[chainName].wbtc,
      walletAddress,
      "WBTC",
      8,  // token decimals
      8,  // display decimals
    ),
  ]);

  return {
    native,
    tokens: [usdc, usdt, wbtc],
  };
}

function formatBalance(balance: string, displayDecimals: number): string {
  const num = parseFloat(balance);
  if (isNaN(num)) return balance;
  if (num === 0) return "0";
  const minValue = Math.pow(10, -displayDecimals);
  if (num > 0 && num < minValue) return `<${minValue}`;
  return num.toFixed(displayDecimals);
}

export async function showEvmBalances(
  evmMnemonic: string | undefined,
): Promise<void> {
  if (!evmMnemonic) {
    console.error("Error: EVM_MNEMONIC environment variable is required.");
    console.error("");
    console.error("Set it in your .env file:");
    console.error('  EVM_MNEMONIC="your twelve word mnemonic phrase here"');
    process.exit(1);
  }

  // Derive address from mnemonic
  const account = mnemonicToAccount(evmMnemonic);
  const walletAddress = account.address;

  console.log("EVM Wallet Balances");
  console.log("=".repeat(60));
  console.log(`Address: ${walletAddress}`);
  console.log("");

  // Fetch balances from all chains in parallel
  console.log("Fetching balances...");
  console.log("");

  const [polygonBalances, arbitrumBalances, ethereumBalances] =
    await Promise.all([
      getChainBalances("polygon", walletAddress),
      getChainBalances("arbitrum", walletAddress),
      getChainBalances("ethereum", walletAddress),
    ]);

  // Display Polygon
  console.log("Polygon:");
  console.log(
    `  ${polygonBalances.native.symbol.padEnd(6)} ${formatBalance(polygonBalances.native.balance, polygonBalances.native.displayDecimals)}`,
  );
  for (const token of polygonBalances.tokens) {
    console.log(`  ${token.symbol.padEnd(6)} ${formatBalance(token.balance, token.displayDecimals)}`);
  }
  console.log("");

  // Display Arbitrum
  console.log("Arbitrum:");
  console.log(
    `  ${arbitrumBalances.native.symbol.padEnd(6)} ${formatBalance(arbitrumBalances.native.balance, arbitrumBalances.native.displayDecimals)}`,
  );
  for (const token of arbitrumBalances.tokens) {
    console.log(`  ${token.symbol.padEnd(6)} ${formatBalance(token.balance, token.displayDecimals)}`);
  }
  console.log("");

  // Display Ethereum
  console.log("Ethereum:");
  console.log(
    `  ${ethereumBalances.native.symbol.padEnd(6)} ${formatBalance(ethereumBalances.native.balance, ethereumBalances.native.displayDecimals)}`,
  );
  for (const token of ethereumBalances.tokens) {
    console.log(`  ${token.symbol.padEnd(6)} ${formatBalance(token.balance, token.displayDecimals)}`);
  }
  console.log("");

  console.log("=".repeat(60));
}
