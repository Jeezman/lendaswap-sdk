/**
 * Limits: fetch and display swap limits for all supported chain pairs.
 */

import { Client, InMemoryWalletStorage } from "../src/index.js";

const client = await Client.builder()
  .withBaseUrl(process.env.BASE_URL || "http://localhost:3333")
  .withSignerStorage(new InMemoryWalletStorage())
  .build();

const { pairs } = await client.getSwapPairs();

console.log("=== Swap Limits (satoshis) ===\n");
console.log(
  `${"Source".padEnd(12)} ${"Target".padEnd(12)} ${"Min".padStart(10)} ${"Max".padStart(12)} ${"Fee %".padStart(12)}`,
);
console.log("-".repeat(62));
for (const pair of pairs) {
  console.log(
    `${String(pair.source).padEnd(12)} ${String(pair.target).padEnd(12)} ${String(pair.min_sats).padStart(10)} ${String(pair.max_sats).padStart(12)} ${String(pair.fee_percentage).padStart(12)}`,
  );
}
