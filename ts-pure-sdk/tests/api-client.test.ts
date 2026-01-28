import { describe, expect, it } from "vitest";
import { createApiClient } from "../src/index.js";

describe("API Client", () => {
  it("should create a client with base URL", () => {
    const client = createApiClient({
      baseUrl: "https://api.lendaswap.com",
    });

    expect(client).toBeDefined();
    expect(client.GET).toBeDefined();
    expect(client.POST).toBeDefined();
  });

  it("should create a client with API key", () => {
    const client = createApiClient({
      baseUrl: "https://api.lendaswap.com",
      apiKey: "test-api-key",
    });

    expect(client).toBeDefined();
  });
});

describe("API Client - Type Safety", () => {
  it("should have typed GET methods for known endpoints", async () => {
    const client = createApiClient({
      baseUrl: "https://api.lendaswap.com",
    });

    // These should type-check correctly
    // We're not actually calling the API, just verifying types compile
    const _getTokens = () => client.GET("/tokens");
    const _getAssetPairs = () => client.GET("/asset-pairs");
    const _getQuote = () =>
      client.GET("/quote", {
        params: {
          query: {
            from: "btc_arkade",
            to: "usdc_pol",
            base_amount: 100000,
          },
        },
      });
    const _getSwap = () =>
      client.GET("/swap/{id}", {
        params: { path: { id: "123e4567-e89b-12d3-a456-426614174000" } },
      });

    expect(_getTokens).toBeDefined();
    expect(_getAssetPairs).toBeDefined();
    expect(_getQuote).toBeDefined();
    expect(_getSwap).toBeDefined();
  });

  it("should have typed POST methods for swap creation", async () => {
    const client = createApiClient({
      baseUrl: "https://api.lendaswap.com",
    });

    // Verify POST methods exist and type-check
    const _createArkadeToPolygon = () =>
      client.POST("/swap/arkade/polygon", {
        body: {
          target_address: "0x1234567890123456789012345678901234567890",
          target_token: "usdc_pol",
          hash_lock: "0x" + "ab".repeat(32),
          refund_pk: "02" + "cd".repeat(32),
          user_id: "03" + "ef".repeat(32),
          source_amount: 100000,
        },
      });

    const _createLightningToPolygon = () =>
      client.POST("/swap/lightning/polygon", {
        body: {
          target_address: "0x1234567890123456789012345678901234567890",
          target_token: "usdc_pol",
          hash_lock: "0x" + "ab".repeat(32),
          refund_pk: "02" + "cd".repeat(32),
          user_id: "03" + "ef".repeat(32),
          source_amount: 100000,
        },
      });

    const _createBitcoinToPolygon = () =>
      client.POST("/swap/bitcoin/polygon", {
        body: {
          target_address: "0x1234567890123456789012345678901234567890",
          target_token: "usdc_pol",
          hash_lock: "0x" + "ab".repeat(32),
          refund_pk: "02" + "cd".repeat(32),
          user_id: "03" + "ef".repeat(32),
          source_amount: 100000,
        },
      });

    expect(_createArkadeToPolygon).toBeDefined();
    expect(_createLightningToPolygon).toBeDefined();
    expect(_createBitcoinToPolygon).toBeDefined();
  });
});
