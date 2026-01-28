/**
 * Get a quote for a swap.
 */

import type { Client } from "@lendasat/lendaswap-sdk-pure";

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
    const quote = await client.getQuote(from, to, amountNum);

    console.log("Quote Details:");
    console.log("-".repeat(50));
    console.log(`  From:           ${from}`);
    console.log(`  To:             ${to}`);
    console.log(`  Base Amount:    ${amountNum} sats`);
    console.log("-".repeat(50));
    console.log(`  Exchange Rate:  ${quote.exchange_rate}`);
    console.log(`  Network Fee:    ${quote.network_fee} sats`);
    console.log(`  Protocol Fee:   ${quote.protocol_fee} sats`);
    console.log(`  Fee Rate:       ${(quote.protocol_fee_rate * 100).toFixed(2)}%`);
    console.log("-".repeat(50));
    console.log(`  Min Amount:     ${quote.min_amount} sats`);
    console.log(`  Max Amount:     ${quote.max_amount} sats`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error getting quote: ${message}`);
    process.exit(1);
  }
}
