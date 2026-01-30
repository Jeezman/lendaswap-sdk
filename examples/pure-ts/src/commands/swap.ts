/**
 * Create a new swap using the Client helper methods.
 * The Client automatically stores swaps when swap storage is configured.
 */

import { type Client, type EvmChain } from "@lendasat/lendaswap-sdk-pure";

type SwapType = "lightning" | "arkade" | "bitcoin" | "bitcoin-to-arkade" | "evm-to-arkade" | "evm-to-lightning";

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
    console.error("BTC to EVM Examples:");
    console.error("  tsx src/index.ts swap btc_lightning usdc_pol 100000 0xYourAddress");
    console.error("  tsx src/index.ts swap btc_arkade usdc_pol 100000 0xYourAddress");
    console.error("  tsx src/index.ts swap btc_onchain usdc_pol 100000 0xYourAddress");
    console.error("");
    console.error("BTC On-chain to Arkade Examples:");
    console.error("  tsx src/index.ts swap btc_onchain btc_arkade 100000 ark1YourAddress");
    console.error("");
    console.error("EVM to Arkade Examples:");
    console.error("  tsx src/index.ts swap usdc_pol btc_arkade 100 ark1YourAddress 0xYourEvmAddress");
    console.error("  tsx src/index.ts swap usdc_arb btc_arkade 100 ark1YourAddress 0xYourEvmAddress");
    console.error("  tsx src/index.ts swap usdc_eth btc_arkade 100 ark1YourAddress 0xYourEvmAddress");
    console.error("");
    console.error("EVM to Lightning Examples:");
    console.error("  tsx src/index.ts swap usdc_pol btc_lightning lnbc... 0xYourEvmAddress");
    console.error("  tsx src/index.ts swap usdc_arb btc_lightning lnbc... 0xYourEvmAddress");
    process.exit(1);
  }

  const amountNum = parseFloat(amount);
  if (isNaN(amountNum)) {
    console.error("Error: amount must be a number");
    process.exit(1);
  }

  // Parse the swap direction
  const swapType = parseSwapType(from, to);

  if (!swapType) {
    console.error(`Unsupported swap direction: ${from} -> ${to}`);
    console.error("");
    console.error("Supported BTC to EVM:");
    console.error("  Source: btc_lightning, btc_arkade, btc_onchain");
    console.error("  Target: usdc_pol, usdc_arb, usdc_eth, usdt_pol, usdt_arb, usdt_eth");
    console.error("");
    console.error("Supported BTC on-chain to Arkade:");
    console.error("  Source: btc_onchain");
    console.error("  Target: btc_arkade");
    console.error("");
    console.error("Supported EVM to Arkade:");
    console.error("  Source: usdc_pol, usdc_arb, usdc_eth (or any *_pol, *_arb, *_eth)");
    console.error("  Target: btc_arkade");
    console.error("");
    console.error("Supported EVM to Lightning:");
    console.error("  Source: usdc_pol, usdc_arb, usdc_eth (or any *_pol, *_arb, *_eth)");
    console.error("  Target: btc_lightning");
    process.exit(1);
  }

  console.log(`Creating swap: ${from} -> ${to}`);
  if (swapType === "evm-to-lightning") {
    console.log(`  Invoice: ${amount.slice(0, 30)}...`);
    console.log(`  EVM Address: ${address}`);
  } else if (swapType === "evm-to-arkade") {
    console.log(`  Amount: ${amountNum}`);
    console.log(`  Arkade Address: ${address}`);
  } else if (swapType === "bitcoin-to-arkade") {
    console.log(`  Sats to Receive: ${amountNum}`);
    console.log(`  Arkade Address: ${address}`);
  } else {
    console.log(`  Amount: ${amountNum} sats`);
    console.log(`  Target Address: ${address}`);
  }
  console.log(`  Swap Type: ${swapType}`);
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
    if (swapType === "evm-to-arkade") {
      // EVM to Arkade swap
      // For this swap type, `address` is the Arkade address
      // We need a 5th arg for the EVM user address
      const evmUserAddress = process.argv[7]; // 5th positional arg after 'swap'

      if (!evmUserAddress) {
        console.error("Error: EVM to Arkade swaps require your EVM wallet address as the 5th argument");
        console.error("");
        console.error("Usage: tsx src/index.ts swap <sourceToken> btc_arkade <amount> <arkadeAddress> <evmAddress>");
        console.error("Example: tsx src/index.ts swap usdc_pol btc_arkade 100 ark1... 0x1234...");
        process.exit(1);
      }

      const sourceChain = parseSourceChain(from);
      if (!sourceChain) {
        console.error(`Unsupported source token: ${from}`);
        process.exit(1);
      }

      console.log(`  Source Chain: ${sourceChain}`);
      console.log(`  EVM User Address: ${evmUserAddress}`);
      console.log("");

      const result = await client.createEvmToArkadeSwap({
        sourceChain,
        sourceToken: from,
        sourceAmount: amountNum,
        targetAddress: address, // Arkade address
        userAddress: evmUserAddress, // EVM wallet address
      });

      swapId = result.response.id;
      status = result.response.status;
      keyIndex = result.swapParams.keyIndex;
      sourceAmount = result.response.source_amount;
      targetAmount = result.response.target_amount;
      sourceToken = result.response.source_token;
      targetToken = result.response.target_token;
      paymentInfo = [
        `1. Approve token spend:`,
        `   Token contract: ${result.response.source_token_address}`,
        `   HTLC contract:  ${result.response.htlc_address_evm}`,
        ``,
        `2. Fund the HTLC (call createSwap or similar on the contract)`,
        `   HTLC Address: ${result.response.htlc_address_evm}`,
      ].join("\n");

    } else if (swapType === "evm-to-lightning") {
      // EVM to Lightning swap
      // For this swap type:
      // - `amount` is actually the bolt11 invoice
      // - `address` is the user's EVM wallet address
      const bolt11Invoice = amount; // amount param contains the invoice
      const evmUserAddress = address; // address param contains the EVM address

      const sourceChain = parseSourceChain(from);
      if (!sourceChain) {
        console.error(`Unsupported source token: ${from}`);
        process.exit(1);
      }

      console.log(`  Source Chain: ${sourceChain}`);
      console.log("");

      const result = await client.createEvmToLightningSwap({
        sourceChain,
        sourceToken: from,
        bolt11Invoice,
        userAddress: evmUserAddress,
      });

      swapId = result.response.id;
      status = result.response.status;
      keyIndex = result.swapParams.keyIndex;
      sourceAmount = result.response.source_amount;
      targetAmount = result.response.target_amount;
      sourceToken = result.response.source_token;
      targetToken = result.response.target_token;
      paymentInfo = [
        `1. Approve token spend:`,
        `   Token contract: ${result.response.source_token_address}`,
        `   HTLC contract:  ${result.response.htlc_address_evm}`,
        ``,
        `2. Fund the HTLC (call createSwap or similar on the contract)`,
        `   HTLC Address: ${result.response.htlc_address_evm}`,
        ``,
        `Once funded, the server will pay the Lightning invoice.`,
      ].join("\n");

    } else if (swapType === "bitcoin-to-arkade") {
      const result = await client.createBitcoinToArkadeSwap({
        satsReceive: Math.floor(amountNum),
        targetAddress: address,
      });

      swapId = result.response.id;
      status = result.response.status;
      keyIndex = result.swapParams.keyIndex;
      sourceAmount = result.response.source_amount;
      targetAmount = result.response.target_amount;
      sourceToken = result.response.source_token;
      targetToken = result.response.target_token;
      paymentInfo = [
        `Send BTC to this on-chain address:`,
        `  ${result.response.btc_htlc_address}`,
        ``,
        `Amount to send: ${result.response.source_amount} sats`,
        `You will receive: ${result.response.target_amount} sats on Arkade`,
      ].join("\n");

    } else if (swapType === "lightning") {
      const targetChain = parseTargetChain(to);
      if (!targetChain) {
        console.error(`Unsupported target token: ${to}`);
        process.exit(1);
      }

      const result = await client.createLightningToEvmSwap({
        targetAddress: address,
        targetToken: to,
        targetChain,
        sourceAmount: Math.floor(amountNum),
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
      const targetChain = parseTargetChain(to);
      if (!targetChain) {
        console.error(`Unsupported target token: ${to}`);
        process.exit(1);
      }

      const result = await client.createArkadeToEvmSwap({
        targetAddress: address,
        targetToken: to,
        targetChain,
        sourceAmount: Math.floor(amountNum),
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
      const targetChain = parseTargetChain(to);
      if (!targetChain) {
        console.error(`Unsupported target token: ${to}`);
        process.exit(1);
      }

      const result = await client.createBitcoinToEvmSwap({
        targetAddress: address,
        targetToken: to,
        targetChain,
        sourceAmount: Math.floor(amountNum),
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
    console.log(`  Source Amount: ${sourceAmount}`);
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
 * Parse the source and target tokens to determine swap type.
 */
function parseSwapType(from: string, to: string): SwapType | null {
  // BTC on-chain to Arkade
  if ((from === "btc_onchain" || from === "bitcoin") && to === "btc_arkade") return "bitcoin-to-arkade";

  // BTC to EVM
  if (from === "btc_lightning") return "lightning";
  if (from === "btc_arkade") return "arkade";
  if (from === "btc_onchain" || from === "bitcoin") return "bitcoin";

  // EVM to Arkade
  if (to === "btc_arkade" && isEvmToken(from)) return "evm-to-arkade";

  // EVM to Lightning
  if (to === "btc_lightning" && isEvmToken(from)) return "evm-to-lightning";

  return null;
}

/**
 * Check if a token is an EVM token.
 */
function isEvmToken(token: string): boolean {
  return token.endsWith("_pol") || token.endsWith("_arb") || token.endsWith("_eth");
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

/**
 * Parse the source token to determine EVM chain (for EVM to Arkade swaps).
 */
function parseSourceChain(from: string): EvmChain | null {
  if (from.endsWith("_pol")) return "polygon";
  if (from.endsWith("_arb")) return "arbitrum";
  if (from.endsWith("_eth")) return "ethereum";
  return null;
}
