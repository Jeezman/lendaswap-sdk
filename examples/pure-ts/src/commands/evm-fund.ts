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
  // For evm_to_arkade/evm_to_bitcoin swaps, always use coordinator (source token needs DEX swap to WBTC)
  // For evm_to_btc swaps, can optionally use coordinator via USE_COORDINATOR=1
  const useCoordinator = swap.direction === "evm_to_arkade" || swap.direction === "evm_to_bitcoin" || swap.direction === "evm_to_lightning" || process.env.USE_COORDINATOR === "1";

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
      // ── Coordinator mode: approve source token to coordinator, then executeAndCreate ──

      // First, get coordinator address to check allowance
      console.log("Fetching coordinator info...");
      const initialFunding = await client.getCoordinatorFundingCallData(swapId);
      const coordinatorAddress = initialFunding.executeAndCreate.to as `0x${string}`;

      console.log(`Coordinator: ${coordinatorAddress}`);
      console.log("");

      // Step 1: Approve source token to coordinator (if needed)
      console.log("Step 1: Checking token allowance...");

      const currentAllowance = await evmWallet.publicClient.readContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [evmWallet.address as `0x${string}`, coordinatorAddress],
      });

      if (currentAllowance < amountNeeded) {
        console.log(`  Current allowance: ${currentAllowance}, needed: ${amountNeeded}`);
        const confirmApprove = await confirm("Send approve transaction?");
        if (!confirmApprove) {
          console.log("Cancelled.");
          return;
        }

        const approveTxHash = await evmWallet.walletClient.sendTransaction({
          to: initialFunding.approve.to as `0x${string}`,
          data: initialFunding.approve.data as `0x${string}`,
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

      // Step 2: Ask for confirmation first, THEN fetch fresh calldata
      console.log("");
      console.log("Step 2: Calling executeAndCreate on coordinator...");
      console.log(`  This will swap ${sourceAmountDisplay} ${sourceTokenDisplay} to WBTC and lock into HTLC.`);
      console.log("");

      const confirmFund = await confirm("Send executeAndCreate transaction?");
      if (!confirmFund) {
        console.log("Cancelled.");
        return;
      }

      // Fetch FRESH calldata right before sending (1inch quotes expire quickly)
      console.log("  Fetching fresh DEX calldata...");
      const freshFunding = await client.getCoordinatorFundingCallData(swapId);

      const txHash = await evmWallet.walletClient.sendTransaction({
        to: freshFunding.executeAndCreate.to as `0x${string}`,
        data: freshFunding.executeAndCreate.data as `0x${string}`,
        chain: evmWallet.chain,
        account: evmWallet.account,
      });

      console.log(`  executeAndCreate TX: ${txHash}`);
      const receipt = await evmWallet.publicClient.waitForTransactionReceipt({hash: txHash});

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
