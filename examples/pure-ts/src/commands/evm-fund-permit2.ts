/**
 * Fund an EVM HTLC using Permit2 for EVM-to-Bitcoin/Arkade/Lightning swaps.
 *
 * Permit2 flow:
 * 1. One-time approve: source token → Permit2 (from depositor)
 * 2. Off-chain Permit2 signature (gasless for depositor)
 * 3. Submit executeAndCreateWithPermit2 (can be done by a relayer)
 *
 * The depositor address is derived from the SDK's stored secretKey.
 * The relayer (EVM_MNEMONIC wallet) submits the final transaction.
 */

import type {Client, SwapStorage} from "@lendasat/lendaswap-sdk-pure";
import {deriveEvmAddress} from "@lendasat/lendaswap-sdk-pure";
import {createEvmWallet, getChainFromToken} from "../evm/wallet.js";
import {
  createPublicClient,
  createWalletClient,
  http,
  type Chain,
} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {polygon, arbitrum, mainnet} from "viem/chains";

// ERC20 ABI for allowance/balance checks
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
  {
    inputs: [{name: "account", type: "address"}],
    name: "balanceOf",
    outputs: [{name: "", type: "uint256"}],
    stateMutability: "view",
    type: "function",
  },
] as const;

const CHAINS: Record<string, Chain> = {
  polygon,
  arbitrum,
  ethereum: mainnet,
};

const CHAIN_ID_TO_NAME: Record<number, string> = {
  1: "ethereum",
  137: "polygon",
  42161: "arbitrum",
};

export async function evmFundPermit2(
  client: Client,
  swapStorage: SwapStorage | undefined,
  swapId: string | undefined,
  evmMnemonic: string | undefined,
): Promise<void> {
  if (!swapId) {
    console.error("Usage: tsx src/index.ts evm-fund-permit2 <swap-id>");
    console.error("");
    console.error("Environment:");
    console.error("  EVM_MNEMONIC - relayer wallet mnemonic (pays gas for executeAndCreateWithPermit2)");
    process.exit(1);
  }

  if (!swapStorage) {
    console.error("Error: Swap storage is required for Permit2 flow (need stored secretKey).");
    process.exit(1);
  }

  console.log(`Permit2 funding for swap: ${swapId}`);
  console.log("");

  // 1. Look up stored swap to get the secretKey
  const storedSwap = await swapStorage.get(swapId);
  if (!storedSwap) {
    console.error(`Error: Swap ${swapId} not found in local storage.`);
    console.error("The Permit2 flow requires the stored secretKey for signing.");
    process.exit(1);
  }

  // 2. Get swap details from server
  const swap = await client.getSwap(swapId);

  if (
    swap.direction !== "evm_to_arkade" &&
    swap.direction !== "evm_to_bitcoin" &&
    swap.direction !== "evm_to_lightning"
  ) {
    console.error(
      `This command is for EVM-to-Arkade/Bitcoin/Lightning swaps, got: ${swap.direction}`,
    );
    process.exit(1);
  }

  if (swap.status !== "pending") {
    console.log(`Swap is already in status: ${swap.status}`);
    console.log("No funding needed.");
    return;
  }

  const evmSwap = swap as typeof swap & {
    evm_chain_id: number;
    source_token: {token_id: string; symbol: string; decimals: number};
    source_amount: number;
  };

  const chainId = evmSwap.evm_chain_id;
  const chainName = CHAIN_ID_TO_NAME[chainId];
  const chain = chainName ? CHAINS[chainName] : undefined;

  if (!chain || !chainName) {
    console.error(`Unsupported chain ID: ${chainId}`);
    process.exit(1);
  }

  const tokenAddress = evmSwap.source_token.token_id as `0x${string}`;
  const sourceAmount = BigInt(evmSwap.source_amount);
  const sourceSymbol = evmSwap.source_token.symbol;
  const sourceDecimals = evmSwap.source_token.decimals;
  const sourceDisplay = evmSwap.source_amount / 10 ** sourceDecimals;

  // 3. Derive depositor address from SDK secretKey
  const depositorAddress = deriveEvmAddress(storedSwap.secretKey) as `0x${string}`;

  console.log(`Chain:      ${chainName} (${chainId})`);
  console.log(`Token:      ${sourceSymbol} (${tokenAddress})`);
  console.log(`Amount:     ${sourceDisplay} ${sourceSymbol} (${sourceAmount} units)`);
  console.log(`Depositor:  ${depositorAddress} (derived from SDK key)`);
  console.log("");

  // 4. Create depositor wallet (from SDK secretKey) for the approve tx
  const secretKeyHex = storedSwap.secretKey.startsWith("0x")
    ? storedSwap.secretKey
    : `0x${storedSwap.secretKey}`;
  const depositorAccount = privateKeyToAccount(secretKeyHex as `0x${string}`);

  const rpcUrl = process.env.POLYGON_RPC || "http://localhost:8545";

  const depositorWallet = createWalletClient({
    account: depositorAccount,
    chain,
    transport: http(rpcUrl),
  });

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  // 5. Check depositor's token balance
  const balance = await publicClient.readContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [depositorAddress],
  });

  console.log(`Depositor ${sourceSymbol} balance: ${balance}`);
  if (balance < sourceAmount) {
    console.error(
      `Error: Insufficient ${sourceSymbol} balance. Have ${balance}, need ${sourceAmount}.`,
    );
    process.exit(1);
  }

  try {
    // 6. Get Permit2 signed funding data from SDK
    console.log("Fetching Permit2 funding data and signing...");
    const funding = await client.getCoordinatorFundingCallDataPermit2(swapId, chainId);

    const permit2Address = funding.approve.to as `0x${string}`;
    console.log(`Permit2:    ${permit2Address}`);
    console.log(`Coordinator: ${funding.executeAndCreate.to}`);
    console.log("");

    // 7. Step 1: Approve source token → Permit2 (from depositor, one-time)
    console.log("Step 1: Approving source token to Permit2...");

    const currentAllowance = await publicClient.readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [depositorAddress, permit2Address],
    });

    if (currentAllowance < sourceAmount) {
      console.log(`  Current Permit2 allowance: ${currentAllowance}, needed: ${sourceAmount}`);
      console.log("  Sending approve(Permit2, max) from depositor...");

      const approveTxHash = await depositorWallet.sendTransaction({
        to: funding.approve.to as `0x${string}`,
        data: funding.approve.data as `0x${string}`,
        chain,
        account: depositorAccount,
      });

      console.log(`  Approve TX: ${approveTxHash}`);
      const approveReceipt = await publicClient.waitForTransactionReceipt({
        hash: approveTxHash,
      });

      if (approveReceipt.status !== "success") {
        throw new Error("Approve transaction failed");
      }
      console.log("  Approved!");
    } else {
      console.log("  Permit2 allowance sufficient, skipping.");
    }
    console.log("");

    // 8. Step 2: Submit executeAndCreateWithPermit2 (relayer pays gas)
    console.log("Step 2: Submitting executeAndCreateWithPermit2...");
    console.log(`  This will swap ${sourceDisplay} ${sourceSymbol} to WBTC and lock into HTLC.`);

    // Use relayer wallet (EVM_MNEMONIC) if available, otherwise depositor submits
    let txHash: `0x${string}`;

    if (evmMnemonic) {
      console.log("  Relayer (EVM_MNEMONIC) submitting transaction...");
      const relayerWallet = createEvmWallet(
        evmMnemonic,
        chainName as "polygon" | "arbitrum" | "ethereum",
        rpcUrl,
      );
      console.log(`  Relayer address: ${relayerWallet.address}`);

      txHash = await relayerWallet.walletClient.sendTransaction({
        to: funding.executeAndCreate.to as `0x${string}`,
        data: funding.executeAndCreate.data as `0x${string}`,
        chain: relayerWallet.chain,
        account: relayerWallet.account,
      });
    } else {
      console.log("  No relayer (EVM_MNEMONIC not set), depositor submitting...");
      txHash = await depositorWallet.sendTransaction({
        to: funding.executeAndCreate.to as `0x${string}`,
        data: funding.executeAndCreate.data as `0x${string}`,
        chain,
        account: depositorAccount,
      });
    }

    console.log(`  executeAndCreateWithPermit2 TX: ${txHash}`);
    const receipt = await publicClient.waitForTransactionReceipt({hash: txHash});

    if (receipt.status !== "success") {
      throw new Error("executeAndCreateWithPermit2 transaction failed");
    }

    console.log("  Confirmed!");
    console.log("");
    console.log("=".repeat(60));
    console.log("SWAP FUNDED VIA PERMIT2!");
    console.log("=".repeat(60));
    console.log("");
    console.log(`  Depositor:                   ${depositorAddress}`);
    console.log(`  Approve TX:                  (one-time Permit2 approval)`);
    console.log(`  executeAndCreateWithPermit2: ${txHash}`);
    console.log("");
    console.log("The server will now process your swap.");
    console.log(`Use 'npx tsx src/index.ts watch ${swapId}' to monitor progress.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("");
    console.error("=".repeat(60));
    console.error("PERMIT2 FUNDING FAILED");
    console.error("=".repeat(60));
    console.error("");
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}
