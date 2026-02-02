import {
  PriceFeedService,
  type PriceUpdateMessage,
  calculateSourceAmount,
  calculateTargetAmount,
  computeExchangeRate,
  selectTierRate,
} from "@lendasat/lendaswap-sdk-pure";
import { CONFIG, createExampleClient } from "./_shared.js";

async function main(): Promise<void> {
  const { client, close } = await createExampleClient();

  try {
    // ── Get Quote ────────────────────────────────────────────
    // From: quotes-rates/exchange-rate.mdx
    console.log("=".repeat(60));
    console.log("Get Quote");
    console.log("=".repeat(60));

    // #region get-quote
    const quote = await client.getQuote("btc_lightning", "usdc_pol", 100000);

    console.log("Rate:", quote.exchange_rate);
    console.log("Network fee:", quote.network_fee, "sats");
    console.log("Protocol fee:", quote.protocol_fee, "sats");
    console.log("Min:", quote.min_amount, "sats");
    console.log("Max:", quote.max_amount, "sats");
    // #endregion get-quote

    // ── Real-Time Price Feed ─────────────────────────────────
    // From: quotes-rates/exchange-rate.mdx
    console.log("");
    console.log("=".repeat(60));
    console.log("Real-Time Price Feed (5 seconds)");
    console.log("=".repeat(60));

    // #region price-feed
    const wsUrl = CONFIG.apiUrl.replace("https://", "wss://").replace("http://", "ws://");
    const priceFeed = new PriceFeedService(wsUrl);

    await new Promise<void>((resolve) => {
      const unsubscribe = priceFeed.subscribe((update: PriceUpdateMessage) => {
        console.log("Updated:", new Date(update.timestamp * 1000).toISOString());
        for (const pair of update.pairs) {
          console.log(`  ${pair.pair}: tier_1=${pair.tiers.tier_1}`);
        }
      });

      // Listen for 5 seconds then close
      setTimeout(() => {
        unsubscribe();
        priceFeed.close();
        resolve();
      }, 5000);
    });
    // #endregion price-feed

    // ── Price Calculation ────────────────────────────────────
    // From: quotes-rates/exchange-rate.mdx
    console.log("");
    console.log("=".repeat(60));
    console.log("Price Calculations");
    console.log("=".repeat(60));

    // Example using tier rates from a price feed update
    const priceTiers = { tier_1: 100000, tier_2: 99500, tier_3: 99000 };

    // #region price-calculation
    // Get rate for amount tier
    const rate = selectTierRate(priceTiers, 100000);
    const networkFee = 0.0001; // in BTC

    // Compute the exchange rate (handles inversion for BTC→EVM)
    const exchangeRate = computeExchangeRate(rate, true, true);

    // Calculate: "I want to send 100k sats, how much USDC?"
    const targetAmount = calculateTargetAmount(0.001, exchangeRate, networkFee, true, false);

    // Calculate: "I want to receive 50 USDC, how many sats?"
    const sourceAmount = calculateSourceAmount(50, exchangeRate, networkFee, true, false);
    // #endregion price-calculation
    console.log("Target amount (USDC) for 100k sats:", targetAmount);
    console.log("Source amount (sats) for 50 USDC:", sourceAmount);

    // ── Asset Pairs & Tokens ─────────────────────────────────
    // From: quotes-rates/supported-tokens.mdx
    console.log("");
    console.log("=".repeat(60));
    console.log("Asset Pairs");
    console.log("=".repeat(60));

    // #region asset-pairs
    const pairs = await client.getAssetPairs();

    for (const pair of pairs) {
      console.log(`${pair.source.token_id} → ${pair.target.token_id}`);
    }

    const tokens = await client.getTokens();
    for (const token of tokens) {
      console.log(`${token.token_id}: ${token.name} (${token.chain})`);
    }
    // #endregion asset-pairs
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
