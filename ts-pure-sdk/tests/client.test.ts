import { beforeEach, describe, expect, it } from "vitest";
import { Client, ClientBuilder, InMemoryWalletStorage } from "../src/index.js";

describe("Client", () => {
  it("should create a client with builder", async () => {
    const client = await Client.builder().build();

    expect(client).toBeDefined();
    expect(client.baseUrl).toBe("https://apilendaswap.lendasat.com/");
  });

  it("should expose the underlying API client", async () => {
    const client = await Client.builder().build();

    expect(client.api).toBeDefined();
    expect(client.api.GET).toBeDefined();
    expect(client.api.POST).toBeDefined();
  });

  it("should have convenience methods", async () => {
    const client = await Client.builder().build();

    expect(client.healthCheck).toBeDefined();
    expect(client.getVersion).toBeDefined();
    expect(client.getTokens).toBeDefined();
    expect(client.getQuote).toBeDefined();
    expect(client.getSwap).toBeDefined();
  });
});

describe("ClientBuilder", () => {
  it("should build a client with default base URL", async () => {
    const client = await Client.builder().build();

    expect(client).toBeDefined();
    expect(client.baseUrl).toBe("https://apilendaswap.lendasat.com/");
  });

  it("should build a client with custom base URL", async () => {
    const client = await Client.builder()
      .withBaseUrl("https://custom.api.com")
      .build();

    expect(client.baseUrl).toBe("https://custom.api.com");
  });

  it("should build a client with API key", async () => {
    const client = await Client.builder().withApiKey("test-api-key").build();

    expect(client).toBeDefined();
  });

  it("should support method chaining", async () => {
    const client = await Client.builder()
      .withBaseUrl("https://custom.api.com")
      .withApiKey("test-api-key")
      .build();

    expect(client).toBeDefined();
    expect(client.baseUrl).toBe("https://custom.api.com");
  });

  it("should create new builder from ClientBuilder class", async () => {
    const builder = new ClientBuilder();
    const client = await builder.withBaseUrl("https://test.api.com").build();

    expect(client.baseUrl).toBe("https://test.api.com");
  });

  it("should build a client with signer storage", async () => {
    const storage = new InMemoryWalletStorage();
    const client = await Client.builder().withSignerStorage(storage).build();

    expect(client).toBeDefined();
  });
});

describe("Client Signer", () => {
  let storage: InMemoryWalletStorage;

  beforeEach(() => {
    storage = new InMemoryWalletStorage();
  });

  it("should generate mnemonic on build", async () => {
    const client = await Client.builder().withSignerStorage(storage).build();

    const mnemonic = client.getMnemonic();
    expect(mnemonic.split(" ")).toHaveLength(12);
  });

  it("should persist mnemonic to storage", async () => {
    const client = await Client.builder().withSignerStorage(storage).build();
    const mnemonic = client.getMnemonic();

    const storedMnemonic = await storage.getMnemonic();
    expect(storedMnemonic).toBe(mnemonic);
  });

  it("should use provided mnemonic", async () => {
    const mnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const client = await Client.builder()
      .withSignerStorage(storage)
      .withMnemonic(mnemonic)
      .build();

    expect(client.getMnemonic()).toBe(mnemonic);
  });

  it("should persist provided mnemonic to storage", async () => {
    const mnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    await Client.builder()
      .withSignerStorage(storage)
      .withMnemonic(mnemonic)
      .build();

    const storedMnemonic = await storage.getMnemonic();
    expect(storedMnemonic).toBe(mnemonic);
  });

  it("should load existing mnemonic from storage", async () => {
    const mnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    await storage.setMnemonic(mnemonic);

    const client = await Client.builder().withSignerStorage(storage).build();

    expect(client.getMnemonic()).toBe(mnemonic);
  });

  it("should derive swap params and increment key index", async () => {
    const client = await Client.builder().withSignerStorage(storage).build();

    const params1 = await client.deriveSwapParams();
    expect(params1.keyIndex).toBe(0);

    const params2 = await client.deriveSwapParams();
    expect(params2.keyIndex).toBe(1);

    const keyIndex = await client.getKeyIndex();
    expect(keyIndex).toBe(2);
  });

  it("should derive swap params at specific index", async () => {
    const client = await Client.builder().withSignerStorage(storage).build();

    const params = client.deriveSwapParamsAtIndex(5);
    expect(params.keyIndex).toBe(5);

    // Should not affect stored key index
    const keyIndex = await client.getKeyIndex();
    expect(keyIndex).toBe(0);
  });

  it("should work without storage (stateless mode)", async () => {
    const client = await Client.builder().build();

    expect(client.getMnemonic().split(" ")).toHaveLength(12);
  });

  it("should get user ID xpub", async () => {
    const client = await Client.builder().withSignerStorage(storage).build();

    const xpub = client.getUserIdXpub();
    // Should be a base58-encoded extended public key starting with "xpub"
    expect(xpub).toMatch(
      /^xpub[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/,
    );
    expect(xpub).toHaveLength(111);
  });

  it("should set key index", async () => {
    const client = await Client.builder().withSignerStorage(storage).build();

    await client.setKeyIndex(10);

    const keyIndex = await client.getKeyIndex();
    expect(keyIndex).toBe(10);
  });

  it("should throw when setting key index without storage", async () => {
    const client = await Client.builder().build();

    await expect(client.setKeyIndex(10)).rejects.toThrow(
      "No signer storage configured",
    );
  });

  it("should throw on invalid mnemonic", async () => {
    await expect(
      Client.builder().withMnemonic("invalid mnemonic").build(),
    ).rejects.toThrow("Invalid mnemonic phrase");
  });

  it("should derive same params for same mnemonic", async () => {
    const mnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

    const client1 = await Client.builder().withMnemonic(mnemonic).build();
    const client2 = await Client.builder().withMnemonic(mnemonic).build();

    const params1 = client1.deriveSwapParamsAtIndex(0);
    const params2 = client2.deriveSwapParamsAtIndex(0);

    expect(params1.keyIndex).toBe(params2.keyIndex);
    expect(params1.preimage).toEqual(params2.preimage);
    expect(params1.preimageHash).toEqual(params2.preimageHash);
  });
});
