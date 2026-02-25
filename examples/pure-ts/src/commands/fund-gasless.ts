/**
 * Fund an EVM-sourced swap via the gasless relay.
 *
 * Truly gasless: the SDK signs off-chain (Permit2 + optional EIP-2612),
 * then POSTs to the server which submits all transactions on-chain.
 * No wallet or ETH needed for the depositor.
 */

import type { Client, SwapStorage } from "@lendasat/lendaswap-sdk-pure";

export async function fundGasless(
  client: Client,
  swapStorage: SwapStorage | undefined,
  swapId: string | undefined,
): Promise<void> {
  if (!swapId) {
    console.error("Usage: tsx src/index.ts fund-gasless <swap-id>");
    console.error("");
    console.error("Funds an EVM-sourced swap via the gasless relay.");
    console.error("The server submits all on-chain transactions (no wallet/ETH needed).");
    console.error("");
    console.error("The swap must have been created with gasless=true.");
    process.exit(1);
  }

  if (!swapStorage) {
    console.error("Error: Swap storage is required (need stored secretKey for signing).");
    process.exit(1);
  }

  console.log(`Gasless funding for swap: ${swapId}`);
  console.log("");

  try {
    const result = await client.fundSwapGasless(swapId);
    console.log("");
    console.log("=".repeat(60));
    console.log("SWAP FUNDED VIA GASLESS RELAY!");
    console.log("=".repeat(60));
    console.log("");
    console.log(`  TX Hash: ${result.txHash}`);
    console.log("");
    console.log("The server will now process your swap.");
    console.log(`Use 'npx tsx src/index.ts watch ${swapId}' to monitor progress.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("");
    console.error("=".repeat(60));
    console.error("GASLESS FUNDING FAILED");
    console.error("=".repeat(60));
    console.error("");
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}
