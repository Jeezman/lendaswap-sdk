import type { Chain, TokenId, TokenInfo } from "./api/client.js";

/** A token identifier: either a plain string TokenId or a TokenInfo object. */
export type TokenInput = TokenId;

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
export function isLightning(token: TokenInfo): boolean {
  return token.chain === "Lightning";
}

/** Returns true if the token is Bitcoin on Arkade. */
export function isArkade(token: TokenInfo): boolean {
  return token.chain === "Arkade";
}

/** Returns true if the token is Bitcoin on-chain (L1). */
export function isBtcOnchain(token: TokenInfo): boolean {
  return token.chain === "Bitcoin";
}

/** Returns true if the token is any form of Bitcoin (Lightning, Arkade, or on-chain). */
export function isBtc(token: TokenInfo): boolean {
  return isLightning(token) || isArkade(token) || isBtcOnchain(token);
}

/**
 * Returns true if the token is a BTC-pegged EVM token (WBTC or tBTC).
 * These tokens should be displayed like BTC (sats/BTC, 8 decimal precision)
 * even though tBTC has 18 on-chain decimals.
 */
export function isBtcPegged(token: TokenInfo): boolean {
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
