/**
 * List available trading pairs.
 */

import type { Client } from "@lendasat/lendaswap-sdk-pure";

export async function listPairs(client: Client): Promise<void> {
  console.log("Fetching available trading pairs...\n");
  const pairs = await client.getAssetPairs();

  console.log("Available Trading Pairs:");
  console.log("-".repeat(60));

  for (const pair of pairs) {
    const sourceId = pair.source.token_id;
    const targetId = pair.target.token_id;
    const sourceSymbol = pair.source.symbol;
    const targetSymbol = pair.target.symbol;
    console.log(`  ${sourceSymbol.padEnd(8)} (${sourceId.padEnd(14)}) -> ${targetSymbol.padEnd(8)} (${targetId})`);
  }

  console.log("-".repeat(60));
  console.log(`Total: ${pairs.length} pairs`);
}
