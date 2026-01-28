import { describe, expect, it } from "vitest";
import { Client, ClientBuilder } from "../src/index.js";

describe("Client", () => {
  it("should create a client with config", () => {
    const client = Client.create({
      baseUrl: "https://api.lendaswap.com",
    });

    expect(client).toBeDefined();
    expect(client.baseUrl).toBe("https://api.lendaswap.com");
  });

  it("should create a client with API key", () => {
    const client = Client.create({
      baseUrl: "https://api.lendaswap.com",
      apiKey: "test-api-key",
    });

    expect(client).toBeDefined();
  });

  it("should expose the underlying API client", () => {
    const client = Client.create({
      baseUrl: "https://api.lendaswap.com",
    });

    expect(client.api).toBeDefined();
    expect(client.api.GET).toBeDefined();
    expect(client.api.POST).toBeDefined();
  });

  it("should have convenience methods", () => {
    const client = Client.create({
      baseUrl: "https://api.lendaswap.com",
    });

    // Verify methods exist
    expect(client.healthCheck).toBeDefined();
    expect(client.getVersion).toBeDefined();
    expect(client.getTokens).toBeDefined();
    expect(client.getAssetPairs).toBeDefined();
    expect(client.getQuote).toBeDefined();
    expect(client.getSwap).toBeDefined();
  });
});

describe("ClientBuilder", () => {
  it("should build a client with default base URL", () => {
    const client = Client.builder().build();

    expect(client).toBeDefined();
    expect(client.baseUrl).toBe("https://apilendaswap.lendasat.com/");
  });

  it("should build a client with custom base URL", () => {
    const client = Client.builder()
      .withBaseUrl("https://custom.api.com")
      .build();

    expect(client.baseUrl).toBe("https://custom.api.com");
  });

  it("should build a client with API key", () => {
    const client = Client.builder()
      .withApiKey("test-api-key")
      .build();

    expect(client).toBeDefined();
  });

  it("should support method chaining", () => {
    const client = Client.builder()
      .withBaseUrl("https://custom.api.com")
      .withApiKey("test-api-key")
      .build();

    expect(client).toBeDefined();
    expect(client.baseUrl).toBe("https://custom.api.com");
  });

  it("should create new builder from ClientBuilder class", () => {
    const builder = new ClientBuilder();
    const client = builder.withBaseUrl("https://test.api.com").build();

    expect(client.baseUrl).toBe("https://test.api.com");
  });
});
