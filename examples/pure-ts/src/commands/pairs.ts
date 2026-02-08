/**
 * List available trading pairs.
 */

import type { Client } from "@lendasat/lendaswap-sdk-pure";

export async function listPairs(client: Client): Promise<void> {
  console.log("Fetching available trading pairs...\n");

  // #region asset-pairs
  const pairs = await client.getAssetPairs();

  for (const pair of pairs) {
    console.log(`${pair.source.token_id} → ${pair.target.token_id}`);
    // ... "btc_lightning → usdc_pol"
  }

  const tokens = await client.getTokens();
  for (const token of tokens) {
    console.log(`${token.token_id}: ${token.name} (${token.chain})`);
    // ... "btc_lightning: Bitcoin Lightning (lightning)"
  }
  // #endregion asset-pairs

  console.log("-".repeat(60));
  console.log(`Total: ${pairs.length} pairs, ${tokens.length} tokens`);
}
