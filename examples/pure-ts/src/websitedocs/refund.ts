import { createExampleClient, CONFIG } from "./_shared.js";
import { createEvmWallet } from "../evm/wallet.js";

const swapId = process.argv[2];

async function main(): Promise<void> {
  if (!swapId) {
    console.error("Usage: tsx src/websitedocs/refund.ts <swap-id>");
    process.exit(1);
  }

  const { client, close } = await createExampleClient();

  try {
    // ── VHTLC Refund (Arkade) ────────────────────────────────
    // From: handle-failures/refund-vhtlc.mdx
    console.log("=".repeat(60));
    console.log("VHTLC Refund (Arkade)");
    console.log("=".repeat(60));

    // #region refund-vhtlc
    const vhtlcResult = await client.refundSwap(swapId, {
      destinationAddress: "ark1q...", // Your Arkade address
    });

    if (vhtlcResult.success) {
      console.log("Refunded:", vhtlcResult.txId);
      console.log("Amount:", vhtlcResult.refundAmount, "sats");
    } else {
      console.error(vhtlcResult.message);
    }
    // #endregion refund-vhtlc

    // ── VHTLC Refund with Status Check ───────────────────────
    // From: handle-failures/refund-vhtlc.mdx "Complete Refund Flow"
    console.log("");
    console.log("-".repeat(60));
    console.log("VHTLC Refund with Status Check");
    console.log("-".repeat(60));

    // #region refund-vhtlc-flow
    const swap = await client.getSwap(swapId);
    console.log("Status:", swap.status);

    if (swap.status === "clientfundedserverrefunded" || swap.status === "expired") {
      const result = await client.refundSwap(swapId, {
        destinationAddress: "ark1q...",
      });
      console.log("Refund:", result.success ? "Success" : result.message);
    }
    // #endregion refund-vhtlc-flow

    // ── EVM HTLC Refund ──────────────────────────────────────
    // From: handle-failures/refund-evm-htlc.mdx
    console.log("");
    console.log("=".repeat(60));
    console.log("EVM HTLC Refund");
    console.log("=".repeat(60));

    // #region check-evm-htlc
    const refund = await client.getEvmRefundCallData(swapId);

    console.log("Timelock expired:", refund.timelockExpired);
    console.log("Expiry:", new Date(refund.timelockExpiry * 1000).toISOString());
    // #endregion check-evm-htlc

    // #region refund-evm-htlc
    if (!refund.timelockExpired) {
      const expiresIn = refund.timelockExpiry - Math.floor(Date.now() / 1000);
      console.log(`Timelock expires in ${Math.ceil(expiresIn / 60)} minutes`);
    } else if (CONFIG.evmMnemonic) {
      // Website docs show wagmi (browser). Here we use viem directly.
      const evmWallet = createEvmWallet(CONFIG.evmMnemonic, "polygon");

      const txHash = await evmWallet.walletClient.sendTransaction({
        to: refund.to as `0x${string}`,
        data: refund.data as `0x${string}`,
        chain: evmWallet.chain,
        account: evmWallet.account,
      });

      await evmWallet.publicClient.waitForTransactionReceipt({ hash: txHash });
      console.log("Refunded! TX:", txHash);
    } else {
      console.log("EVM_MNEMONIC not set. Refund data for manual execution:");
      console.log("  To:", refund.to);
      console.log("  Data:", refund.data);
    }
    // #endregion refund-evm-htlc

    // ── On-chain BTC HTLC Refund ─────────────────────────────
    // From: handle-failures/refund-onchain-htlc.mdx
    console.log("");
    console.log("=".repeat(60));
    console.log("On-chain BTC HTLC Refund");
    console.log("=".repeat(60));

    // #region refund-onchain
    const onchainResult = await client.refundSwap(swapId, {
      destinationAddress: "bc1q...", // Your BTC address
      feeRateSatPerVb: 5,
    });

    if (onchainResult.success) {
      console.log("Refund TX:", onchainResult.txId);
      console.log("Amount:", onchainResult.refundAmount, "sats");
      console.log("Broadcast:", onchainResult.broadcast);
      console.log("Fee:", onchainResult.fee, "sats");
    } else {
      console.error("Refund failed:", onchainResult.message);
    }
    // #endregion refund-onchain

    // ── Locktime Conditions ──────────────────────────────────
    // From: handle-failures/refund-locktime-conditions.mdx
    console.log("");
    console.log("-".repeat(60));
    console.log("Locktime Conditions");
    console.log("-".repeat(60));

    // #region check-locktime
    const lockSwap = await client.getSwap(swapId);
    console.log("Status:", lockSwap.status);

    // Attempt refund — the SDK checks locktime automatically
    const lockResult = await client.refundSwap(swapId, {
      destinationAddress: "bc1q...", // or "ark1q..." for Arkade swaps
    });

    if (!lockResult.success) {
      // If locktime hasn't expired, message tells you when it does
      console.log(lockResult.message);
    }
    // #endregion check-locktime
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
