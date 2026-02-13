/**
 * List available tokens.
 */

import type { Client } from "@lendasat/lendaswap-sdk-pure";

export async function listPairs(client: Client): Promise<void> {
  console.log("Fetching available tokens...\n");

  // #region tokens
  const { btc_tokens, evm_tokens } = await client.getTokens();

  console.log("BTC Tokens:");
  for (const token of btc_tokens) {
    console.log(`  ${token.token_id}: ${token.name} (${token.chain})`);
  }
  console.log("");
  console.log("EVM Tokens:");
  for (const token of evm_tokens) {
    console.log(`  ${token.token_id}: ${token.name} (${token.chain})`);
  }
  // #endregion tokens

  console.log("-".repeat(60));
  console.log(`Total: ${btc_tokens.length + evm_tokens.length} tokens`);
}
