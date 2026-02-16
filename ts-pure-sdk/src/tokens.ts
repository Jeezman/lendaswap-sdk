import type { Chain, TokenId, TokenInfo } from "./api/client.js";

/** A token identifier: either a plain string TokenId or a TokenInfo object. */
export type TokenInput = TokenId | TokenInfo;

/** Extracts the string TokenId from a TokenInput. */
function toTokenId(token: TokenInput): TokenId {
  return typeof token === "string" ? token : token.token_id;
}

// Well-known token ID constants
export const BTC_LIGHTNING: TokenId = "btc_lightning";
export const BTC_ARKADE: TokenId = "btc_arkade";
export const BTC_ONCHAIN: TokenId = "btc_onchain";

// Well-known TokenInfo constants
export const BTC_LIGHTNING_INFO: TokenInfo = {
  token_id: BTC_LIGHTNING,
  symbol: "BTC",
  name: "Bitcoin (Lightning)",
  decimals: 0,
  chain: "Lightning",
};

export const BTC_ARKADE_INFO: TokenInfo = {
  token_id: BTC_ARKADE,
  symbol: "BTC",
  name: "Bitcoin (Arkade)",
  decimals: 0,
  chain: "Arkade",
};

export const BTC_ONCHAIN_INFO: TokenInfo = {
  token_id: BTC_ONCHAIN,
  symbol: "BTC",
  name: "Bitcoin (On-chain)",
  decimals: 0,
  chain: "Bitcoin",
};

const EVM_CHAINS = ["ethereum", "polygon", "arbitrum"] as const;

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

/** Returns true if the chain is an EVM chain (Ethereum, Polygon, or Arbitrum). */
export function isEvmToken(chain: string): boolean {
  return EVM_CHAINS.includes(
    chain.toLowerCase() as (typeof EVM_CHAINS)[number],
  );
}

/** Returns true if the chain is Ethereum. */
export function isEthereumToken(chain: string): boolean {
  return chain.toLowerCase() === "ethereum";
}

/** Returns true if the chain is Polygon. */
export function isPolygonToken(chain: string): boolean {
  return chain.toLowerCase() === "polygon";
}

/** Returns true if the chain is Arbitrum. */
export function isArbitrumToken(chain: string): boolean {
  return chain.toLowerCase() === "arbitrum";
}

/** Resolves a TokenInput to its Chain value. */
export function tokenChain(token: TokenInput): Chain {
  const id = toTokenId(token);
  if (id === BTC_LIGHTNING) return "Lightning";
  if (id === BTC_ARKADE) return "Arkade";
  if (id === BTC_ONCHAIN) return "Bitcoin";
  if (id.endsWith("_eth")) return "Ethereum";
  if (id.endsWith("_pol")) return "Polygon";
  if (id.endsWith("_arb")) return "Arbitrum";
  return "Bitcoin";
}

/** Normalizes any chain string to its canonical PascalCase Chain value. */
export function toChain(str: string): Chain {
  const c = str.toLowerCase();
  if (c === "ethereum") return "Ethereum";
  if (c === "polygon") return "Polygon";
  if (c === "arbitrum") return "Arbitrum";
  if (c === "lightning") return "Lightning";
  if (c === "arkade") return "Arkade";
  if (c === "bitcoin") return "Bitcoin";
  return "Bitcoin";
}
