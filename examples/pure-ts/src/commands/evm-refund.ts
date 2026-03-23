/**
 * Refund an EVM HTLC for EVM-to-Arkade/Lightning swaps.
 *
 * This command is used when a swap has timed out and the user
 * wants to recover their tokens from the HTLC contract.
 */

import type { Client, EvmSigner } from "@lendasat/lendaswap-sdk-pure";
import { createEvmWallet, getChainFromToken } from "../evm/wallet.js";

export async function evmRefundSwap(
  client: Client,
  swapId: string | undefined,
  evmMnemonic: string | undefined,
  directMode: boolean = false,
  forceMode: boolean = false,
): Promise<void> {
  if (!swapId) {
    console.error("Usage: tsx src/index.ts evm-refund <swap-id> [--direct] [--force]");
    console.error("");
    console.error("Options:");
    console.error("  --direct    Return WBTC directly instead of swapping back to original token");
    console.error("              (useful when DEX calldata is stale, e.g., on Anvil forks)");
    console.error("  --force     Skip client-side timelock check (for testing with time-manipulated chains)");
    console.error("");
    console.error("Example:");
    console.error("  tsx src/index.ts evm-refund 12345678-1234-1234-1234-123456789abc");
    console.error("  tsx src/index.ts evm-refund 12345678-1234-1234-1234-123456789abc --direct");
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

  if (swap.direction !== "evm_to_btc" && swap.direction !== "evm_to_arkade" && swap.direction !== "evm_to_bitcoin" && swap.direction !== "evm_to_lightning") {
    console.error(`This command is for EVM-sourced swaps (evm_to_btc, evm_to_arkade, evm_to_bitcoin, evm_to_lightning), got: ${swap.direction}`);
    process.exit(1);
  }

  // Determine chain from source token or chain ID
  let chainName: ReturnType<typeof getChainFromToken>;
  let sourceTokenDisplay: string;

  if (swap.direction === "evm_to_arkade" || swap.direction === "evm_to_bitcoin" || swap.direction === "evm_to_lightning") {
    // Generic endpoint swaps have evm_chain_id and source_token as TokenSummary
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
  const mode = directMode ? "direct" : "swap-back";
  if (directMode) {
    console.log("Mode: direct (returning WBTC instead of swapping back)");
    console.log("");
  }
  const result = await client.refundSwap(swapId, { mode });

  if (!result.success || !result.evmRefundData) {
    console.error(`Refund not available: ${result.message}`);
    process.exit(1);
  }

  const refund = result.evmRefundData;

  console.log(`Contract: ${refund.to}`);
  console.log(`Timelock Expiry: ${new Date(refund.timelockExpiry * 1000).toISOString()}`);
  console.log(`Timelock Expired: ${refund.timelockExpired}`);
  console.log("");

  if (!refund.timelockExpired && !forceMode) {
    const remainingSeconds = refund.timelockExpiry - Math.floor(Date.now() / 1000);
    const hours = Math.floor(remainingSeconds / 3600);
    const minutes = Math.floor((remainingSeconds % 3600) / 60);
    console.error("Error: Cannot refund yet - timelock has not expired.");
    console.error(`Time remaining: ${hours}h ${minutes}m`);
    console.error("");
    console.error("You can only refund after the timelock expires.");
    process.exit(1);
  }
  if (forceMode && !refund.timelockExpired) {
    console.log("⚠ Force mode: skipping client-side timelock check");
  }

  // Create EVM wallet and build an EvmSigner
  const evmWallet = createEvmWallet(evmMnemonic, chainName);
  console.log(`EVM Wallet Address: ${evmWallet.address}`);
  console.log("");

  const signer: EvmSigner = {
    address: evmWallet.address,
    chainId: evmWallet.chain.id,
    signTypedData: (td) =>
      evmWallet.walletClient.signTypedData({
        ...td,
        domain: { ...td.domain, verifyingContract: td.domain.verifyingContract as `0x${string}` },
        account: evmWallet.account,
      }),
    sendTransaction: (tx) =>
      evmWallet.walletClient.sendTransaction({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        chain: evmWallet.chain,
        account: evmWallet.account,
        gas: tx.gas,
      }),
    getTransactionReceipt: async (hash) => {
      const r = await evmWallet.publicClient.getTransactionReceipt({ hash: hash as `0x${string}` });
      return { status: r.status, blockNumber: r.blockNumber, transactionHash: r.transactionHash };
    },
    getTransaction: async (hash) => {
      const tx = await evmWallet.publicClient.getTransaction({ hash: hash as `0x${string}` });
      return { to: tx.to ?? null, input: tx.input, from: tx.from };
    },
    call: async (tx) => {
      const r = await evmWallet.publicClient.call({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        account: tx.from as `0x${string}` | undefined,
        blockNumber: tx.blockNumber,
      });
      return r.data ?? "0x";
    },
  };

  try {
    console.log("Submitting refund transaction...");

    const { txHash } = await client.refundEvmWithSigner(swapId, signer, mode);
    // #endregion refund-evm-htlc

    console.log("");
    console.log("=".repeat(60));
    console.log("REFUND SUCCESSFUL!");
    console.log("=".repeat(60));
    console.log("");
    console.log(`  Transaction: ${txHash}`);
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
