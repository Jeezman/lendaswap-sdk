import { describe, expect, it } from "vitest";
import {
  calculateSourceAmount,
  calculateTargetAmount,
  computeExchangeRate,
  selectTierRate,
} from "../src/price-calculations.js";

describe("selectTierRate", () => {
  const mockTiers = {
    tier_1: 0.000010773,
    tier_100: 0.0000107787855,
    tier_1000: 0.000010774087275,
    tier_5000: 0.00001075242756,
  };

  it("should return tier_1 for amounts less than 100", () => {
    expect(selectTierRate(mockTiers, 0)).toBe(mockTiers.tier_1);
    expect(selectTierRate(mockTiers, 50)).toBe(mockTiers.tier_1);
    expect(selectTierRate(mockTiers, 99)).toBe(mockTiers.tier_1);
  });

  it("should return tier_100 for amounts between 100 and 999", () => {
    expect(selectTierRate(mockTiers, 100)).toBe(mockTiers.tier_100);
    expect(selectTierRate(mockTiers, 500)).toBe(mockTiers.tier_100);
    expect(selectTierRate(mockTiers, 999)).toBe(mockTiers.tier_100);
  });

  it("should return tier_1000 for amounts between 1000 and 4999", () => {
    expect(selectTierRate(mockTiers, 1000)).toBe(mockTiers.tier_1000);
    expect(selectTierRate(mockTiers, 2500)).toBe(mockTiers.tier_1000);
    expect(selectTierRate(mockTiers, 4999)).toBe(mockTiers.tier_1000);
  });

  it("should return tier_5000 for amounts 5000 and above", () => {
    expect(selectTierRate(mockTiers, 5000)).toBe(mockTiers.tier_5000);
    expect(selectTierRate(mockTiers, 10000)).toBe(mockTiers.tier_5000);
    expect(selectTierRate(mockTiers, 100000)).toBe(mockTiers.tier_5000);
  });
});

describe("computeExchangeRate", () => {
  // Rate from backend: BTC per 1 USDC (approximately 1 BTC = 92,828 USDC)
  const btcPerUsdc = 0.000010773;

  describe("when source is EVM token and target is BTC", () => {
    it("should return the rate as-is (BTC per stablecoin)", () => {
      const result = computeExchangeRate(btcPerUsdc, false, false);
      expect(result).toBe(btcPerUsdc);
    });

    it("should work correctly for USDC → BTC swap calculation", () => {
      // User wants to swap 1000 USDC for BTC
      // Rate: 0.000010773 BTC per 1 USDC
      // Expected BTC: 1000 * 0.000010773 = 0.010773 BTC
      const rate = computeExchangeRate(btcPerUsdc, false, false);
      const usdcAmount = 1000;
      const btcReceived = usdcAmount * rate;
      expect(btcReceived).toBeCloseTo(0.010773, 6);
    });
  });

  describe("when source is BTC and target is EVM token", () => {
    it("should invert the rate (stablecoin per BTC)", () => {
      const result = computeExchangeRate(btcPerUsdc, true, true);
      // 1 / 0.000010773 ≈ 92,824.65 USDC per BTC
      expect(result).toBeCloseTo(92824.65, 0);
    });

    it("should work correctly for BTC → USDC swap calculation", () => {
      // User wants to swap 0.01 BTC for USDC
      // Inverted rate: ~92,828 USDC per 1 BTC
      // Expected USDC: 0.01 * 92828 ≈ 928.28 USDC
      const rate = computeExchangeRate(btcPerUsdc, true, true);
      const btcAmount = 0.01;
      const usdcReceived = btcAmount * rate;
      expect(usdcReceived).toBeCloseTo(928.28, 0);
    });
  });

  describe("when source is BTC and target is also BTC (Arkade ↔ Lightning)", () => {
    it("should not invert the rate", () => {
      // BTC to BTC swaps don't need inversion
      const btcToBtcRate = 1.0; // 1:1 ratio
      const result = computeExchangeRate(btcToBtcRate, true, false);
      expect(result).toBe(btcToBtcRate);
    });
  });

  describe("reverse calculation (target amount → source amount)", () => {
    it("should correctly calculate source amount when target is known (BTC → USDC)", () => {
      // User wants 1000 USDC, how much BTC do they need?
      // Rate after inversion: ~92,828 USDC per BTC
      // Source BTC = 1000 / 92828 ≈ 0.01077 BTC
      const rate = computeExchangeRate(btcPerUsdc, true, true);
      const targetUsdc = 1000;
      const sourceBtc = targetUsdc / rate;
      expect(sourceBtc).toBeCloseTo(0.01077, 4);
    });

    it("should correctly calculate source amount when target is known (USDC → BTC)", () => {
      // User wants 0.01 BTC, how much USDC do they need?
      // Rate: 0.000010773 BTC per USDC
      // Source USDC = 0.01 / 0.000010773 ≈ 928 USDC
      const rate = computeExchangeRate(btcPerUsdc, false, false);
      const targetBtc = 0.01;
      const sourceUsdc = targetBtc / rate;
      expect(sourceUsdc).toBeCloseTo(928, 0);
    });
  });
});

describe("calculateTargetAmount", () => {
  const networkFee = 0.0001; // 10,000 sats

  describe("USDC → BTC (source is EVM, target is BTC)", () => {
    // Rate: 0.000010773 BTC per 1 USDC
    const exchangeRate = 0.000010773;

    it("should convert and subtract fee from target", () => {
      const sourceAmount = 1000; // 1000 USDC
      const result = calculateTargetAmount(
        sourceAmount,
        exchangeRate,
        networkFee,
        false, // source is not BTC
        true, // target is BTC
      );
      // 1000 * 0.000010773 - 0.0001 = 0.010673 BTC
      expect(result).toBeCloseTo(0.010673, 6);
    });
  });

  describe("BTC → USDC (source is BTC, target is EVM)", () => {
    // Rate: ~92,824 USDC per 1 BTC (after inversion)
    const exchangeRate = 92824.65;

    it("should subtract fee from source, then convert", () => {
      const sourceAmount = 0.01; // 0.01 BTC
      const result = calculateTargetAmount(
        sourceAmount,
        exchangeRate,
        networkFee,
        true, // source is BTC
        false, // target is not BTC
      );
      // (0.01 - 0.0001) * 92824.65 = 918.96 USDC
      expect(result).toBeCloseTo(918.96, 0);
    });
  });

  describe("with zero fee", () => {
    it("should just multiply source by rate", () => {
      const result = calculateTargetAmount(
        100,
        2.5,
        0, // no fee
        false,
        false,
      );
      expect(result).toBe(250);
    });
  });
});

describe("calculateSourceAmount", () => {
  const networkFee = 0.0001; // 10,000 sats

  describe("USDC → BTC (source is EVM, target is BTC)", () => {
    // Rate: 0.000010773 BTC per 1 USDC
    const exchangeRate = 0.000010773;

    it("should add fee to target, then reverse convert", () => {
      const targetAmount = 0.01; // Want 0.01 BTC
      const result = calculateSourceAmount(
        targetAmount,
        exchangeRate,
        networkFee,
        false, // source is not BTC
        true, // target is BTC
      );
      // (0.01 + 0.0001) / 0.000010773 = 937.26 USDC
      expect(result).toBeCloseTo(937.26, 0);
    });
  });

  describe("BTC → USDC (source is BTC, target is EVM)", () => {
    // Rate: ~92,824 USDC per 1 BTC (after inversion)
    const exchangeRate = 92824.65;

    it("should reverse convert, then add fee to source", () => {
      const targetAmount = 1000; // Want 1000 USDC
      const result = calculateSourceAmount(
        targetAmount,
        exchangeRate,
        networkFee,
        true, // source is BTC
        false, // target is not BTC
      );
      // 1000 / 92824.65 + 0.0001 = 0.01088 BTC
      expect(result).toBeCloseTo(0.01088, 4);
    });
  });

  describe("round-trip consistency", () => {
    it("should be consistent with calculateTargetAmount (USDC → BTC)", () => {
      const exchangeRate = 0.000010773;
      const sourceAmount = 1000;

      // Forward: calculate target from source
      const targetAmount = calculateTargetAmount(
        sourceAmount,
        exchangeRate,
        networkFee,
        false,
        true,
      );

      // Reverse: calculate source from target
      const calculatedSource = calculateSourceAmount(
        targetAmount,
        exchangeRate,
        networkFee,
        false,
        true,
      );

      // Should get back original source amount
      expect(calculatedSource).toBeCloseTo(sourceAmount, 4);
    });

    it("should be consistent with calculateTargetAmount (BTC → USDC)", () => {
      const exchangeRate = 92824.65;
      const sourceAmount = 0.01;

      // Forward: calculate target from source
      const targetAmount = calculateTargetAmount(
        sourceAmount,
        exchangeRate,
        networkFee,
        true,
        false,
      );

      // Reverse: calculate source from target
      const calculatedSource = calculateSourceAmount(
        targetAmount,
        exchangeRate,
        networkFee,
        true,
        false,
      );

      // Should get back original source amount
      expect(calculatedSource).toBeCloseTo(sourceAmount, 6);
    });
  });
});
