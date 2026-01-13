/**
 * Price calculation utilities for swap amount conversions.
 *
 * This module provides functions to calculate swap amounts using exchange rates
 * from the price feed. It handles:
 * - Tier-based rate selection based on swap volume
 * - Exchange rate inversion for BTC ↔ EVM token swaps
 * - Forward and reverse amount calculations with fee handling
 *
 * @example
 * ```typescript
 * import {
 *   selectTierRate,
 *   computeExchangeRate,
 *   calculateTargetAmount,
 *   calculateSourceAmount,
 *   type PriceTiers,
 * } from '@lendasat/lendaswap-sdk';
 *
 * // Select tier based on amount
 * const rate = selectTierRate(priceTiers, 1000); // Gets tier_1000 rate
 *
 * // Compute exchange rate with proper inversion
 * const exchangeRate = computeExchangeRate(rate, isSourceBtc, isTargetEvm);
 *
 * // Calculate target amount from source
 * const targetAmount = calculateTargetAmount(100, exchangeRate, 0.0001, false, true);
 *
 * // Calculate source amount needed for target
 * const sourceAmount = calculateSourceAmount(0.01, exchangeRate, 0.0001, false, true);
 * ```
 */

import type { PriceTiers } from "./price-feed.js";

/**
 * Select the appropriate tier rate based on the asset amount.
 * Higher amounts get better rates (lower spread).
 *
 * @param tiers - The price tiers from the price feed
 * @param assetAmount - The swap amount in quote asset units
 * @returns The rate for the appropriate tier
 *
 * @example
 * ```typescript
 * const tiers = { tier_1: 0.000010773, tier_100: 0.0000107787, tier_1000: 0.0000107740, tier_5000: 0.0000107524 };
 *
 * selectTierRate(tiers, 50);    // Returns tier_1 (0.000010773)
 * selectTierRate(tiers, 500);   // Returns tier_100 (0.0000107787)
 * selectTierRate(tiers, 2000);  // Returns tier_1000 (0.0000107740)
 * selectTierRate(tiers, 10000); // Returns tier_5000 (0.0000107524)
 * ```
 */
export function selectTierRate(tiers: PriceTiers, assetAmount: number): number {
  if (assetAmount >= 5000) {
    return tiers.tier_5000;
  }
  if (assetAmount >= 1000) {
    return tiers.tier_1000;
  }
  if (assetAmount >= 100) {
    return tiers.tier_100;
  }
  return tiers.tier_1;
}

/**
 * Compute the exchange rate with proper inversion handling.
 *
 * The backend sends rates in the format "BTC per 1 stablecoin" for ALL pairs.
 * When the source is BTC and target is a stablecoin/EVM token, we need to
 * invert the rate to get "stablecoin per 1 BTC".
 *
 * @param rate - The raw rate from the backend (BTC per 1 stablecoin)
 * @param isSourceBtc - Whether the source token is BTC (Lightning, Arkade, or Onchain)
 * @param isTargetEvmToken - Whether the target token is an EVM token (stablecoins, etc.)
 * @returns The exchange rate as "1 source = X target"
 *
 * @example
 * ```typescript
 * const btcPerUsdc = 0.000010773; // ~1 BTC = 92,828 USDC
 *
 * // USDC -> BTC: rate stays as-is (BTC per USDC)
 * computeExchangeRate(btcPerUsdc, false, false); // 0.000010773
 *
 * // BTC -> USDC: rate is inverted (USDC per BTC)
 * computeExchangeRate(btcPerUsdc, true, true); // ~92,828
 * ```
 */
export function computeExchangeRate(
  rate: number,
  isSourceBtc: boolean,
  isTargetEvmToken: boolean,
): number {
  // Backend sends same rate for both directions (BTC per stablecoin).
  // When source is BTC and target is EVM token, invert to get "EVM per BTC"
  const needsInversion = isSourceBtc && isTargetEvmToken;
  if (needsInversion) {
    return 1 / rate;
  }
  return rate;
}

/**
 * Calculate the target amount given a source amount.
 * Uses the exchange rate semantics: 1 source = exchangeRate target
 *
 * Fee handling:
 * - If source is BTC: fee is deducted from source before conversion
 * - If target is BTC: fee is deducted from target after conversion
 *
 * @param sourceAmount - Amount of source asset
 * @param exchangeRate - Rate where 1 source = exchangeRate target
 * @param networkFeeInBtc - Network fee in BTC
 * @param isSourceBtc - Whether source is BTC (fee deducted from source before conversion)
 * @param isTargetBtc - Whether target is BTC (fee deducted from target after conversion)
 * @returns Target amount after fees
 *
 * @example
 * ```typescript
 * const networkFee = 0.0001; // 10,000 sats
 *
 * // USDC -> BTC: 1000 USDC at rate 0.000010773
 * // Target = 1000 * 0.000010773 - 0.0001 = 0.010673 BTC
 * calculateTargetAmount(1000, 0.000010773, networkFee, false, true);
 *
 * // BTC -> USDC: 0.01 BTC at rate 92,824
 * // Target = (0.01 - 0.0001) * 92824 = 918.96 USDC
 * calculateTargetAmount(0.01, 92824, networkFee, true, false);
 * ```
 */
export function calculateTargetAmount(
  sourceAmount: number,
  exchangeRate: number,
  networkFeeInBtc: number,
  isSourceBtc: boolean,
  isTargetBtc: boolean,
): number {
  if (isSourceBtc) {
    // Source is BTC: deduct fee from source, then convert
    const sourceAfterFee = sourceAmount - networkFeeInBtc;
    return sourceAfterFee * exchangeRate;
  }
  // Target is BTC: convert first, then deduct fee
  const targetBeforeFee = sourceAmount * exchangeRate;
  return isTargetBtc ? targetBeforeFee - networkFeeInBtc : targetBeforeFee;
}

/**
 * Calculate the source amount needed to receive a target amount.
 * Uses the exchange rate semantics: 1 source = exchangeRate target
 *
 * Fee handling (reverse of calculateTargetAmount):
 * - If target is BTC: fee is added to target before reverse conversion
 * - If source is BTC: fee is added to source after reverse conversion
 *
 * @param targetAmount - Desired amount of target asset
 * @param exchangeRate - Rate where 1 source = exchangeRate target
 * @param networkFeeInBtc - Network fee in BTC
 * @param isSourceBtc - Whether source is BTC (fee added to required source)
 * @param isTargetBtc - Whether target is BTC (fee added to target before reverse calc)
 * @returns Source amount needed (including fees)
 *
 * @example
 * ```typescript
 * const networkFee = 0.0001; // 10,000 sats
 *
 * // Want 0.01 BTC, paying with USDC at rate 0.000010773
 * // Source = (0.01 + 0.0001) / 0.000010773 = 937.26 USDC
 * calculateSourceAmount(0.01, 0.000010773, networkFee, false, true);
 *
 * // Want 1000 USDC, paying with BTC at rate 92,824
 * // Source = 1000 / 92824 + 0.0001 = 0.01088 BTC
 * calculateSourceAmount(1000, 92824, networkFee, true, false);
 * ```
 */
export function calculateSourceAmount(
  targetAmount: number,
  exchangeRate: number,
  networkFeeInBtc: number,
  isSourceBtc: boolean,
  isTargetBtc: boolean,
): number {
  if (isTargetBtc) {
    // Target is BTC: add fee to target, then reverse convert
    const targetPlusFee = targetAmount + networkFeeInBtc;
    return targetPlusFee / exchangeRate;
  }
  // Source is BTC: reverse convert first, then add fee
  const sourceBeforeFee = targetAmount / exchangeRate;
  return isSourceBtc ? sourceBeforeFee + networkFeeInBtc : sourceBeforeFee;
}
