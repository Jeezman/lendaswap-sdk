/**
 * Create a new swap using the Client helper methods.
 * The Client automatically stores swaps when swap storage is configured.
 */

import { type Client, type EvmChain } from "@lendasat/lendaswap-sdk-pure";

type SwapType = "lightning" | "arkade" | "bitcoin";

export async function createSwap(
  client: Client,
  from: string | undefined,
  to: string | undefined,
  amount: string | undefined,
  address: string | undefined,
): Promise<void> {
  if (!from || !to || !amount || !address) {
    console.error("Usage: tsx src/index.ts swap <from> <to> <amount> <address>");
    console.error("");
    console.error("Examples:");
    console.error("  tsx src/index.ts swap btc_lightning usdc_pol 100000 0xYourAddress");
    console.error("  tsx src/index.ts swap btc_arkade usdc_pol 100000 0xYourAddress");
    console.error("  tsx src/index.ts swap btc_onchain usdc_pol 100000 0xYourAddress");
    process.exit(1);
  }

  const amountNum = parseInt(amount, 10);
  if (isNaN(amountNum)) {
    console.error("Error: amount must be a number (in satoshis)");
    process.exit(1);
  }

  // Parse the swap direction
  const swapType = parseSwapType(from);
  const targetChain = parseTargetChain(to);

  if (!swapType || !targetChain) {
    console.error(`Unsupported swap direction: ${from} -> ${to}`);
    console.error("");
    console.error("Supported source tokens: btc_lightning, btc_arkade, btc_onchain");
    console.error("Supported target tokens: usdc_pol, usdc_arb, usdc_eth, usdt_pol, usdt_arb, usdt_eth");
    process.exit(1);
  }

  console.log(`Creating swap: ${from} -> ${to}`);
  console.log(`  Amount: ${amountNum} sats`);
  console.log(`  Target Address: ${address}`);
  console.log(`  Swap Type: ${swapType}`);
  console.log(`  Target Chain: ${targetChain}`);
  console.log("");

  try {
    let swapId: string;
    let status: string;
    let keyIndex: number;
    let sourceAmount: number;
    let targetAmount: number;
    let sourceToken: string;
    let targetToken: string;
    let paymentInfo: string;

    // Use the appropriate helper method based on swap type
    // The Client automatically stores the swap if swap storage is configured
    if (swapType === "lightning") {
      const result = await client.createLightningToEvmSwap({
        targetAddress: address,
        targetToken: to,
        targetChain,
        sourceAmount: amountNum,
      });

      swapId = result.response.id;
      status = result.response.status;
      keyIndex = result.swapParams.keyIndex;
      sourceAmount = result.response.source_amount;
      targetAmount = result.response.target_amount;
      sourceToken = from;
      targetToken = to;
      paymentInfo = `Pay this Lightning Invoice:\n  ${result.response.ln_invoice}`;

    } else if (swapType === "arkade") {
      const result = await client.createArkadeToEvmSwap({
        targetAddress: address,
        targetToken: to,
        targetChain,
        sourceAmount: amountNum,
      });

      swapId = result.response.id;
      status = result.response.status;
      keyIndex = result.swapParams.keyIndex;
      sourceAmount = result.response.source_amount;
      targetAmount = result.response.target_amount;
      sourceToken = from;
      targetToken = to;
      paymentInfo = `Fund this Arkade VHTLC Address:\n  ${result.response.htlc_address_arkade}`;

    } else {
      // bitcoin on-chain
      const result = await client.createBitcoinToEvmSwap({
        targetAddress: address,
        targetToken: to,
        targetChain,
        sourceAmount: amountNum,
      });

      swapId = result.response.id;
      status = result.response.status;
      keyIndex = result.swapParams.keyIndex;

      // Handle union type - check which fields exist
      if ("btc_htlc_address" in result.response) {
        sourceAmount = result.response.source_amount;
        targetAmount = result.response.target_amount;
        sourceToken = result.response.source_token;
        targetToken = result.response.target_token;
        paymentInfo = `Send BTC to this address:\n  ${result.response.btc_htlc_address}`;
      } else if ("source_amount" in result.response) {
        sourceAmount = result.response.source_amount;
        targetAmount = result.response.target_amount;
        sourceToken = from;
        targetToken = to;
        paymentInfo = `Fund this address:\n  ${result.response.htlc_address_arkade}`;
      } else {
        sourceAmount = amountNum;
        targetAmount = 0;
        sourceToken = from;
        targetToken = to;
        paymentInfo = "Check swap response for payment details";
      }
    }

    // Display the result
    console.log("Swap Created Successfully!");
    console.log("-".repeat(60));
    console.log(`  Swap ID:       ${swapId}`);
    console.log(`  Status:        ${status}`);
    console.log(`  Key Index:     ${keyIndex}`);
    console.log("");
    console.log(`  Source Token:  ${sourceToken}`);
    console.log(`  Source Amount: ${sourceAmount.toLocaleString()} sats`);
    console.log(`  Target Token:  ${targetToken}`);
    console.log(`  Target Amount: ${targetAmount}`);
    console.log("");
    console.log(paymentInfo);
    console.log("-".repeat(60));
    console.log("");

    if (client.swapStorage) {
      console.log("Swap stored locally. Use 'npm run swaps' to view stored swaps.");
    } else {
      console.log("Note: No swap storage configured - swap not persisted locally.");
    }
    console.log("");
    console.log(`To watch the swap status, run:`);
    console.log(`  npm run watch -- ${swapId}`);
    console.log("");
    console.log(`Once the swap is in 'serverfunded' status, redeem with:`);
    console.log(`  npm run redeem -- ${swapId}`);

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error creating swap: ${message}`);
    process.exit(1);
  }
}

/**
 * Parse the source token to determine swap type.
 */
function parseSwapType(from: string): SwapType | null {
  if (from === "btc_lightning") return "lightning";
  if (from === "btc_arkade") return "arkade";
  if (from === "btc_onchain" || from === "bitcoin") return "bitcoin";
  return null;
}

/**
 * Parse the target token to determine EVM chain.
 */
function parseTargetChain(to: string): EvmChain | null {
  if (to.endsWith("_pol")) return "polygon";
  if (to.endsWith("_arb")) return "arbitrum";
  if (to.endsWith("_eth")) return "ethereum";
  return null;
}
