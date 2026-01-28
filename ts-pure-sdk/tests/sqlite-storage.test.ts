import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { GetSwapResponse } from "../src/api/client.js";
import { type StoredSwap, SWAP_STORAGE_VERSION } from "../src/storage/index.js";
import {
  SqliteSwapStorage,
  SqliteWalletStorage,
  sqliteStorageFactory,
} from "../src/storage/sqlite.js";

describe("SqliteWalletStorage", () => {
  let storage: SqliteWalletStorage;

  beforeEach(() => {
    // Use in-memory database for tests
    storage = new SqliteWalletStorage(":memory:");
  });

  afterEach(() => {
    storage.close();
  });

  it("should return null for mnemonic when not set", async () => {
    const mnemonic = await storage.getMnemonic();
    expect(mnemonic).toBeNull();
  });

  it("should store and retrieve mnemonic", async () => {
    const testMnemonic = "test mnemonic phrase";
    await storage.setMnemonic(testMnemonic);
    const retrieved = await storage.getMnemonic();
    expect(retrieved).toBe(testMnemonic);
  });

  it("should return 0 for key index when not set", async () => {
    const keyIndex = await storage.getKeyIndex();
    expect(keyIndex).toBe(0);
  });

  it("should store and retrieve key index", async () => {
    await storage.setKeyIndex(5);
    const retrieved = await storage.getKeyIndex();
    expect(retrieved).toBe(5);
  });

  it("should increment key index", async () => {
    const first = await storage.incrementKeyIndex();
    expect(first).toBe(0);

    const second = await storage.incrementKeyIndex();
    expect(second).toBe(1);

    const keyIndex = await storage.getKeyIndex();
    expect(keyIndex).toBe(2);
  });

  it("should clear all data", async () => {
    await storage.setMnemonic("test mnemonic");
    await storage.setKeyIndex(10);

    await storage.clear();

    expect(await storage.getMnemonic()).toBeNull();
    expect(await storage.getKeyIndex()).toBe(0);
  });
});

describe("SqliteSwapStorage", () => {
  let storage: SqliteSwapStorage;

  const createTestSwap = (id: string): StoredSwap => ({
    version: SWAP_STORAGE_VERSION,
    swapId: id,
    keyIndex: 0,
    response: {
      id,
      status: "pending",
      direction: "btc_to_evm",
    } as GetSwapResponse,
    publicKey: "02abc",
    preimage: "preimage123",
    preimageHash: "hash123",
    secretKey: "secret123",
    storedAt: Date.now(),
    updatedAt: Date.now(),
  });

  beforeEach(() => {
    storage = new SqliteSwapStorage(":memory:");
  });

  afterEach(() => {
    storage.close();
  });

  it("should return null for non-existent swap", async () => {
    const swap = await storage.get("non-existent");
    expect(swap).toBeNull();
  });

  it("should store and retrieve swap", async () => {
    const testSwap = createTestSwap("swap-1");
    await storage.store(testSwap);

    const retrieved = await storage.get("swap-1");
    expect(retrieved).toEqual(testSwap);
  });

  it("should update swap response", async () => {
    const testSwap = createTestSwap("swap-1");
    await storage.store(testSwap);

    const newResponse = {
      ...testSwap.response,
      status: "serverredeemed",
    } as GetSwapResponse;

    await storage.update("swap-1", newResponse);

    const retrieved = await storage.get("swap-1");
    expect(retrieved?.response.status).toBe("serverredeemed");
    expect(retrieved?.updatedAt).toBeGreaterThanOrEqual(testSwap.updatedAt);
  });

  it("should delete swap", async () => {
    const testSwap = createTestSwap("swap-1");
    await storage.store(testSwap);

    await storage.delete("swap-1");

    const retrieved = await storage.get("swap-1");
    expect(retrieved).toBeNull();
  });

  it("should list all swap IDs", async () => {
    await storage.store(createTestSwap("swap-1"));
    await storage.store(createTestSwap("swap-2"));
    await storage.store(createTestSwap("swap-3"));

    const ids = await storage.list();
    expect(ids).toHaveLength(3);
    expect(ids).toContain("swap-1");
    expect(ids).toContain("swap-2");
    expect(ids).toContain("swap-3");
  });

  it("should get all swaps", async () => {
    await storage.store(createTestSwap("swap-1"));
    await storage.store(createTestSwap("swap-2"));

    const swaps = await storage.getAll();
    expect(swaps).toHaveLength(2);
  });

  it("should clear all swaps", async () => {
    await storage.store(createTestSwap("swap-1"));
    await storage.store(createTestSwap("swap-2"));

    await storage.clear();

    const swaps = await storage.getAll();
    expect(swaps).toHaveLength(0);
  });

  it("should replace existing swap on store", async () => {
    const testSwap = createTestSwap("swap-1");
    await storage.store(testSwap);

    const updatedSwap = { ...testSwap, keyIndex: 5 };
    await storage.store(updatedSwap);

    const retrieved = await storage.get("swap-1");
    expect(retrieved?.keyIndex).toBe(5);
  });
});

describe("sqliteStorageFactory", () => {
  it("should create wallet and swap storage with shared path", () => {
    const { walletStorage, swapStorage, close } =
      sqliteStorageFactory(":memory:");

    expect(walletStorage).toBeInstanceOf(SqliteWalletStorage);
    expect(swapStorage).toBeInstanceOf(SqliteSwapStorage);

    close();
  });

  it("should work independently", async () => {
    const { walletStorage, swapStorage, close } =
      sqliteStorageFactory(":memory:");

    await walletStorage.setMnemonic("test");
    await swapStorage.store({
      version: SWAP_STORAGE_VERSION,
      swapId: "test-swap",
      keyIndex: 0,
      response: { id: "test-swap", direction: "btc_to_evm" } as GetSwapResponse,
      publicKey: "pk",
      preimage: "pre",
      preimageHash: "hash",
      secretKey: "sk",
      storedAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(await walletStorage.getMnemonic()).toBe("test");
    expect(await swapStorage.get("test-swap")).not.toBeNull();

    close();
  });
});
