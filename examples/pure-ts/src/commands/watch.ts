/**
 * Watch a swap's status by polling the backend.
 */

import type {Client, GetSwapResponse} from "@lendasat/lendaswap-sdk-pure";

const POLL_INTERVAL_MS = 5000; // 5 seconds

export async function watchSwap(
  client: Client,
  swapId: string | undefined,
): Promise<void> {
  if (!swapId) {
    console.error("Usage: tsx src/index.ts watch <swap-id>");
    console.error("");
    console.error("Example:");
    console.error("  tsx src/index.ts watch 12345678-1234-1234-1234-123456789abc");
    process.exit(1);
  }

  console.log(`Watching swap: ${swapId}`);
  console.log(`Polling every ${POLL_INTERVAL_MS / 1000} seconds...`);
  console.log("Press Ctrl+C to stop.");
  console.log("");

  let lastStatus: string | null = null;

  // #region poll-swap
  const terminalStates = [
    "clientredeemed",
    "expired",
    "clientrefunded",
    "clientfundedserverrefunded",
  ];

  // Poll until terminal state or user cancels
  while (true) {
    try {
      // #region get-swap
      const swap = await client.getSwap(swapId);

      const srcTok = "source_token" in swap ? swap.source_token : null;
      const tgtTok = "target_token" in swap ? swap.target_token : null;
      const sourceLabel = srcTok && typeof srcTok === "object" && "symbol" in srcTok
        ? `${(srcTok as Record<string, unknown>).symbol} (${(srcTok as Record<string, unknown>).chain ?? ""})`
        : swap.direction;
      const targetLabel = tgtTok && typeof tgtTok === "object" && "symbol" in tgtTok
        ? `${(tgtTok as Record<string, unknown>).symbol} (${(tgtTok as Record<string, unknown>).chain ?? ""})`
        : "";
      const sourceAmt = "source_amount" in swap ? swap.source_amount : ("btc_expected_sats" in swap ? swap.btc_expected_sats : "?");
      const targetAmt = "target_amount" in swap ? swap.target_amount : "";

      console.log(`Status: ${swap.status}  |  ${sourceAmt} ${sourceLabel} -> ${targetAmt} ${targetLabel}`);
      // #endregion get-swap

      // Only print full details if status changed
      if (swap.status !== lastStatus) {
        lastStatus = swap.status;
        printSwapStatus(swap);
      } else {
        // Print a dot to show we're still polling
        process.stdout.write(".");
      }

      // Check if we've reached a terminal state
      if (terminalStates.includes(swap.status)) {
        console.log("");
        console.log("Swap reached terminal state. Stopping watch.");
        break;
      }

      // Wait before next poll
      await sleep(POLL_INTERVAL_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`\nError fetching swap: ${message}`);
      console.log("Retrying...");
      await sleep(POLL_INTERVAL_MS);
    }
  }
  // #endregion poll-swap
}

// #region monitor-swap
// To check a swap's final status:
//
// const finalSwap = await client.getSwap(swapId);
// console.log("Status:", finalSwap.status);
// // ... "clientredeemed"
// console.log("Source amount:", finalSwap.source_amount, "sats");
// // ... 101500 "sats"
// console.log("Target amount:", finalSwap.target_amount, "sats");
// // ... 100000 "sats"
// #endregion monitor-swap

function printSwapStatus(swap: GetSwapResponse): void {
  console.log("");
  console.log("=".repeat(60));
  console.log(`Status: ${swap.status.toUpperCase()}`);
  console.log(`Time: ${new Date().toLocaleTimeString()}`);
  console.log("-".repeat(60));

  switch (swap.status) {
    case "pending":
      printPendingDetails(swap);
      break;
    case "clientfundingseen":
      console.log("Funding transaction seen in mempool...");
      printFundingTxId(swap);
      break;
    case "clientfunded":
      console.log("Your funding has been confirmed!");
      printFundingTxId(swap);
      console.log("");
      console.log("Waiting for server to fund the EVM side...");
      break;
    case "serverfunded":
      console.log("Server has funded the EVM HTLC!");
      printServerFundingDetails(swap);
      console.log("");
      console.log("*** YOU CAN NOW REDEEM ***");
      console.log(`Run: npm run start -- redeem ${swap.id}`);
      break;
    case "clientredeeming":
      console.log("Redeem transaction submitted, waiting for confirmation...");
      break;
    case "clientredeemed":
      console.log("You have successfully redeemed!");
      printRedeemDetails(swap);
      break;
    case "serverredeemed":
      console.log("Server has redeemed. Swap complete!");
      break;
    case "clientrefunded":
      console.log("You have been refunded.");
      break;
    case "expired":
      console.log("Swap has expired.");
      break;
    case "clientinvalidfunded":
      console.log("Invalid funding amount detected!");
      break;
    case "clientfundedtoolate":
      console.log("Funding arrived too late.");
      break;
    default:
      console.log(`Direction: ${swap.direction}`);
  }

  console.log("=".repeat(60));
}

function printPendingDetails(swap: GetSwapResponse): void {
  console.log("Waiting for your funding...");
  console.log("");

  if (swap.direction === "lightning_to_evm") {
    if ("bolt11_invoice" in swap && swap.bolt11_invoice) {
      console.log("Pay this Lightning Invoice:");
      console.log(`  ${swap.bolt11_invoice}`);
    }
  } else if (swap.direction === "btc_to_arkade" || swap.direction === "arkade_to_evm") {
    if ("btc_vhtlc_address" in swap && swap.btc_vhtlc_address) {
      console.log("Fund this Arkade VHTLC address:");
      console.log(`  ${swap.btc_vhtlc_address}`);
    }
  } else if (swap.direction === "bitcoin_to_evm") {
    if ("btc_htlc_address" in swap && swap.btc_htlc_address) {
      console.log("Send BTC to this address:");
      console.log(`  ${swap.btc_htlc_address}`);
    }
  } else if (swap.direction === "evm_to_arkade" || swap.direction === "evm_to_bitcoin" || swap.direction === "evm_to_lightning") {
    if ("evm_htlc_address" in swap && swap.evm_htlc_address) {
      console.log("Fund this EVM HTLC:");
      console.log(`  ${swap.evm_htlc_address}`);
    }
  }

  if ("source_amount" in swap) {
    console.log("");
    console.log(`Amount to send: ${swap.source_amount.toLocaleString()}`);
  }
}

function printFundingTxId(swap: GetSwapResponse): void {
  if ("btc_fund_txid" in swap && swap.btc_fund_txid) {
    console.log(`Funding TX: ${swap.btc_fund_txid}`);
  } else if ("evm_fund_txid" in swap && swap.evm_fund_txid) {
    console.log(`Funding TX: ${swap.evm_fund_txid}`);
  }
}

function printServerFundingDetails(swap: GetSwapResponse): void {
  if ("evm_fund_txid" in swap && swap.evm_fund_txid) {
    console.log(`Server funding TX: ${swap.evm_fund_txid}`);
  }
  if ("evm_htlc_address" in swap && swap.evm_htlc_address) {
    console.log(`EVM HTLC: ${swap.evm_htlc_address}`);
  }
}

function printRedeemDetails(swap: GetSwapResponse): void {
  if ("evm_claim_txid" in swap && swap.evm_claim_txid) {
    console.log(`Redeem TX: ${swap.evm_claim_txid}`);
  } else if ("btc_claim_txid" in swap && swap.btc_claim_txid) {
    console.log(`Redeem TX: ${swap.btc_claim_txid}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
