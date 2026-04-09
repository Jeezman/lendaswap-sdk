/**
 * Redeem a swap that is in the serverfunded state.
 *
 * For Polygon/Arbitrum swaps: Provides gasless claiming.
 * For Ethereum swaps: Returns call data for manual execution.
 */

import type {Client, SwapStorage} from "@lendasat/lendaswap-sdk-pure";

export async function redeemSwap(
  client: Client,
  swapStorage: SwapStorage | undefined,
  swapId: string | undefined,
  destination: string | undefined,
): Promise<void> {
  if (!swapId) {
    console.error("Usage: tsx src/index.ts redeem <swap-id> [destination]");
    console.error("");
    console.error("Examples:");
    console.error("  tsx src/index.ts redeem 12345678-1234-1234-1234-123456789abc");
    console.error("");
    console.error("  # Arkade-to-EVM gasless claim (destination optional, uses stored target):");
    console.error("  tsx src/index.ts redeem 12345678-... [0xYourEvmAddress]");
    process.exit(1);
  }

  console.log(`Attempting to redeem swap: ${swapId}`);
  console.log("");

  // Get the swap status from the server
  const storedSwap = await client.getStoredSwap(swapId);
  if (!storedSwap) {
    throw Error("Swap not found");
  }
  const swap = storedSwap?.response;

  console.log(`Current status: ${swap.status}`);
  console.log(`Direction: ${swap.direction}`);

  // For evm_to_bitcoin claims, destination is a Bitcoin address (required)
  if (swap.direction === "evm_to_bitcoin" && !destination) {
    console.error("");
    console.error("Error: EVM-to-Bitcoin swaps require a BTC destination address.");
    console.error("Usage: tsx src/index.ts redeem <swap-id> <btc-address>");
    console.error("Example: tsx src/index.ts redeem 12345678-... bc1p...");
    process.exit(1);
  }

  // Claim the swap (reads preimage and keys from storage)
  // For arkade_to_evm, the target address was set at swap creation time
  console.log("");
  console.log("Attempting to claim swap...");
  console.log("");

  try {
    // Build claim options based on direction
    const claimOptions = swap.direction === "evm_to_bitcoin"
      ? { destinationAddress: destination!, feeRateSatPerVb: 2 }
      : destination ? { destination } : undefined;

    // #region claim
    const result = await client.claim(swapId, claimOptions);

    if (result.success) {
      console.log("Claimed! TX:", result.txHash);
      // ... "0xabc123..."
    } else {
      console.error("Claim failed:", result.message);
    }
    // #endregion claim

    if (!result.success) {
      console.error("=".repeat(60));
      console.error("CLAIM FAILED");
      console.error("=".repeat(60));
      console.error("");
      console.error(`Error: ${result.message}`);
      process.exit(1);
    }

    console.log("=".repeat(60));
    console.log("CLAIM " + (result.ethereumClaimData ? "DATA GENERATED" : "SUCCESSFUL!"));
    console.log("=".repeat(60));
    console.log("");

    if (result.ethereumClaimData) {
      // EVM swap - manual claim required (use evm-claim to submit)
      const chain = (swap as { chain?: string }).chain ?? "unknown";
      console.log(`  Chain:              ${chain}`);
      console.log("");
      console.log(`  This swap targets ${chain} and requires manual claiming.`);
      console.log("  Use the following data to call the HTLC contract:");
      console.log("");
      console.log(`  Contract Address:   ${result.ethereumClaimData.contractAddress}`);
      console.log(`  Function:           ${result.ethereumClaimData.functionSignature}`);
      console.log(`  Swap ID:            ${result.ethereumClaimData.swapId}`);
      console.log(`  Secret (bytes32):   ${result.ethereumClaimData.secret}`);
      console.log("");
      console.log("  Call Data (hex):");
      console.log(`  ${result.ethereumClaimData.callData}`);
      console.log("");
      console.log("=".repeat(60));
      console.log("");
      console.log("Use 'evm-claim' to submit the transaction, or manually with cast:");
      console.log(`  npm run evm-claim -- ${swapId}`);
      console.log("");
      console.log("Or manually:");
      console.log(`  cast send ${result.ethereumClaimData.contractAddress} ${result.ethereumClaimData.callData} --private-key <YOUR_KEY>`);
    } else if (swap.direction === "evm_to_bitcoin") {
      // EVM-to-Bitcoin - on-chain BTC claim
      console.log(`  Direction:    evm_to_bitcoin (on-chain BTC claim)`);
      console.log(`  TX Hash:      ${result.txHash}`);
      console.log(`  Destination:  ${destination}`);
      console.log("");
      console.log(`  Message:      ${result.message}`);
      console.log("");
      console.log("=".repeat(60));
      console.log("");
      console.log("The BTC claim transaction has been broadcast to the Bitcoin network.");
      console.log("Use 'npm run watch -- " + swapId + "' to monitor until completion.");

    } else if (result.chain === "arkade") {
      // #region claim-vhtlc
      // client.claim() already performed the Arkade VHTLC claim above.
      // To claim manually instead, use client.claimArkade():
      //
      //   const arkadeResult = await client.claimArkade(swapId, {
      //     destinationAddress: "ark1q...", // Your Arkade address
      //   });
      //   console.log("Claimed! TX:", arkadeResult.txId);
      //   console.log("Amount:", arkadeResult.claimAmount, "sats");
      // #endregion claim-vhtlc
      console.log(`  Direction:    ${swap.direction} (Arkade VHTLC)`);
      console.log(`  TX Hash:      ${result.txHash}`);
      console.log(`  Message:      ${result.message}`);

    } else if (swap.direction === "arkade_to_evm" || swap.direction === "lightning_to_evm") {
      // Arkade/Lightning-to-EVM - gasless claim via server
      const evmSwap = swap as { target_evm_address?: string; client_evm_address?: string };
      const targetAddr = evmSwap.target_evm_address ?? evmSwap.client_evm_address ?? "unknown";
      console.log(`  Direction:    ${swap.direction} (gasless)`);
      console.log(`  TX Hash:      ${result.txHash}`);
      console.log(`  Target:       ${targetAddr}`);
      console.log("");
      console.log(`  Message:      ${result.message}`);
      console.log("");
      console.log("=".repeat(60));
      console.log("");
      console.log("The server has submitted the claim transaction.");
      console.log("Use 'npm run watch -- " + swapId + "' to monitor until completion.");

    } else {
      // Generic EVM claim
      console.log(`  Chain:        ${result.chain}`);
      console.log(`  TX Hash:      ${result.txHash}`);
      console.log("");
      console.log(`  Message:      ${result.message}`);
      console.log("");
      console.log("=".repeat(60));
      console.log("");
      console.log("The transaction has been submitted to the network.");
      console.log("Use 'npm run watch -- " + swapId + "' to monitor until completion.");

    }

    // #region check-vhtlc-amounts
    // amountsForSwap only applies to VHTLC-based swaps that lock into Arkade
    const vhtlcDirections = ["evm_to_arkade", "btc_to_arkade", "evm_to_btc", "btc_to_evm"];
    if (vhtlcDirections.includes(swap.direction)) {
      try {
        const amounts = await client.amountsForSwap(swapId);

        console.log("Spendable:", amounts.spendable, "sats");
        // ... 100000 "sats"
        console.log("Spent:", amounts.spent, "sats");
        // ... 0 "sats"
        console.log("Recoverable:", amounts.recoverable, "sats");
        // ... 0 "sats"
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.warn("Could not fetch VHTLC amounts:", msg);
      }
    }
    // #endregion check-vhtlc-amounts

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("=".repeat(60));
    console.error("CLAIM FAILED");
    console.error("=".repeat(60));
    console.error("");
    console.error(`Error: ${message}`);
    console.error("");
    console.error("This could mean:");
    console.error("  - The swap is not in the correct state");
    console.error("  - The preimage is incorrect");
    console.error("  - Network or server issues");
    console.error("");
    console.error("Try again or check the swap status with:");
    console.error(`  npm run watch -- ${swapId}`);
    process.exit(1);
  }
}
