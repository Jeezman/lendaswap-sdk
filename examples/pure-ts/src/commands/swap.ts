/**
 * Create a new swap using the Client helper methods.
 * The Client automatically stores swaps when swap storage is configured.
 */

import {type Client, type EvmChain} from "@lendasat/lendaswap-sdk-pure";
import {mnemonicToAccount} from "viem/accounts";

type SwapType = "lightning" | "arkade" | "bitcoin" | "bitcoin-to-arkade" | "evm-to-arkade" | "evm-to-lightning" | "evm-to-bitcoin";

/** Format an amount from smallest units to human-readable with the raw value */
function formatAmount(amount: number, decimals: number, symbol: string): string {
  const humanReadable = amount / Math.pow(10, decimals);
  if (decimals === 0) {
    // For sats, just show the number
    return `${amount} ${symbol}`;
  }
  return `${humanReadable} ${symbol} (${amount} smallest units)`;
}


// TODO: we should pass in the token id not something like usdc_pol.
/** Token metadata for the generic Arkade-to-EVM endpoint (mainnet addresses) */
const EVM_TOKEN_MAP: Record<string, { tokenAddress: string; evmChainId: number }> = {
  usdc_pol: {tokenAddress: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", evmChainId: 137},
  usdc_arb: {tokenAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", evmChainId: 42161},
  usdc_eth: {tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", evmChainId: 1},
  usdt_pol: {tokenAddress: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", evmChainId: 137},
  usdt_arb: {tokenAddress: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", evmChainId: 42161},
  usdt_eth: {tokenAddress: "0xdAC17F958D2ee523a2206206994597C13D831ec7", evmChainId: 1},
  // WBTC for regtest/mainnet testing
  wbtc_pol: {tokenAddress: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6", evmChainId: 137},
};

export async function createSwap(
  client: Client,
  from: string | undefined,
  to: string | undefined,
  amount: string | undefined,
  address: string | undefined,
  evmMnemonic?: string,
): Promise<void> {
  if (!from || !to || !amount) {
    console.error("Usage: tsx src/index.ts swap <from> <to> <amount> [address]");
    console.error("");
    console.error("Arkade to EVM Examples (gasless — no address needed, SDK derives internally):");
    console.error("  tsx src/index.ts swap btc_arkade usdc_pol 100000");
    console.error("  tsx src/index.ts swap btc_arkade usdc_arb 100000");
    console.error("");
    console.error("BTC to EVM Examples:");
    console.error("  tsx src/index.ts swap btc_lightning usdc_pol 100000 0xYourAddress");
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
    console.error("");
    console.error("EVM to Bitcoin (on-chain) Examples:");
    console.error("  tsx src/index.ts swap usdc_pol btc_onchain 1000000 bc1p...");
    console.error("  tsx src/index.ts swap usdc_arb btc_onchain 1000000 bc1p...");
    console.error("  tsx src/index.ts swap usdc_eth btc_onchain 1000000 bc1p...");
    process.exit(1);
  }

  // Parse the swap direction first (before numeric validation)
  const swapType = parseSwapType(from, to);

  // For evm-to-lightning, amount is actually the bolt11 invoice, not a number
  const amountNum = swapType === "evm-to-lightning" ? 0 : parseFloat(amount);
  if (swapType !== "evm-to-lightning" && isNaN(amountNum)) {
    console.error("Error: amount must be a number");
    process.exit(1);
  }

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
    console.error("");
    console.error("Supported EVM to Bitcoin (on-chain):");
    console.error("  Source: usdc_pol, usdc_arb, usdc_eth (or any *_pol, *_arb, *_eth)");
    console.error("  Target: btc_onchain");
    process.exit(1);
  }

  // Address is required for all swap types except:
  // - arkade (SDK derives EVM address internally)
  // - evm-to-lightning when evmMnemonic is available (can derive EVM address)
  const canDeriveEvmAddress = swapType === "evm-to-lightning" && evmMnemonic;
  if (swapType !== "arkade" && !address && !canDeriveEvmAddress) {
    console.error("Error: address is required for this swap type");
    console.error("Usage: tsx src/index.ts swap <from> <to> <amount> <address>");
    process.exit(1);
  }

  console.log(`Creating swap: ${from} -> ${to}`);
  if (swapType === "evm-to-lightning") {
    console.log(`  Invoice: ${amount.slice(0, 30)}...`);
    console.log(`  EVM Address: ${address || "(will derive from EVM_MNEMONIC)"}`);
  } else if (swapType === "evm-to-arkade") {
    console.log(`  Amount: ${amountNum}`);
    console.log(`  Arkade Address: ${address}`);
  } else if (swapType === "evm-to-bitcoin") {
    console.log(`  Amount: ${amountNum}`);
    console.log(`  BTC Destination: ${address}`);
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
    let sourceDecimals: number;
    let sourceSymbol: string;
    let targetAmount: number;
    let targetDecimals: number;
    let targetSymbol: string;
    let paymentInfo: string;

    // Use the appropriate helper method based on swap type
    // The Client automatically stores the swap if swap storage is configured
    if (swapType === "evm-to-arkade") {
      // EVM to Arkade swap using the generic endpoint
      // For this swap type, `address` is the Arkade address
      // We need the EVM user address - try arg first, then derive from EVM_MNEMONIC
      let evmUserAddress = process.argv[7]; // 5th positional arg after 'swap'

      if (!evmUserAddress && evmMnemonic) {
        // Derive EVM address from mnemonic
        const account = mnemonicToAccount(evmMnemonic);
        evmUserAddress = account.address;
        console.log(`  Using EVM address from EVM_MNEMONIC: ${evmUserAddress}`);
      }

      if (!evmUserAddress) {
        console.error("Error: EVM to Arkade swaps require your EVM wallet address.");
        console.error("Either provide it as the 5th argument or set EVM_MNEMONIC environment variable.");
        console.error("");
        console.error("Usage: tsx src/index.ts swap <sourceToken> btc_arkade <amount> <arkadeAddress> [evmAddress]");
        console.error("Example: tsx src/index.ts swap usdc_pol btc_arkade 100 ark1... 0x1234...");
        process.exit(1);
      }

      // Look up token info from the map
      const tokenInfo = EVM_TOKEN_MAP[from];
      if (!tokenInfo) {
        console.error(`Unknown source token: ${from}`);
        console.error(`Supported tokens: ${Object.keys(EVM_TOKEN_MAP).join(", ")}`);
        process.exit(1);
      }

      console.log(`  Chain ID: ${tokenInfo.evmChainId}`);
      console.log(`  Token Address: ${tokenInfo.tokenAddress}`);
      console.log(`  EVM User Address: ${evmUserAddress}`);
      console.log("");

      // #region evm-to-arkade
      const amountBigInt = BigInt(amount);
      const result = await client.createEvmToArkadeSwapGeneric({
        targetAddress: address!, // Arkade address (validated above)
        tokenAddress: tokenInfo.tokenAddress,
        evmChainId: tokenInfo.evmChainId,
        userAddress: evmUserAddress,
        sourceAmount: amountBigInt,
      });

      console.log("Swap ID:", result.response.id);
      // ... "550e8400-e29b-41d4-a716-446655440000"
      // #endregion evm-to-arkade

      swapId = result.response.id;
      status = result.response.status;
      keyIndex = result.swapParams.keyIndex;
      sourceAmount = result.response.source_amount;
      sourceDecimals = result.response.source_token.decimals;
      sourceSymbol = result.response.source_token.symbol;
      targetAmount = result.response.btc_expected_sats;
      targetDecimals = 0; // sats
      targetSymbol = "sats";
      paymentInfo = [
        `1. Approve token spend to coordinator:`,
        `   Token contract: ${result.response.source_token.address}`,
        ``,
        `2. Fund via coordinator using 'npm run evm-fund -- ${result.response.id}'`,
        `   This will swap ${sourceSymbol} → WBTC and lock into HTLC`,
      ].join("\n");

    } else if (swapType === "evm-to-lightning") {
      // EVM to Lightning swap
      // For this swap type:
      // - `amount` is actually the bolt11 invoice
      // - `address` is the user's EVM wallet address (optional if EVM_MNEMONIC is set)
      const bolt11Invoice = amount; // amount param contains the invoice
      let evmUserAddress = address;

      if (!evmUserAddress && evmMnemonic) {
        // Derive EVM address from mnemonic
        const account = mnemonicToAccount(evmMnemonic);
        evmUserAddress = account.address;
        console.log(`  Using EVM address from EVM_MNEMONIC: ${evmUserAddress}`);
      }

      if (!evmUserAddress) {
        console.error("Error: EVM to Lightning swaps require your EVM wallet address.");
        console.error("Either provide it as the 4th argument or set EVM_MNEMONIC environment variable.");
        console.error("");
        console.error("Usage: tsx src/index.ts swap <sourceToken> btc_lightning <invoice> [evmAddress]");
        console.error("Example: tsx src/index.ts swap usdc_pol btc_lightning lnbc... 0x1234...");
        process.exit(1);
      }

      // Look up token info from the map
      const tokenInfo = EVM_TOKEN_MAP[from];
      if (!tokenInfo) {
        console.error(`Unknown source token: ${from}`);
        console.error(`Supported tokens: ${Object.keys(EVM_TOKEN_MAP).join(", ")}`);
        process.exit(1);
      }

      console.log(`  Chain ID: ${tokenInfo.evmChainId}`);
      console.log(`  Token Address: ${tokenInfo.tokenAddress}`);
      console.log("");

      // #region evm-to-lightning
      const result = await client.createEvmToLightningSwapGeneric({
        lightningInvoice: bolt11Invoice,
        evmChainId: tokenInfo.evmChainId,
        tokenAddress: tokenInfo.tokenAddress,
        userAddress: evmUserAddress,
      });

      console.log("HTLC contract:", result.response.evm_htlc_address);
      // ... "0x1234...abcd"
      console.log("Swap ID:", result.response.id);
      // ... "550e8400-e29b-41d4-a716-446655440000"
      // #endregion evm-to-lightning

      swapId = result.response.id;
      status = result.response.status;
      keyIndex = result.swapParams.keyIndex;
      sourceAmount = result.response.source_amount;
      sourceDecimals = result.response.source_token.decimals;
      sourceSymbol = result.response.source_token.symbol;
      targetAmount = result.response.btc_expected_sats;
      targetDecimals = 0; // sats
      targetSymbol = "sats";
      paymentInfo = [
        `1. Fund via SDK CLI:`,
        `   npm run evm-fund -- ${result.response.id}`,
        ``,
        `   This will:`,
        `   - Approve ${sourceSymbol} to HTLCErc20 contract`,
        `   - Lock tokens in the HTLC`,
        ``,
        `Once funded, the server will pay your Lightning invoice.`,
      ].join("\n");

    } else if (swapType === "evm-to-bitcoin") {
      // EVM to Bitcoin (on-chain) swap
      // `address` is the BTC destination address for claiming
      // EVM user address: try 5th positional arg, then derive from EVM_MNEMONIC
      let evmUserAddress = process.argv[7]; // 5th positional arg after 'swap'

      if (!evmUserAddress && evmMnemonic) {
        const account = mnemonicToAccount(evmMnemonic);
        evmUserAddress = account.address;
        console.log(`  Using EVM address from EVM_MNEMONIC: ${evmUserAddress}`);
      }

      if (!evmUserAddress) {
        console.error("Error: EVM to Bitcoin swaps require your EVM wallet address.");
        console.error("Either provide it as the 5th argument or set EVM_MNEMONIC environment variable.");
        console.error("");
        console.error("Usage: tsx src/index.ts swap <sourceToken> btc_onchain <amount> <btcAddress> [evmAddress]");
        console.error("Example: tsx src/index.ts swap usdc_pol btc_onchain 1000000 bc1p... 0x1234...");
        process.exit(1);
      }

      const tokenInfo = EVM_TOKEN_MAP[from];
      if (!tokenInfo) {
        console.error(`Unknown source token: ${from}`);
        console.error(`Supported tokens: ${Object.keys(EVM_TOKEN_MAP).join(", ")}`);
        process.exit(1);
      }

      console.log(`  Chain ID: ${tokenInfo.evmChainId}`);
      console.log(`  Token Address: ${tokenInfo.tokenAddress}`);
      console.log(`  EVM User Address: ${evmUserAddress}`);
      console.log("");

      const amountBigInt = BigInt(amount);
      const result = await client.createEvmToBitcoinSwap({
        tokenAddress: tokenInfo.tokenAddress,
        evmChainId: tokenInfo.evmChainId,
        userAddress: evmUserAddress,
        sourceAmount: amountBigInt,
      });

      console.log("Swap ID:", result.response.id);

      swapId = result.response.id;
      status = result.response.status;
      keyIndex = result.swapParams.keyIndex;
      sourceAmount = result.response.source_amount;
      sourceDecimals = result.response.source_token.decimals;
      sourceSymbol = result.response.source_token.symbol;
      targetAmount = result.response.target_amount;
      targetDecimals = 0; // sats
      targetSymbol = "sats";
      paymentInfo = [
        `1. Fund via coordinator using 'npm run evm-fund -- ${result.response.id}'`,
        `   This will swap ${sourceSymbol} → WBTC and lock into EVM HTLC`,
        ``,
        `2. Once the server funds the BTC HTLC, redeem with:`,
        `   npm run redeem -- ${result.response.id} ${address}`,
        `   (BTC will be sent to: ${address})`,
      ].join("\n");

    } else if (swapType === "bitcoin-to-arkade") {
      // #region create-swap
      const result = await client.createBitcoinToArkadeSwap({
        satsReceive: Math.floor(amountNum),
        targetAddress: address!,
      });

      console.log("Send BTC to:", result.response.btc_htlc_address);
      // ... "bc1q..."
      console.log("Amount:", result.response.source_amount, "sats");
      // ... 101500 "sats"
      console.log("Swap ID:", result.response.id);
      // ... "550e8400-e29b-41d4-a716-446655440000"
      // #endregion create-swap

      swapId = result.response.id;
      status = result.response.status;
      keyIndex = result.swapParams.keyIndex;
      sourceAmount = result.response.source_amount;
      sourceDecimals = 0; // sats
      sourceSymbol = "sats";
      targetAmount = result.response.target_amount;
      targetDecimals = 0; // sats
      targetSymbol = "sats";
      paymentInfo = [
        `Send BTC to this on-chain address:`,
        `  ${result.response.btc_htlc_address}`,
        ``,
        `Amount to send: ${result.response.source_amount} sats`,
        `You will receive: ${result.response.target_amount} sats on Arkade`,
      ].join("\n");

    } else if (swapType === "lightning") {
      const tokenInfo = EVM_TOKEN_MAP[to];
      if (!tokenInfo) {
        console.error(`Unknown target token: ${to}`);
        console.error(`Supported tokens: ${Object.keys(EVM_TOKEN_MAP).join(", ")}`);
        process.exit(1);
      }

      // #region lightning-to-evm-generic
      const result = await client.createLightningToEvmSwapGeneric({
        targetAddress: address!,
        evmChainId: tokenInfo.evmChainId,
        tokenAddress: tokenInfo.tokenAddress,
        amountIn: Math.floor(amountNum),
      });

      console.log("Pay invoice:", result.response.boltz_invoice);
      console.log("You will receive:", result.response.target_amount, to.split("_")[0].toUpperCase());
      // #endregion lightning-to-evm-generic

      swapId = result.response.id;
      status = result.response.status;
      keyIndex = result.swapParams.keyIndex;
      sourceAmount = result.response.btc_expected_sats;
      sourceDecimals = 0; // sats
      sourceSymbol = "sats";
      targetAmount = result.response.target_amount;
      targetDecimals = 8; // Response is in smallest units
      targetSymbol = to.replace(/_.*$/, "").toUpperCase();
      paymentInfo = `Pay this Lightning Invoice:\n  ${result.response.boltz_invoice}`;

    } else if (swapType === "arkade") {
      const tokenInfo = EVM_TOKEN_MAP[to];
      if (!tokenInfo) {
        console.error(`Unknown target token: ${to}`);
        console.error(`Supported tokens: ${Object.keys(EVM_TOKEN_MAP).join(", ")}`);
        process.exit(1);
      }

      // Target address is required for arkade-to-evm swaps
      if (!address) {
        console.error("Error: Arkade-to-EVM swaps require a target EVM address.");
        console.error("");
        console.error("Usage: tsx src/index.ts swap btc_arkade <target-token> <amount> <target-evm-address>");
        console.error("Example: tsx src/index.ts swap btc_arkade usdc_pol 100000 0x1234...");
        process.exit(1);
      }

      const amountBigInt = BigInt(amount);
      const result = await client.createArkadeToEvmSwapGeneric({
        tokenAddress: tokenInfo.tokenAddress,
        evmChainId: tokenInfo.evmChainId,
        sourceAmount: amountBigInt,
        targetAddress: address,
      });

      swapId = result.response.id;
      status = result.response.status;
      keyIndex = result.swapParams.keyIndex;
      sourceAmount = result.response.btc_expected_sats;
      sourceDecimals = 0; // sats
      sourceSymbol = "sats";
      const tgtToken = result.response.target_token as { address: string; symbol: string; decimals: number };
      targetAmount = result.response.target_amount ?? 0;
      targetDecimals = tgtToken.decimals ?? 6;
      targetSymbol = tgtToken.symbol ?? "tokens";
      paymentInfo = [
        `Fund this Arkade VHTLC Address:`,
        `  ${result.response.btc_vhtlc_address}`,
        ``,
        `Amount: ${result.response.btc_expected_sats} sats`,
        `Target address: ${address}`,
        ``,
        `Once funded, the server will fund the EVM HTLC.`,
        `Then redeem with: npm run redeem -- ${result.response.id}`,
      ].join("\n");

    } else {
      // bitcoin on-chain to EVM (generic endpoint)
      const tokenInfo = EVM_TOKEN_MAP[to];
      if (!tokenInfo) {
        console.error(`Unknown target token: ${to}`);
        console.error(`Supported tokens: ${Object.keys(EVM_TOKEN_MAP).join(", ")}`);
        process.exit(1);
      }

      const result = await client.createBitcoinToEvmSwap({
        targetAddress: address!,
        tokenAddress: tokenInfo.tokenAddress,
        evmChainId: tokenInfo.evmChainId,
        sourceAmount: Math.floor(amountNum),
      });

      swapId = result.response.id;
      status = result.response.status;
      keyIndex = result.swapParams.keyIndex;
      sourceAmount = result.response.source_amount;
      sourceDecimals = 0; // sats
      sourceSymbol = "sats";
      targetAmount = result.response.target_amount;
      targetDecimals = result.response.target_token.decimals;
      targetSymbol = result.response.target_token.symbol;
      paymentInfo = [
        `Send BTC to this on-chain address:`,
        `  ${result.response.btc_htlc_address}`,
        ``,
        `Amount to send: ${result.response.source_amount} sats`,
        `EVM HTLC: ${result.response.evm_htlc_address}`,
      ].join("\n");
    }

    // Display the result
    console.log("Swap Created Successfully!");
    console.log("-".repeat(60));
    console.log(`  Swap ID:       ${swapId}`);
    console.log(`  Status:        ${status}`);
    console.log(`  Key Index:     ${keyIndex}`);
    console.log("");
    console.log(`  Source:        ${formatAmount(sourceAmount, sourceDecimals, sourceSymbol)}`);
    console.log(`  Target:        ${formatAmount(targetAmount, targetDecimals, targetSymbol)}`);
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

    // #region error-handling
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

  // EVM to Bitcoin (on-chain)
  if ((to === "btc_onchain" || to === "bitcoin") && isEvmToken(from)) return "evm-to-bitcoin";

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
