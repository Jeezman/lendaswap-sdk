/**
 * Fund an EVM HTLC for EVM-to-Arkade/Lightning/Bitcoin swaps.
 *
 * Uses the SDK's `fundSwap` method which handles the full Permit2 flow:
 * allowance check, ERC-20 approval, EIP-712 signing, and tx submission.
 */

import type { Client, EvmSigner, SwapStorage } from "@lendasat/lendaswap-sdk-pure";
import { createEvmWallet, getChainFromToken } from "../evm/wallet.js";

export async function evmFundSwap(
  client: Client,
  swapStorage: SwapStorage | undefined,
  swapId: string | undefined,
  evmMnemonic: string | undefined,
): Promise<void> {
  if (!swapId) {
    console.error("Usage: tsx src/index.ts evm-fund <swap-id>");
    console.error("");
    console.error("Example:");
    console.error("  tsx src/index.ts evm-fund 12345678-1234-1234-1234-123456789abc");
    console.error("");
    console.error("Environment:");
    console.error("  EVM_MNEMONIC must be set to your EVM wallet mnemonic");
    process.exit(1);
  }

  if (!evmMnemonic) {
    console.error("Error: EVM_MNEMONIC environment variable is required for funding.");
    console.error("");
    console.error("Set it in your .env file:");
    console.error('  EVM_MNEMONIC="your twelve word mnemonic phrase here"');
    process.exit(1);
  }

  console.log(`Funding swap: ${swapId}`);
  console.log("");

  // Get swap details
  const swap = await client.getSwap(swapId);

  if (
    swap.direction !== "evm_to_arkade" &&
    swap.direction !== "evm_to_bitcoin" &&
    swap.direction !== "evm_to_lightning"
  ) {
    console.error(`This command is for EVM-to-Arkade/Bitcoin/Lightning swaps, got: ${swap.direction}`);
    process.exit(1);
  }

  const evmSwap = swap as typeof swap & {
    evm_chain_id: number;
    source_token: { token_id: string; symbol: string; decimals: number };
    source_amount: number;
  };

  // Determine chain
  const chainIdToName: Record<number, ReturnType<typeof getChainFromToken>> = {
    1: "ethereum",
    137: "polygon",
    42161: "arbitrum",
  };
  const chainName = chainIdToName[evmSwap.evm_chain_id];
  if (!chainName) {
    console.error("Could not determine chain from swap");
    process.exit(1);
  }

  const sourceSymbol = evmSwap.source_token.symbol;
  const sourceDecimals = evmSwap.source_token.decimals;
  const sourceAmountDisplay = evmSwap.source_amount / 10 ** sourceDecimals;

  console.log(`Chain: ${chainName}`);
  console.log(`Source Token: ${sourceSymbol}`);
  console.log(`Amount: ${sourceAmountDisplay} ${sourceSymbol}`);
  console.log(`Status: ${swap.status}`);
  console.log("");

  if (swap.status !== "pending") {
    console.log(`Swap is already in status: ${swap.status}`);
    console.log("No funding needed.");
    return;
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
        domain: {
          ...td.domain,
          verifyingContract: td.domain.verifyingContract as `0x${string}`,
        },
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
    waitForReceipt: async (hash) => {
      const receipt = await evmWallet.publicClient.waitForTransactionReceipt({
        hash: hash as `0x${string}`,
      });
      return {
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        transactionHash: receipt.transactionHash,
      };
    },
    getTransaction: async (hash) => {
      const tx = await evmWallet.publicClient.getTransaction({
        hash: hash as `0x${string}`,
      });
      return { to: tx.to ?? null, input: tx.input, from: tx.from };
    },
    call: async (tx) => {
      const result = await evmWallet.publicClient.call({
        to: tx.to as `0x${string}`,
        data: tx.data as `0x${string}`,
        account: tx.from as `0x${string}` | undefined,
        blockNumber: tx.blockNumber,
      });
      return result.data ?? "0x";
    },
  };

  try {
    console.log("Funding swap via Permit2 flow...");
    console.log("  (allowance check → approve → sign → send)");
    console.log("");

    const { txHash } = await client.fundSwap(swapId, signer);

    console.log("=".repeat(60));
    console.log("SWAP FUNDED SUCCESSFULLY!");
    console.log("=".repeat(60));
    console.log("");
    console.log(`  TX: ${txHash}`);
    console.log("");
    console.log("The server will now process your swap.");
    console.log(`Use 'npm run watch -- ${swapId}' to monitor progress.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("");
    console.error("=".repeat(60));
    console.error("FUNDING FAILED");
    console.error("=".repeat(60));
    console.error("");
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}
