import type { TokenId, TokenSummary } from "./api/client.js";

/** A token identifier: either a plain string TokenId or a TokenSummary object. */
export type TokenInput = TokenId | TokenSummary;

/** Extracts the string TokenId from a TokenInput. */
function toTokenId(token: TokenInput): TokenId {
  return typeof token === "string" ? token : token.symbol;
}

// Well-known token constants
export const BTC_LIGHTNING: TokenId = "lightning:btc";
export const BTC_ARKADE: TokenId = "arkade:btc";
export const BTC_ONCHAIN: TokenId = "bitcoin:btc";

const EVM_CHAINS = ["ethereum", "polygon", "arbitrum"] as const;

/** Returns true if the token is Bitcoin on Lightning. */
export function isLightning(token: TokenInput): boolean {
  return toTokenId(token) === BTC_LIGHTNING;
}

/** Returns true if the token is Bitcoin on Arkade. */
export function isArkade(token: TokenInput): boolean {
  return toTokenId(token) === BTC_ARKADE;
}

/** Returns true if the token is Bitcoin on-chain (L1). */
export function isBtcOnchain(token: TokenInput): boolean {
  return toTokenId(token) === BTC_ONCHAIN;
}

/** Returns true if the token is any form of Bitcoin (Lightning, Arkade, or on-chain). */
export function isBtc(token: TokenInput): boolean {
  return isLightning(token) || isArkade(token) || isBtcOnchain(token);
}

/** Returns true if the token lives on an EVM chain (suffix _eth, _pol, or _arb). */
export function isEvmToken(token: TokenInput): boolean {
  const id = toTokenId(token);
  return EVM_CHAINS.some((chain) => id.endsWith(`_${chain}`));
}

/** Returns true if the token lives on Ethereum (suffix _eth). */
export function isEthereumToken(token: TokenInput): boolean {
  return toTokenId(token).endsWith("_eth");
}

/** Returns true if the token lives on Polygon (suffix _pol). */
export function isPolygonToken(token: TokenInput): boolean {
  return toTokenId(token).endsWith("_pol");
}

/** Returns true if the token lives on Arbitrum (suffix _arb). */
export function isArbitrumToken(token: TokenInput): boolean {
  return toTokenId(token).endsWith("_arb");
}

export type NetworkName =
  | "ethereum"
  | "polygon"
  | "arbitrum"
  | "lightning"
  | "arkade"
  | "bitcoin"
  | "unknown";

/** Maps a token ID to its canonical lowercase network slug. */
export function networkName(token: TokenInput): NetworkName {
  if (isEthereumToken(token)) return "ethereum";
  if (isPolygonToken(token)) return "polygon";
  if (isArbitrumToken(token)) return "arbitrum";
  if (isLightning(token)) return "lightning";
  if (isArkade(token)) return "arkade";
  if (isBtcOnchain(token)) return "bitcoin";
  return "unknown";
}
