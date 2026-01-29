/**
 * Claim an EVM HTLC for BTC-to-EVM swaps.
 *
 * This command is used for swaps to Ethereum mainnet where Gelato
 * relay is not available. The user must submit the claim transaction
 * themselves using the preimage from the swap.
 */

import type { Client } from "@lendasat/lendaswap-sdk-pure";
import { createEvmWallet, getChainFromToken } from "../evm/wallet.js";

export async function evmClaimSwap(
  client: Client,
  swapId: string | undefined,
  evmMnemonic: string | undefined,
): Promise<void> {
  if (!swapId) {
    console.error("Usage: tsx src/index.ts evm-claim <swap-id>");
    console.error("");
    console.error("Example:");
    console.error("  tsx src/index.ts evm-claim 12345678-1234-1234-1234-123456789abc");
    console.error("");
    console.error("Note: This is for BTC-to-EVM swaps on Ethereum mainnet.");
    console.error("For Polygon/Arbitrum swaps, use 'redeem' instead (uses Gelato).");
    console.error("");
    console.error("Environment:");
    console.error("  EVM_MNEMONIC must be set to your EVM wallet mnemonic");
    process.exit(1);
  }

  if (!evmMnemonic) {
    console.error("Error: EVM_MNEMONIC environment variable is required for claiming.");
    console.error("");
    console.error("Set it in your .env file:");
    console.error("  EVM_MNEMONIC=\"your twelve word mnemonic phrase here\"");
    process.exit(1);
  }

  console.log(`Claiming swap: ${swapId}`);
  console.log("");

  // Get swap details from local storage (no server request)
  const storedSwap = await client.getStoredSwap(swapId);
  if (!storedSwap) {
    console.error(`Swap ${swapId} not found in local storage.`);
    console.error("Cannot claim without stored swap data.");
    process.exit(1);
  }

  const swap = storedSwap.response;

  if (swap.direction !== "btc_to_evm") {
    console.error(`This command is for BTC-to-EVM swaps, got: ${swap.direction}`);
    console.error("For EVM-to-BTC swaps, the server claims automatically.");
    process.exit(1);
  }

  // Check if the target is Ethereum (where Gelato isn't available)
  const chainName = getChainFromToken(swap.target_token);
  if (!chainName) {
    console.error(`Could not determine chain from token: ${swap.target_token}`);
    process.exit(1);
  }

  if (chainName !== "ethereum") {
    console.log(`Target chain is ${chainName}, which supports Gelato relay.`);
    console.log("Use 'redeem' command instead for automatic claiming via Gelato.");
    process.exit(1);
  }

  console.log(`Chain: ${chainName}`);
  console.log(`Target Token: ${swap.target_token}`);
  console.log(`Status: ${swap.status}`);
  console.log("");

  // Get claim data from SDK (reads swap data and preimage from storage)
  const claimResult = await client.claim(swapId);

  if (!claimResult.success) {
    console.error(`Error: ${claimResult.message}`);
    process.exit(1);
  }

  if (!claimResult.ethereumClaimData) {
    console.error("Error: No Ethereum claim data available.");
    process.exit(1);
  }

  const { contractAddress, callData } = claimResult.ethereumClaimData;

  console.log(`HTLC Contract: ${contractAddress}`);
  console.log("");

  // Create EVM wallet
  const evmWallet = createEvmWallet(evmMnemonic, chainName);
  console.log(`EVM Wallet Address: ${evmWallet.address}`);
  console.log("");

  try {
    console.log("Submitting claim transaction...");

    const claimTxHash = await evmWallet.walletClient.sendTransaction({
      to: contractAddress as `0x${string}`,
      data: callData as `0x${string}`,
      chain: evmWallet.chain,
      account: evmWallet.account,
    });

    console.log(`  Claim TX: ${claimTxHash}`);
    console.log("  Waiting for confirmation...");

    const receipt = await evmWallet.publicClient.waitForTransactionReceipt({
      hash: claimTxHash,
    });

    if (receipt.status !== "success") {
      throw new Error("Claim transaction failed");
    }

    console.log("");
    console.log("=".repeat(60));
    console.log("CLAIM SUCCESSFUL!");
    console.log("=".repeat(60));
    console.log("");
    console.log(`  Transaction: ${claimTxHash}`);
    console.log(`  Block: ${receipt.blockNumber}`);
    console.log("");
    console.log("Your tokens have been transferred to your wallet.");

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("");
    console.error("=".repeat(60));
    console.error("CLAIM FAILED");
    console.error("=".repeat(60));
    console.error("");
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}
