/**
 * Fund an EVM HTLC for EVM-to-Arkade/Lightning swaps (direct WBTC mode).
 *
 * For WBTC-sourced swaps: Approve + createSwap on the HTLC contract.
 * For non-WBTC source tokens: use the Permit2 flow (evm-fund-permit2 command).
 */

import * as readline from "node:readline";
import type {Client, SwapStorage} from "@lendasat/lendaswap-sdk-pure";
import {encodeApproveCallData, encodeHtlcErc20CreateCallData} from "@lendasat/lendaswap-sdk-pure";
import {createEvmWallet, getChainFromToken} from "../evm/wallet.js";

/**
 * Prompts the user for confirmation.
 * Returns true if user enters 'y' or 'Y', false otherwise.
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

// ERC20 ABI for allowance check
const ERC20_ABI = [
  {
    inputs: [
      {name: "owner", type: "address"},
      {name: "spender", type: "address"},
    ],
    name: "allowance",
    outputs: [{name: "", type: "uint256"}],
    stateMutability: "view",
    type: "function",
  },
] as const;

/** Token decimals by token ID prefix */
const TOKEN_DECIMALS: Record<string, number> = {
  usdc: 6,
  usdt: 6,
  dai: 18,
  wbtc: 8,
};

function getTokenDecimals(tokenId: string): number {
  const prefix = tokenId.split("_")[0];
  return TOKEN_DECIMALS[prefix] ?? 18;
}

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
    console.error("  EVM_MNEMONIC=\"your twelve word mnemonic phrase here\"");
    process.exit(1);
  }

  console.log(`Funding swap: ${swapId}`);
  console.log("");

  // Get swap details
  const swap = await client.getSwap(swapId);

  if (swap.direction !== "evm_to_arkade" && swap.direction !== "evm_to_bitcoin" && swap.direction !== "evm_to_lightning") {
    console.error(`This command is for EVM-to-Arkade/Bitcoin/Lightning swaps, got: ${swap.direction}`);
    process.exit(1);
  }

  // source_token is a TokenInfo {token_id, symbol, decimals, chain, name}
  const evmSwap = swap as typeof swap & {
    evm_htlc_address: string;
    evm_chain_id: number;
    source_token: { token_id: string; symbol: string; decimals: number };
    source_amount: number;
  };

  // Determine chain from chain ID
  const chainIdToName: Record<number, ReturnType<typeof getChainFromToken>> = {
    1: "ethereum",
    137: "polygon",
    42161: "arbitrum",
  };
  const chainName = chainIdToName[evmSwap.evm_chain_id];
  const tokenAddress = evmSwap.source_token.token_id as `0x${string}`;
  const tokenDecimals = evmSwap.source_token.decimals;
  const amountNeeded = BigInt(evmSwap.source_amount);
  const htlcAddress = evmSwap.evm_htlc_address;
  const sourceTokenDisplay = evmSwap.source_token.symbol;
  const sourceAmountDisplay = evmSwap.source_amount / (10 ** tokenDecimals);

  if (!chainName) {
    console.error(`Could not determine chain from swap`);
    process.exit(1);
  }

  console.log(`Chain: ${chainName}`);
  console.log(`Source Token: ${sourceTokenDisplay}`);
  console.log(`Status: ${swap.status}`);
  console.log("");

  // Check if already funded (pending means waiting for funding)
  if (swap.status !== "pending") {
    console.log(`Swap is already in status: ${swap.status}`);
    console.log("No funding needed.");
    return;
  }

  // Detect coordinator mode
  // For evm_to_arkade/evm_to_bitcoin swaps with non-WBTC source, use coordinator (needs DEX swap to WBTC)
  // For WBTC-sourced swaps or evm_to_lightning, use direct HTLCErc20
  // For evm_to_btc swaps, can optionally use coordinator via USE_COORDINATOR=1
  const srcLower = sourceTokenDisplay.toLowerCase();
  const isWbtcSource = srcLower === "wbtc" || srcLower === "tbtc";
  // All EVM-sourced swaps use coordinator to swap source token → WBTC and lock into HTLC
  // (unless source is already WBTC, then direct HTLC is used)
  const useCoordinator = !isWbtcSource || process.env.USE_COORDINATOR === "1";

  // Create EVM wallet
  const evmWallet = createEvmWallet(evmMnemonic, chainName);
  console.log(`EVM Wallet Address: ${evmWallet.address}`);
  const modeDescription = "Coordinator (swap + lock)";
  console.log(`Mode: ${modeDescription}`);
  console.log("");

  console.log(`Token Address: ${tokenAddress}`);
  console.log(`Amount: ${sourceAmountDisplay} (${amountNeeded} smallest units)`);
  console.log("");

  try {
    if (useCoordinator) {
      // Non-WBTC source tokens require the Permit2 flow via evm-fund-permit2 command
      console.error("Non-WBTC source tokens must use the Permit2 flow.");
      console.error("Run: tsx src/index.ts evm-fund-permit2 " + swapId);
      process.exit(1);

    } else if (swap.direction === "evm_to_lightning" || swap.direction === "evm_to_bitcoin" || swap.direction === "evm_to_arkade") {
      // ── Direct HTLCErc20.create (build calldata locally) ──
      // Used for evm_to_lightning (always) and evm_to_bitcoin/evm_to_arkade when source is WBTC
      const evmSwap = swap as typeof swap & {
        evm_htlc_address: string;
        hash_lock?: string;        // evm_to_lightning uses this
        evm_hash_lock?: string;    // evm_to_bitcoin uses this
        source_amount: number;
        source_token: { token_id: string };
        client_evm_address: string;
        server_evm_address: string;
        evm_refund_locktime: number;
      };

      // Get hash lock from either field
      const hashLock = evmSwap.hash_lock || evmSwap.evm_hash_lock;
      if (!hashLock) {
        throw new Error("No hash_lock or evm_hash_lock found in swap response");
      }

      const htlcAddressHex = evmSwap.evm_htlc_address as `0x${string}`;
      const sourceTokenAddress = evmSwap.source_token.token_id as `0x${string}`;

      console.log(`HTLC Address: ${htlcAddressHex}`);
      console.log(`Hash Lock: ${hashLock}`);
      console.log(`Refund Locktime: ${evmSwap.evm_refund_locktime}`);
      console.log("");

      // Build calldata locally
      const approveCallData = encodeApproveCallData(
        sourceTokenAddress,
        htlcAddressHex,
        amountNeeded,
      );

      const createCallData = encodeHtlcErc20CreateCallData(htlcAddressHex, {
        preimageHash: hashLock,
        amount: amountNeeded,
        token: sourceTokenAddress,
        sender: evmSwap.client_evm_address, // User can refund
        claimer: evmSwap.server_evm_address, // Server claims with preimage
        timelock: evmSwap.evm_refund_locktime,
      });

      // Step 1: Check and approve if needed
      console.log("Step 1: Checking token allowance...");

      const currentAllowance = await evmWallet.publicClient.readContract({
        address: sourceTokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [evmWallet.address as `0x${string}`, htlcAddressHex],
      });

      console.log(`  Current allowance: ${currentAllowance}`);
      console.log(`  Amount needed: ${amountNeeded}`);

      if (currentAllowance < amountNeeded) {
        console.log("  Allowance insufficient, need to approve.");
        console.log("");

        const confirmApprove = await confirm("Send approve transaction?");
        if (!confirmApprove) {
          console.log("Cancelled.");
          return;
        }

        console.log("  Sending approve transaction...");

        const approveTxHash = await evmWallet.walletClient.sendTransaction({
          to: approveCallData.to as `0x${string}`,
          data: approveCallData.data as `0x${string}`,
          chain: evmWallet.chain,
          account: evmWallet.account,
        });

        console.log(`  Approve TX: ${approveTxHash}`);
        console.log("  Waiting for confirmation...");

        const approveReceipt = await evmWallet.publicClient.waitForTransactionReceipt({
          hash: approveTxHash,
        });

        if (approveReceipt.status !== "success") {
          throw new Error("Approve transaction failed");
        }

        console.log("  Approve confirmed!");
      } else {
        console.log("  Allowance sufficient, skipping approval.");
      }

      console.log("");

      // Step 2: Create the HTLC
      console.log("Step 2: Creating HTLCErc20...");
      console.log(`  This will lock ${sourceAmountDisplay} ${sourceTokenDisplay} in the HTLC.`);
      console.log("");

      const confirmFund = await confirm("Send create transaction?");
      if (!confirmFund) {
        console.log("Cancelled.");
        return;
      }

      console.log("  Sending create transaction...");

      const createTxHash = await evmWallet.walletClient.sendTransaction({
        to: createCallData.to as `0x${string}`,
        data: createCallData.data as `0x${string}`,
        chain: evmWallet.chain,
        account: evmWallet.account,
      });

      console.log(`  Create TX: ${createTxHash}`);
      console.log("  Waiting for confirmation...");

      const createReceipt = await evmWallet.publicClient.waitForTransactionReceipt({
        hash: createTxHash,
      });

      if (createReceipt.status !== "success") {
        throw new Error("Create transaction failed");
      }

      console.log("  Create confirmed!");
      console.log("");

      console.log("=".repeat(60));
      console.log("SWAP FUNDED SUCCESSFULLY!");
      console.log("=".repeat(60));
      console.log("");
      console.log(`  Create TX: ${createTxHash}`);
    } else {
      throw Error("Unsupported funding combination")
    }

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
