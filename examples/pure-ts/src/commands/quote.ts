/**
 * Get a quote for a swap.
 */

import {
  type Client,
  PriceFeedService,
  type PriceUpdateMessage,
  calculateSourceAmount,
  calculateTargetAmount,
  computeExchangeRate,
  selectTierRate,
} from "@lendasat/lendaswap-sdk-pure";

export async function getQuote(
  client: Client,
  from: string | undefined,
  to: string | undefined,
  amount: string | undefined,
): Promise<void> {
  if (!from || !to || !amount) {
    console.error("Usage: tsx src/index.ts quote <from> <to> <amount>");
    console.error("Example: tsx src/index.ts quote btc_lightning usdc_pol 100000");
    process.exit(1);
  }

  const amountNum = parseInt(amount, 10);
  if (isNaN(amountNum)) {
    console.error("Error: amount must be a number (in satoshis for BTC sources)");
    process.exit(1);
  }

  console.log(`Getting quote: ${from} -> ${to} (amount: ${amountNum})...\n`);

  try {
    // #region get-quote
    const quote = await client.getQuote(from, to, amountNum);

    console.log("Rate:", quote.exchange_rate);
    // ... 96250
    console.log("Network fee:", quote.network_fee, "sats");
    // ... 150 "sats"
    console.log("Protocol fee:", quote.protocol_fee, "sats");
    // ... 500 "sats"
    console.log("Min:", quote.min_amount, "sats");
    // ... 10000 "sats"
    console.log("Max:", quote.max_amount, "sats");
    // ... 10000000 "sats"
    // #endregion get-quote

    console.log("-".repeat(50));
    console.log(`  Fee Rate:       ${(quote.protocol_fee_rate * 100).toFixed(2)}%`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error getting quote: ${message}`);
    process.exit(1);
  }
}

/**
 * Subscribe to real-time price feed updates via WebSocket.
 */
export async function showPriceFeed(apiUrl: string): Promise<void> {
  console.log("Real-Time Price Feed (5 seconds)");
  console.log("=".repeat(60));

  // #region price-feed
  const wsUrl = apiUrl.replace("https://", "wss://").replace("http://", "ws://");
  // ... wsUrl = "wss://apilendaswap.lendasat.com"
  const priceFeed = new PriceFeedService(wsUrl);

  await new Promise<void>((resolve) => {
    const unsubscribe = priceFeed.subscribe((update: PriceUpdateMessage) => {
      console.log("Updated:", new Date(update.timestamp * 1000).toISOString());
      // ... "2025-01-15T12:00:00.000Z"
      for (const pair of update.pairs) {
        console.log(`  ${pair.pair}: tier_1=${pair.tiers.tier_1}`);
        // ... "btc_lightning_usdc_pol: tier_1=96250"
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
}

/**
 * Demonstrate client-side price calculations using tier rates.
 */
export function showPriceCalculation(): void {
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
}
