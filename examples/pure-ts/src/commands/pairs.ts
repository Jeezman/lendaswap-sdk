/**
 * List available tokens.
 */

import type { Client } from "@lendasat/lendaswap-sdk-pure";

export async function listPairs(client: Client): Promise<void> {
  console.log("Fetching available tokens...\n");

  // #region tokens
  const tokens = await client.getTokens();
  for (const token of tokens) {
    console.log(`${token.token_id}: ${token.name} (${token.chain})`);
    // ... "btc_lightning: Bitcoin Lightning (lightning)"
  }
  // #endregion tokens

  console.log("-".repeat(60));
  console.log(`Total: ${tokens.length} tokens`);
}
