/**
 * Show wallet and API info.
 */

import { Signer, type Client } from "@lendasat/lendaswap-sdk-pure";

interface Config {
  apiUrl: string;
  mnemonic?: string;
  orgCode?: string;
  dbPath?: string;
}

export async function showInfo(client: Client, config: Config): Promise<void> {
  console.log("Wallet & API Information");
  console.log("=".repeat(60));
  console.log("");

  // #region generate-mnemonic
  const signer = Signer.generate();
  console.log("Mnemonic:", signer.mnemonic);
  // ... "abandon ability able about above absent absorb abstract absurd abuse access accident"
  // #endregion generate-mnemonic

  // Wallet info
  console.log("Wallet:");
  console.log("-".repeat(40));

  // #region get-xpub
  const xpub = client.getUserIdXpub();
  console.log("User ID xpub:", xpub);
  // ... "xpub6CUGRUo..."

  // Retrieve stored mnemonic (for backup)
  const mnemonic = client.getMnemonic();
  // #endregion get-xpub

  const words = mnemonic.split(" ");
  const maskedMnemonic = words
    .map((word, i) => (i === 0 || i === words.length - 1 ? word : "****"))
    .join(" ");

  console.log(`  Mnemonic:    ${maskedMnemonic}`);
  console.log(`  Word Count:  ${words.length}`);

  const keyIndex = await client.getKeyIndex();
  console.log(`  Key Index:   ${keyIndex}`);

  console.log(`  User ID:     ${xpub.slice(0, 16)}...${xpub.slice(-8)}`);
  console.log("");

  // API info
  console.log("API:");
  console.log("-".repeat(40));
  console.log(`  URL:         ${config.apiUrl}`);
  console.log(`  Org code:     ${config.orgCode ? "****" + config.orgCode.slice(-4) : "(none)"}`);

  try {
    // #region get-version
    const version = await client.getVersion();
    console.log("API version:", version.tag);
    // ... "v0.5.0"
    console.log("Commit:", version.commit_hash);
    // ... "a1b2c3d4e5f6"

    const health = await client.healthCheck();
    console.log("API status:", health);
    // ... "ok"
    // #endregion get-version
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
