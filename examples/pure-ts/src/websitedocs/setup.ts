import { Signer } from "@lendasat/lendaswap-sdk-pure";
import { createExampleClient } from "./_shared.js";

async function main(): Promise<void> {
  // ── Generate New Mnemonic ──────────────────────────────────
  // From: setup/wallet-mnemonic.mdx
  console.log("=".repeat(60));
  console.log("Generate New Mnemonic");
  console.log("=".repeat(60));

  // #region generate-mnemonic
  const signer = Signer.generate();
  console.log("Mnemonic:", signer.mnemonic);
  // #endregion generate-mnemonic
  console.log("");

  // ── Initialize Client ──────────────────────────────────────
  // From: setup/get-version.mdx
  // In the website docs this uses IdbWalletStorage + IdbSwapStorage.
  // Here we use SQLite via _shared.ts.
  console.log("=".repeat(60));
  console.log("Initialize Client");
  console.log("=".repeat(60));

  const { client, close } = await createExampleClient();

  try {
    // ── Get Version ────────────────────────────────────────────
    // From: setup/get-version.mdx
    console.log("");
    console.log("-".repeat(60));
    console.log("API Version & Health Check");
    console.log("-".repeat(60));

    // #region get-version
    const version = await client.getVersion();
    console.log("API version:", version.tag);
    console.log("Commit:", version.commit_hash);

    const health = await client.healthCheck();
    console.log("API status:", health); // "ok"
    // #endregion get-version

    // ── Get Xpub & Mnemonic ────────────────────────────────────
    // From: setup/wallet-mnemonic.mdx
    console.log("");
    console.log("-".repeat(60));
    console.log("Wallet Info");
    console.log("-".repeat(60));

    // #region get-xpub
    const xpub = client.getUserIdXpub();
    console.log("User ID xpub:", xpub);

    // Retrieve stored mnemonic (for backup)
    const mnemonic = client.getMnemonic();
    // #endregion get-xpub
    console.log("Stored mnemonic:", mnemonic);
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
