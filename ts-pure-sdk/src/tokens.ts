import type { Chain, TokenId, TokenInfo } from "./api/client.js";

/** A token identifier: either a plain string TokenId or a TokenInfo object. */
export type TokenInput = TokenId;

// ── Asset ────────────────────────────────────────────────────────────────────

/**
 * Minimal asset identifier — just a chain and token ID.
 *
 * Use the predefined constants in {@link Asset} for common tokens,
 * or construct your own for any token the API supports:
 *
 * ```ts
 * // Predefined
 * Asset.BTC_ARKADE
 * Asset.USDC_POLYGON
 *
 * // Custom (any ERC-20 by contract address)
 * { chain: "137", tokenId: "0x..." }
 * ```
 */
export interface Asset {
  /** Chain identifier — e.g. "Lightning", "Arkade", "Bitcoin", "137", "1", "42161" */
  chain: Chain | (string & {});
  /** Token ID — "btc" for Bitcoin, or the ERC-20 contract address for EVM tokens */
  tokenId: string;
}

// Well-known USDC contract addresses
const USDC_POLYGON = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const USDC_ARBITRUM = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const USDC_ETHEREUM = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

// Well-known USDT contract addresses
const USDT_POLYGON = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
const USDT_ARBITRUM = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";
const USDT_ETHEREUM = "0xdAC17F958D2ee523a2206206994597C13D831ec7";

// Well-known WBTC contract addresses
const WBTC_POLYGON = "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6";
const WBTC_ETHEREUM = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";

// Well-known tBTC contract addresses
const TBTC_ETHEREUM = "0x18084fbA666a33d37592fA2633fD49a74DD93a88";
const TBTC_ARBITRUM = "0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40";

/**
 * Predefined asset constants for common tokens.
 *
 * ```ts
 * import { Asset } from "@lendasat/lendaswap-sdk-pure";
 *
 * await client.createSwap({
 *   source: Asset.BTC_ARKADE,
 *   target: Asset.USDC_POLYGON,
 *   sourceAmount: 100_000,
 *   targetAddress: "0x...",
 * });
 * ```
 */
export const Asset = {
  // Bitcoin
  BTC_LIGHTNING: { chain: "Lightning", tokenId: "btc" } as Asset,
  BTC_ARKADE: { chain: "Arkade", tokenId: "btc" } as Asset,
  BTC_ONCHAIN: { chain: "Bitcoin", tokenId: "btc" } as Asset,

  // USDC
  USDC_POLYGON: { chain: "137", tokenId: USDC_POLYGON } as Asset,
  USDC_ARBITRUM: { chain: "42161", tokenId: USDC_ARBITRUM } as Asset,
  USDC_ETHEREUM: { chain: "1", tokenId: USDC_ETHEREUM } as Asset,

  // USDT
  USDT_POLYGON: { chain: "137", tokenId: USDT_POLYGON } as Asset,
  USDT_ARBITRUM: { chain: "42161", tokenId: USDT_ARBITRUM } as Asset,
  USDT_ETHEREUM: { chain: "1", tokenId: USDT_ETHEREUM } as Asset,

  // WBTC
  WBTC_POLYGON: { chain: "137", tokenId: WBTC_POLYGON } as Asset,
  WBTC_ETHEREUM: { chain: "1", tokenId: WBTC_ETHEREUM } as Asset,

  // tBTC
  TBTC_ETHEREUM: { chain: "1", tokenId: TBTC_ETHEREUM } as Asset,
  TBTC_ARBITRUM: { chain: "42161", tokenId: TBTC_ARBITRUM } as Asset,
} as const;

// ── Legacy constants (kept for backward compatibility) ───────────────────────

// Well-known token ID constants
export const BTC_LIGHTNING: TokenId = "btc";
export const BTC_ARKADE: TokenId = "btc";
export const BTC_ONCHAIN: TokenId = "btc";

// Well-known TokenInfo constants
export const BTC_LIGHTNING_INFO: TokenInfo = {
  token_id: BTC_LIGHTNING,
  symbol: "BTC",
  name: "Bitcoin (Lightning)",
  decimals: 8,
  chain: "Lightning",
};

export const BTC_ARKADE_INFO: TokenInfo = {
  token_id: BTC_ARKADE,
  symbol: "BTC",
  name: "Bitcoin (Arkade)",
  decimals: 8,
  chain: "Arkade",
};

export const BTC_ONCHAIN_INFO: TokenInfo = {
  token_id: BTC_ONCHAIN,
  symbol: "BTC",
  name: "Bitcoin (On-chain)",
  decimals: 8,
  chain: "Bitcoin",
};

const EVM_CHAINS = ["1", "137", "42161"] as const;

/** Returns true if the token is Bitcoin on Lightning. */
export function isLightning(token: { chain: string }): boolean {
  return token.chain === "Lightning";
}

/** Returns true if the token is Bitcoin on Arkade. */
export function isArkade(token: { chain: string }): boolean {
  return token.chain === "Arkade";
}

/** Returns true if the token is Bitcoin on-chain (L1). */
export function isBtcOnchain(token: { chain: string }): boolean {
  return token.chain === "Bitcoin";
}

/** Returns true if the token is any form of Bitcoin (Lightning, Arkade, or on-chain). */
export function isBtc(token: { chain: string }): boolean {
  return isLightning(token) || isArkade(token) || isBtcOnchain(token);
}

/**
 * Returns true if the token is a BTC-pegged EVM token (WBTC or tBTC).
 * These tokens should be displayed like BTC (sats/BTC, 8 decimal precision)
 * even though tBTC has 18 on-chain decimals.
 */
export function isBtcPegged(token: { chain: string; symbol: string }): boolean {
  const sym = token.symbol.toLowerCase();
  return (sym === "wbtc" || sym === "tbtc") && isEvmToken(token.chain);
}

/** Returns true if the chain is an EVM chain (Ethereum, Polygon, or Arbitrum). */
export function isEvmToken(chain: string): boolean {
  return EVM_CHAINS.includes(
    chain.toLowerCase() as (typeof EVM_CHAINS)[number],
  );
}

/** Returns true if the chain is Ethereum. */
export function isEthereumToken(c: string): boolean {
  return c === "ethereum" || c === "1";
}

/** Returns true if the chain is Polygon. */
export function isPolygonToken(c: string): boolean {
  return c === "polygon" || c === "137";
}

/** Returns true if the chain is Arbitrum. */
export function isArbitrumToken(chain: string): boolean {
  return chain === "arbitrum" || chain === "42161";
}

/** Normalizes any chain string to its canonical PascalCase Chain value. */
export function toChain(str: string): Chain {
  const c = str.toLowerCase();
  if (c === "ethereum" || c === "1") return "1";
  if (c === "polygon" || c === "137") return "137";
  if (c === "arbitrum" || c === "42161") return "42161";
  if (c === "lightning") return "Lightning";
  if (c === "arkade") return "Arkade";
  if (c === "bitcoin") return "Bitcoin";
  return "Bitcoin";
}

export function toChainName(chain: Chain): string {
  switch (chain) {
    case "1":
      return "Ethereum";
    case "137":
      return "Polygon";
    case "42161":
      return "Arbitrum";
    default:
      return chain.toString();
  }
}
