import { createExampleClient, CONFIG } from "./_shared.js";
import { createEvmWallet, getChainFromToken } from "../evm/wallet.js";

async function main(): Promise<void> {
  const { client, close } = await createExampleClient();

  try {
    // ── EVM -> Arkade ────────────────────────────────────────
    // From: create-swaps/evm-to-btc.mdx
    console.log("=".repeat(60));
    console.log("EVM -> Arkade");
    console.log("=".repeat(60));

    const arkadeResult = await client.createEvmToArkadeSwap({
      sourceChain: "polygon",
      sourceToken: "usdc_pol",
      sourceAmount: 100, // 100 USDC
      targetAddress: "ark1q...", // Your Arkade address
      userAddress: "0xYourEvmAddress",
    });

    console.log("Approve token:", arkadeResult.response.source_token_address);
    console.log("HTLC contract:", arkadeResult.response.htlc_address_evm);
    console.log("Swap ID:", arkadeResult.response.id);

    // ── EVM -> Lightning ─────────────────────────────────────
    // From: create-swaps/evm-to-btc.mdx
    console.log("");
    console.log("=".repeat(60));
    console.log("EVM -> Lightning");
    console.log("=".repeat(60));

    const lnResult = await client.createEvmToLightningSwap({
      sourceChain: "polygon",
      sourceToken: "usdc_pol",
      bolt11Invoice: "lnbc...", // Lightning invoice to pay
      userAddress: "0xYourEvmAddress",
    });

    console.log("HTLC contract:", lnResult.response.htlc_address_evm);
    console.log("Swap ID:", lnResult.response.id);

    // ── Fund EVM HTLC (viem) ─────────────────────────────────
    // From: create-swaps/evm-to-btc.mdx "Deposit Stablecoins"
    // Website docs show wagmi (browser) and ethers (React Native).
    // Here we use viem directly via the existing evm/wallet.ts helper.
    console.log("");
    console.log("=".repeat(60));
    console.log("Fund EVM HTLC via viem");
    console.log("=".repeat(60));

    if (!CONFIG.evmMnemonic) {
      console.log("Skipping: EVM_MNEMONIC not set in .env");
    } else {
      const swapId = arkadeResult.response.id;
      const sourceToken = arkadeResult.response.source_token;

      // Determine chain from source token
      const chainName = getChainFromToken(sourceToken);
      if (!chainName) {
        console.error(`Could not determine chain from token: ${sourceToken}`);
      } else {
        const evmWallet = createEvmWallet(CONFIG.evmMnemonic, chainName);
        console.log("EVM Wallet:", evmWallet.address);

        // Get funding call data from the SDK
        const funding = await client.getEvmFundingCallData(
          swapId,
          6, // USDC decimals
        );

        // Step 1: Approve token spend
        console.log("Sending approve transaction...");
        const approveTxHash = await evmWallet.walletClient.sendTransaction({
          to: funding.approve.to as `0x${string}`,
          data: funding.approve.data as `0x${string}`,
          chain: evmWallet.chain,
          account: evmWallet.account,
        });
        console.log("Approve TX:", approveTxHash);

        await evmWallet.publicClient.waitForTransactionReceipt({
          hash: approveTxHash,
        });

        // Step 2: Fund the HTLC
        console.log("Sending createSwap transaction...");
        const fundTxHash = await evmWallet.walletClient.sendTransaction({
          to: funding.createSwap.to as `0x${string}`,
          data: funding.createSwap.data as `0x${string}`,
          chain: evmWallet.chain,
          account: evmWallet.account,
        });
        console.log("CreateSwap TX:", fundTxHash);

        await evmWallet.publicClient.waitForTransactionReceipt({
          hash: fundTxHash,
        });

        console.log("HTLC funded successfully!");
      }
    }
  } finally {
    close();
  }
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
