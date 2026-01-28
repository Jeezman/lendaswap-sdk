/**
 * Show wallet and API info.
 */

import type { Client } from "@lendasat/lendaswap-sdk-pure";

interface Config {
  apiUrl: string;
  mnemonic?: string;
  apiKey?: string;
  dbPath?: string;
}

export async function showInfo(client: Client, config: Config): Promise<void> {
  console.log("Wallet & API Information");
  console.log("=".repeat(60));
  console.log("");

  // Wallet info
  console.log("Wallet:");
  console.log("-".repeat(40));

  const mnemonic = client.getMnemonic();
  const words = mnemonic.split(" ");
  const maskedMnemonic = words
    .map((word, i) => (i === 0 || i === words.length - 1 ? word : "****"))
    .join(" ");

  console.log(`  Mnemonic:    ${maskedMnemonic}`);
  console.log(`  Word Count:  ${words.length}`);

  const keyIndex = await client.getKeyIndex();
  console.log(`  Key Index:   ${keyIndex}`);

  const xpub = client.getUserIdXpub();
  console.log(`  User ID:     ${xpub.slice(0, 16)}...${xpub.slice(-8)}`);
  console.log("");

  // API info
  console.log("API:");
  console.log("-".repeat(40));
  console.log(`  URL:         ${config.apiUrl}`);
  console.log(`  API Key:     ${config.apiKey ? "****" + config.apiKey.slice(-4) : "(none)"}`);

  try {
    const version = await client.getVersion();
    console.log(`  Version:     ${version.tag}`);
    console.log(`  Commit:      ${version.commit_hash.slice(0, 8)}`);
    console.log(`  Health:      OK`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  Status:      Error - ${message}`);
  }

  console.log("");

  // Storage info
  console.log("Storage:");
  console.log("-".repeat(40));
  console.log(`  Database:    ${config.dbPath || "(in-memory)"}`);
  console.log("");
  console.log("=".repeat(60));
}
