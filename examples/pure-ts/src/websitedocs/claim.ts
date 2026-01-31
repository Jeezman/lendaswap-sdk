import { createExampleClient, CONFIG } from "./_shared.js";
import { createEvmWallet } from "../evm/wallet.js";

const swapId = process.argv[2];

async function main(): Promise<void> {
  if (!swapId) {
    console.error("Usage: tsx src/websitedocs/claim.ts <swap-id>");
    process.exit(1);
  }

  const { client, close } = await createExampleClient();

  try {
    // ── Gelato Claim (Polygon/Arbitrum) ──────────────────────
    // From: complete-swap/claim-gelato.mdx
    console.log("=".repeat(60));
    console.log("Claim via Gelato (gasless)");
    console.log("=".repeat(60));

    const claimResult = await client.claim(swapId);

    if (claimResult.success) {
      console.log("Claimed! TX:", claimResult.txHash);
    } else {
      console.error("Claim failed:", claimResult.message);
    }

    // ── Manual EVM Claim (Ethereum) ──────────────────────────
    // From: complete-swap/claim-walletconnect.mdx
    // Website docs show wagmi (browser). Here we use viem directly.
    if (claimResult.ethereumClaimData) {
      console.log("");
      console.log("=".repeat(60));
      console.log("Manual EVM Claim (Ethereum)");
      console.log("=".repeat(60));

      if (!CONFIG.evmMnemonic) {
        console.log("EVM_MNEMONIC not set. Claim data for manual execution:");
        console.log("  Contract:", claimResult.ethereumClaimData.contractAddress);
        console.log("  Call Data:", claimResult.ethereumClaimData.callData);
      } else {
        const evmWallet = createEvmWallet(CONFIG.evmMnemonic, "ethereum");

        const txHash = await evmWallet.walletClient.sendTransaction({
          to: claimResult.ethereumClaimData.contractAddress as `0x${string}`,
          data: claimResult.ethereumClaimData.callData as `0x${string}`,
          chain: evmWallet.chain,
          account: evmWallet.account,
        });

        await evmWallet.publicClient.waitForTransactionReceipt({ hash: txHash });
        console.log("Claimed! TX:", txHash);
      }
    }

    // ── Arkade VHTLC Claim ───────────────────────────────────
    // From: complete-swap/claim-vhtlc.mdx
    console.log("");
    console.log("=".repeat(60));
    console.log("Arkade VHTLC Claim");
    console.log("=".repeat(60));

    const arkadeResult = await client.claimArkade(swapId, {
      destinationAddress: "ark1q...", // Your Arkade address
    });

    if (arkadeResult.success) {
      console.log("Claimed! TX:", arkadeResult.txId);
      console.log("Amount:", arkadeResult.claimAmount, "sats");
    } else {
      console.error("Claim failed:", arkadeResult.message);
    }

    // ── Check VHTLC Amounts ──────────────────────────────────
    // From: complete-swap/claim-vhtlc.mdx "Check VHTLC Amounts"
    console.log("");
    console.log("-".repeat(60));
    console.log("VHTLC Amounts");
    console.log("-".repeat(60));

    const amounts = await client.amountsForSwap(swapId);

    console.log("Spendable:", amounts.spendable, "sats");
    console.log("Spent:", amounts.spent, "sats");
    console.log("Recoverable:", amounts.recoverable, "sats");
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
