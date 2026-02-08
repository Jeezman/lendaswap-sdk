/**
 * Refund an EVM HTLC for EVM-to-Arkade/Lightning swaps.
 *
 * This command is used when a swap has timed out and the user
 * wants to recover their tokens from the HTLC contract.
 */

import * as readline from "node:readline";
import type { Client } from "@lendasat/lendaswap-sdk-pure";
import { createEvmWallet, getChainFromToken } from "../evm/wallet.js";

/**
 * Prompts the user for confirmation.
 */
async function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

export async function evmRefundSwap(
  client: Client,
  swapId: string | undefined,
  evmMnemonic: string | undefined,
): Promise<void> {
  if (!swapId) {
    console.error("Usage: tsx src/index.ts evm-refund <swap-id>");
    console.error("");
    console.error("Example:");
    console.error("  tsx src/index.ts evm-refund 12345678-1234-1234-1234-123456789abc");
    console.error("");
    console.error("Environment:");
    console.error("  EVM_MNEMONIC must be set to your EVM wallet mnemonic");
    process.exit(1);
  }

  if (!evmMnemonic) {
    console.error("Error: EVM_MNEMONIC environment variable is required for refunding.");
    console.error("");
    console.error("Set it in your .env file:");
    console.error("  EVM_MNEMONIC=\"your twelve word mnemonic phrase here\"");
    process.exit(1);
  }

  console.log(`Refunding swap: ${swapId}`);
  console.log("");

  // Get swap details from local storage
  const storedSwap = await client.getStoredSwap(swapId);
  if (!storedSwap) {
    console.error(`Swap ${swapId} not found in local storage.`);
    process.exit(1);
  }

  const swap = storedSwap.response;

  if (swap.direction !== "evm_to_btc" && swap.direction !== "evm_to_arkade") {
    console.error(`This command is for EVM-sourced swaps (evm_to_btc, evm_to_arkade), got: ${swap.direction}`);
    process.exit(1);
  }

  // Determine chain from source token or chain ID
  let chainName: ReturnType<typeof getChainFromToken>;
  let sourceTokenDisplay: string;

  if (swap.direction === "evm_to_arkade") {
    // evm_to_arkade has evm_chain_id and source_token as TokenSummary
    const evmSwap = swap as typeof swap & {
      evm_chain_id: number;
      source_token: { address: string; symbol: string; decimals: number };
    };
    const chainIdToName: Record<number, ReturnType<typeof getChainFromToken>> = {
      1: "ethereum",
      137: "polygon",
      42161: "arbitrum",
    };
    chainName = chainIdToName[evmSwap.evm_chain_id];
    sourceTokenDisplay = `${evmSwap.source_token.symbol} (${evmSwap.source_token.address})`;
  } else {
    // evm_to_btc uses TokenId strings
    const tokenId = typeof swap.source_token === "string"
      ? swap.source_token
      : swap.source_token.address;
    chainName = getChainFromToken(tokenId);
    sourceTokenDisplay = tokenId;
  }

  if (!chainName) {
    console.error(`Could not determine chain for swap direction: ${swap.direction}`);
    process.exit(1);
  }

  console.log(`Chain: ${chainName}`);
  console.log(`Source Token: ${sourceTokenDisplay}`);
  console.log(`Status: ${swap.status}`);
  console.log("");

  // #region check-evm-htlc
  // Get refund call data via refundSwap (handles both direct HTLC and coordinator refunds)
  const result = await client.refundSwap(swapId);

  if (!result.success || !result.evmRefundData) {
    console.error(`Refund not available: ${result.message}`);
    process.exit(1);
  }

  const refund = result.evmRefundData;

  console.log(`Contract: ${refund.to}`);
  console.log(`Timelock Expiry: ${new Date(refund.timelockExpiry * 1000).toISOString()}`);
  console.log(`Timelock Expired: ${refund.timelockExpired}`);
  console.log("");

  if (!refund.timelockExpired) {
    const remainingSeconds = refund.timelockExpiry - Math.floor(Date.now() / 1000);
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    console.error("Error: Cannot refund yet - timelock has not expired.");
    console.error(`Time remaining: ${hours}h ${minutes}m`);
    console.error("");
    console.error("You can only refund after the timelock expires.");
    process.exit(1);
  }

  // Create EVM wallet
  const evmWallet = createEvmWallet(evmMnemonic, chainName);
  console.log(`EVM Wallet Address: ${evmWallet.address}`);
  console.log("");

  // Confirm before sending
  const confirmRefund = await confirm("Send refund transaction?");
  if (!confirmRefund) {
    console.log("Cancelled.");
    return;
  }

  try {
    console.log("Submitting refund transaction...");

    const refundTxHash = await evmWallet.walletClient.sendTransaction({
      to: refund.to as `0x${string}`,
      data: refund.data as `0x${string}`,
      chain: evmWallet.chain,
      account: evmWallet.account,
    });

    console.log(`  Refund TX: ${refundTxHash}`);
    console.log("  Waiting for confirmation...");

    const receipt = await evmWallet.publicClient.waitForTransactionReceipt({
      hash: refundTxHash,
    });

    if (receipt.status !== "success") {
      throw new Error("Refund transaction failed");
    }
    // #endregion refund-evm-htlc

    console.log("");
    console.log("=".repeat(60));
    console.log("REFUND SUCCESSFUL!");
    console.log("=".repeat(60));
    console.log("");
    console.log(`  Transaction: ${refundTxHash}`);
    console.log(`  Block: ${receipt.blockNumber}`);
    console.log("");
    console.log("Your tokens have been returned to your wallet.");

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("");
    console.error("=".repeat(60));
    console.error("REFUND FAILED");
    console.error("=".repeat(60));
    console.error("");
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}
