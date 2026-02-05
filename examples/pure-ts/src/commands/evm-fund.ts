/**
 * Fund an EVM HTLC for EVM-to-Arkade/Lightning swaps.
 *
 * Supports two modes:
 * - **Direct HTLC** (default): Approve + createSwap on the HTLC contract
 * - **Coordinator**: Approve + executeAndCreate via HTLCCoordinator (DEX swap + HTLC lock)
 *
 * Set USE_COORDINATOR=1 to use the coordinator flow.
 */

import * as readline from "node:readline";
import type { Client, SwapStorage } from "@lendasat/lendaswap-sdk-pure";
import { createEvmWallet, getChainFromToken } from "../evm/wallet.js";

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
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
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

  if (swap.direction !== "evm_to_btc") {
    console.error(`This command is for EVM-to-BTC swaps, got: ${swap.direction}`);
    process.exit(1);
  }

  // Determine chain from source token
  const chainName = getChainFromToken(swap.source_token);
  if (!chainName) {
    console.error(`Could not determine chain from token: ${swap.source_token}`);
    process.exit(1);
  }

  console.log(`Chain: ${chainName}`);
  console.log(`Source Token: ${swap.source_token}`);
  console.log(`Status: ${swap.status}`);
  console.log("");

  // Check if already funded (pending means waiting for funding)
  if (swap.status !== "pending") {
    console.log(`Swap is already in status: ${swap.status}`);
    console.log("No funding needed.");
    return;
  }

  // Detect coordinator mode
  const useCoordinator = process.env.USE_COORDINATOR === "1";

  // Create EVM wallet
  const evmWallet = createEvmWallet(evmMnemonic, chainName);
  console.log(`EVM Wallet Address: ${evmWallet.address}`);
  console.log(`Mode: ${useCoordinator ? "Coordinator (executeAndCreate)" : "Direct HTLC (createSwap)"}`);
  console.log("");

  const tokenDecimals = getTokenDecimals(swap.source_token);

  // Type assertion for the swap response
  const evmSwap = swap as typeof swap & {
    htlc_address_evm: string;
    source_token_address: string;
    source_amount: number;
    create_swap_tx?: string;
  };

  const tokenAddress = evmSwap.source_token_address as `0x${string}`;
  const amountNeeded = BigInt(Math.floor(evmSwap.source_amount * 10 ** tokenDecimals));

  console.log(`Token Address: ${tokenAddress}`);
  console.log(`Amount: ${evmSwap.source_amount} (${amountNeeded} smallest units)`);
  console.log("");

  try {
    if (useCoordinator) {
      // ── Coordinator mode: approve source token to coordinator, then executeAndCreate ──
      const funding = await client.getCoordinatorFundingCallData(swapId, tokenDecimals);

      console.log(`Coordinator: ${funding.executeAndCreate.to}`);
      console.log("");

      // Step 1: Approve source token to coordinator
      console.log("Step 1: Approving source token to coordinator...");

      const spender = funding.approve.to as `0x${string}`;
      const currentAllowance = await evmWallet.publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [evmWallet.address as `0x${string}`, spender],
      });

      if (currentAllowance < amountNeeded) {
        const confirmApprove = await confirm("Send approve transaction?");
        if (!confirmApprove) {
          console.log("Cancelled.");
          return;
        }

        const approveTxHash = await evmWallet.walletClient.sendTransaction({
          to: funding.approve.to as `0x${string}`,
          data: funding.approve.data as `0x${string}`,
          chain: evmWallet.chain,
          account: evmWallet.account,
        });

        console.log(`  Approve TX: ${approveTxHash}`);
        const approveReceipt = await evmWallet.publicClient.waitForTransactionReceipt({
          hash: approveTxHash,
        });

        if (approveReceipt.status !== "success") {
          throw new Error("Approve transaction failed");
        }
        console.log("  Approved!");
      } else {
        console.log("  Allowance sufficient, skipping.");
      }

      // Step 2: Call executeAndCreate on coordinator
      console.log("");
      console.log("Step 2: Calling executeAndCreate on coordinator...");
      console.log(`  This will swap ${evmSwap.source_amount} ${swap.source_token} to WBTC and lock into HTLC.`);
      console.log("");

      const confirmFund = await confirm("Send executeAndCreate transaction?");
      if (!confirmFund) {
        console.log("Cancelled.");
        return;
      }

      const txHash = await evmWallet.walletClient.sendTransaction({
        to: funding.executeAndCreate.to as `0x${string}`,
        data: funding.executeAndCreate.data as `0x${string}`,
        chain: evmWallet.chain,
        account: evmWallet.account,
      });

      console.log(`  executeAndCreate TX: ${txHash}`);
      const receipt = await evmWallet.publicClient.waitForTransactionReceipt({ hash: txHash });

      if (receipt.status !== "success") {
        throw new Error("executeAndCreate transaction failed");
      }

      console.log("  Confirmed!");
      console.log("");
      console.log("=".repeat(60));
      console.log("SWAP FUNDED VIA COORDINATOR!");
      console.log("=".repeat(60));
      console.log("");
      console.log(`  executeAndCreate TX: ${txHash}`);

    } else {
      // ── Direct HTLC mode: approve + createSwap ──
      const funding = await client.getEvmFundingCallData(swapId, tokenDecimals);
      const htlcAddress = evmSwap.htlc_address_evm as `0x${string}`;

      console.log(`HTLC Address: ${htlcAddress}`);
      console.log("");

      // Step 1: Check and approve if needed
      console.log("Step 1: Checking token allowance...");

      const currentAllowance = await evmWallet.publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [evmWallet.address as `0x${string}`, htlcAddress],
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
          to: funding.approve.to as `0x${string}`,
          data: funding.approve.data as `0x${string}`,
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

      // Step 2: Create the swap
      console.log("Step 2: Funding the HTLC...");
      console.log(`  This will transfer ${evmSwap.source_amount} ${swap.source_token} to the HTLC.`);
      console.log("");

      const confirmFund = await confirm("Send createSwap transaction?");
      if (!confirmFund) {
        console.log("Cancelled.");
        return;
      }

      console.log("  Sending createSwap transaction...");

      const createSwapTxHash = await evmWallet.walletClient.sendTransaction({
        to: funding.createSwap.to as `0x${string}`,
        data: funding.createSwap.data as `0x${string}`,
        chain: evmWallet.chain,
        account: evmWallet.account,
      });

      console.log(`  CreateSwap TX: ${createSwapTxHash}`);
      console.log("  Waiting for confirmation...");

      const createSwapReceipt = await evmWallet.publicClient.waitForTransactionReceipt({
        hash: createSwapTxHash,
      });

      if (createSwapReceipt.status !== "success") {
        throw new Error("CreateSwap transaction failed");
      }

      console.log("  CreateSwap confirmed!");
      console.log("");

      console.log("=".repeat(60));
      console.log("SWAP FUNDED SUCCESSFULLY!");
      console.log("=".repeat(60));
      console.log("");
      console.log(`  CreateSwap TX:  ${createSwapTxHash}`);
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
