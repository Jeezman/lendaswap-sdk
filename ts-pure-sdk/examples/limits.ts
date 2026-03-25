/**
 * Limits: fetch and display swap limits for all supported chain pairs.
 */

import { Client, InMemoryWalletStorage } from "../src";

const client = await Client.builder()
  .withBaseUrl(process.env.BASE_URL || "http://localhost:3333")
  .withSignerStorage(new InMemoryWalletStorage())
  .build();

const { limits } = await client.getLimits();

console.log("=== Swap Limits (satoshis) ===\n");
console.log(
  `${"Source".padEnd(12)} ${"Target".padEnd(12)} ${"Min".padStart(10)} ${"Max".padStart(12)}`,
);
console.log("-".repeat(50));
for (const l of limits) {
  console.log(
    `${String(l.source).padEnd(12)} ${String(l.target).padEnd(12)} ${String(l.min_sats).padStart(10)} ${String(l.max_sats).padStart(12)}`,
  );
}
