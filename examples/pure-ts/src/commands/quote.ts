/**
 * Get a quote for a swap.
 */

import { type Client, type Chain } from "@lendasat/lendaswap-sdk-pure";

/** Map CLI token IDs to EVM contract addresses (mainnet) */
const EVM_TOKEN_MAP: Record<string, { tokenAddress: string }> = {
  usdc_pol: { tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359" },
  usdc_arb: { tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831" },
  usdc_eth: { tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
  usdt_pol: { tokenAddress: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" },
  usdt_arb: { tokenAddress: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9" },
  usdt_eth: { tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7" },
};

/** Parse a CLI token string like "btc_lightning" or "usdc_pol" into chain + token */
function parseTokenSpec(tokenId: string): { chain: Chain; token: string } | null {
  // BTC variants
  if (tokenId === "btc_lightning") return { chain: "Lightning", token: "btc" };
  if (tokenId === "btc_arkade") return { chain: "Arkade", token: "btc" };
  if (tokenId === "btc_onchain") return { chain: "Bitcoin", token: "btc" };

  // EVM tokens
  const evmToken = EVM_TOKEN_MAP[tokenId];
  if (evmToken) {
    const chain: Chain =
      tokenId.endsWith("_pol") ? "Polygon" :
      tokenId.endsWith("_arb") ? "Arbitrum" :
      tokenId.endsWith("_eth") ? "Ethereum" :
      "Polygon";
    return { chain, token: evmToken.tokenAddress };
  }

  return null;
}

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
    console.error("Error: amount must be a number (in smallest units)");
    process.exit(1);
  }

  const source = parseTokenSpec(from);
  const target = parseTokenSpec(to);
  if (!source) {
    console.error(`Unsupported source token: ${from}`);
    process.exit(1);
  }
  if (!target) {
    console.error(`Unsupported target token: ${to}`);
    process.exit(1);
  }

  console.log(`Getting quote: ${from} -> ${to} (amount: ${amountNum})...\n`);

  try {
    // #region get-quote
    const quote = await client.getQuote({
      sourceChain: source.chain,
      sourceToken: source.token,
      targetChain: target.chain,
      targetToken: target.token,
      sourceAmount: amountNum,
    });

    console.log("Exchange rate:", quote.exchange_rate);
    console.log("Source amount:", quote.source_amount);
    console.log("Target amount:", quote.target_amount);
    console.log("Network fee:", quote.network_fee, "sats");
    console.log("Protocol fee:", quote.protocol_fee, "sats");
    console.log("Min:", quote.min_amount, "sats");
    console.log("Max:", quote.max_amount, "sats");
    // #endregion get-quote

    console.log("-".repeat(50));
    console.log(`  Fee Rate:       ${(quote.protocol_fee_rate * 100).toFixed(2)}%`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error getting quote: ${message}`);
    process.exit(1);
  }
}
