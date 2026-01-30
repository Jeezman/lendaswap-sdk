import type { TokenId } from "./api/client.js";

// Well-known token constants
export const BTC_LIGHTNING: TokenId = "btc_lightning";
export const BTC_ARKADE: TokenId = "btc_arkade";
export const BTC_ONCHAIN: TokenId = "btc_onchain";

const EVM_CHAINS = ["eth", "pol", "arb"] as const;

/** Returns true if the token is Bitcoin on Lightning. */
export function isLightning(tokenId: TokenId): boolean {
  return tokenId === BTC_LIGHTNING;
}

/** Returns true if the token is Bitcoin on Arkade. */
export function isArkade(tokenId: TokenId): boolean {
  return tokenId === BTC_ARKADE;
}

/** Returns true if the token is Bitcoin on-chain (L1). */
export function isBtcOnchain(tokenId: TokenId): boolean {
  return tokenId === BTC_ONCHAIN;
}

/** Returns true if the token is any form of Bitcoin (Lightning, Arkade, or on-chain). */
export function isBtc(tokenId: TokenId): boolean {
  return isLightning(tokenId) || isArkade(tokenId) || isBtcOnchain(tokenId);
}

/** Returns true if the token lives on an EVM chain (suffix _eth, _pol, or _arb). */
export function isEvmToken(tokenId: TokenId): boolean {
  return EVM_CHAINS.some((chain) => tokenId.endsWith(`_${chain}`));
}

/** Returns true if the token lives on Ethereum (suffix _eth). */
export function isEthereumToken(tokenId: TokenId): boolean {
  return tokenId.endsWith("_eth");
}

/** Returns true if the token lives on Polygon (suffix _pol). */
export function isPolygonToken(tokenId: TokenId): boolean {
  return tokenId.endsWith("_pol");
}

/** Returns true if the token lives on Arbitrum (suffix _arb). */
export function isArbitrumToken(tokenId: TokenId): boolean {
  return tokenId.endsWith("_arb");
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
export function networkName(tokenId: TokenId): NetworkName {
  if (isEthereumToken(tokenId)) return "ethereum";
  if (isPolygonToken(tokenId)) return "polygon";
  if (isArbitrumToken(tokenId)) return "arbitrum";
  if (isLightning(tokenId)) return "lightning";
  if (isArkade(tokenId)) return "arkade";
  if (isBtcOnchain(tokenId)) return "bitcoin";
  return "unknown";
}
