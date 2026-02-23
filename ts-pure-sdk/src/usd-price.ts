/**
 * USD price fetching utilities using CoinGecko API.
 *
 * Provides functions to fetch current USD prices for tokens supported by the SDK.
 *
 * @example
 * ```typescript
 * import { getUsdPrices } from '@lendasat/lendaswap-sdk';
 *
 * const prices = await getUsdPrices([
 *   { symbol: "BTC", chain: "Lightning", token_id: "btc", name: "Bitcoin", decimals: 0 },
 *   { symbol: "USDC", chain: "137", token_id: "usdc_pol", name: "USDC", decimals: 6 },
 * ]);
 * // prices is a Map<TokenInfo, number | null>
 * ```
 */

import type { TokenInfo } from "./api/client.js";

const COINGECKO_API = "https://api.coingecko.com/api/v3";

/**
 * Mapping from lowercase token symbol to CoinGecko coin ID.
 * Symbols are unique per chain, and the CoinGecko ID only depends on the symbol.
 */
const SYMBOL_TO_COINGECKO: Record<string, string> = {
  btc: "bitcoin",
  usdc: "usd-coin",
  usdt: "tether",
  usdt0: "tether",
  xaut: "tether-gold",
  wbtc: "wrapped-bitcoin",
  pol: "matic-network",
  eth: "ethereum",
};

interface CoinGeckoSimplePriceResponse {
  [coinId: string]: {
    usd: number;
  };
}

/**
 * Get the CoinGecko ID for a token by its symbol.
 *
 * @returns CoinGecko coin ID or null if not supported
 */
export function getCoinGeckoId(token: TokenInfo): string | null {
  return SYMBOL_TO_COINGECKO[token.symbol.toLowerCase()] ?? null;
}

/**
 * Fetch current USD prices for multiple tokens in a single CoinGecko request.
 *
 * @param tokens - Array of TokenInfo objects
 * @returns Array of `{ token, usdPrice }` results in the same order as input
 */
export async function getUsdPrices(
  tokens: TokenInfo[],
): Promise<{ token: TokenInfo; usdPrice: number | null }[]> {
  // Resolve unique CoinGecko IDs we need to fetch
  const coinGeckoIds = new Set<string>();
  for (const token of tokens) {
    const id = getCoinGeckoId(token);
    if (id) coinGeckoIds.add(id);
  }

  if (coinGeckoIds.size === 0) {
    return tokens.map((token) => ({ token, usdPrice: null }));
  }

  const params = new URLSearchParams({
    ids: [...coinGeckoIds].join(","),
    vs_currencies: "usd",
  });

  try {
    const response = await fetch(`${COINGECKO_API}/simple/price?${params}`);

    if (!response.ok) {
      console.error(
        `CoinGecko API error: ${response.status} ${response.statusText}`,
      );
      return tokens.map((token) => ({ token, usdPrice: null }));
    }

    const data: CoinGeckoSimplePriceResponse = await response.json();

    return tokens.map((token) => {
      const coinGeckoId = getCoinGeckoId(token);
      if (!coinGeckoId) return { token, usdPrice: null };

      const priceData = data[coinGeckoId];
      if (!priceData) return { token, usdPrice: null };

      return { token, usdPrice: priceData.usd };
    });
  } catch (error) {
    console.error("Failed to fetch USD prices from CoinGecko:", error);
    return tokens.map((token) => ({ token, usdPrice: null }));
  }
}
