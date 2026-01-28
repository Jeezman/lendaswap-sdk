import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemorySwapStorage,
  InMemoryWalletStorage,
  inMemoryStorageFactory,
} from "../src/index.js";

describe("InMemoryWalletStorage", () => {
  let storage: InMemoryWalletStorage;

  beforeEach(() => {
    storage = new InMemoryWalletStorage();
  });

  describe("mnemonic", () => {
    it("should return null when no mnemonic is set", async () => {
      const mnemonic = await storage.getMnemonic();
      expect(mnemonic).toBeNull();
    });

    it("should store and retrieve mnemonic", async () => {
      const testMnemonic = "test mnemonic phrase";
      await storage.setMnemonic(testMnemonic);
      const retrieved = await storage.getMnemonic();
      expect(retrieved).toBe(testMnemonic);
    });

    it("should overwrite existing mnemonic", async () => {
      await storage.setMnemonic("first mnemonic");
      await storage.setMnemonic("second mnemonic");
      const retrieved = await storage.getMnemonic();
      expect(retrieved).toBe("second mnemonic");
    });
  });

  describe("keyIndex", () => {
    it("should return 0 when no key index is set", async () => {
      const index = await storage.getKeyIndex();
      expect(index).toBe(0);
    });

    it("should store and retrieve key index", async () => {
      await storage.setKeyIndex(42);
      const index = await storage.getKeyIndex();
      expect(index).toBe(42);
    });

    it("should increment key index", async () => {
      await storage.setKeyIndex(5);
      const beforeIncrement = await storage.incrementKeyIndex();
      expect(beforeIncrement).toBe(5);

      const afterIncrement = await storage.getKeyIndex();
      expect(afterIncrement).toBe(6);
    });

    it("should increment from 0 when not set", async () => {
      const index = await storage.incrementKeyIndex();
      expect(index).toBe(0);

      const newIndex = await storage.getKeyIndex();
      expect(newIndex).toBe(1);
    });
  });

  describe("clear", () => {
    it("should clear all data", async () => {
      await storage.setMnemonic("test mnemonic");
      await storage.setKeyIndex(10);

      await storage.clear();

      expect(await storage.getMnemonic()).toBeNull();
      expect(await storage.getKeyIndex()).toBe(0);
    });
  });
});

describe("InMemorySwapStorage", () => {
  interface TestSwap {
    id: string;
    amount: number;
  }

  let storage: InMemorySwapStorage<TestSwap>;

  beforeEach(() => {
    storage = new InMemorySwapStorage<TestSwap>();
  });

  describe("get/store", () => {
    it("should return null for non-existent swap", async () => {
      const swap = await storage.get("non-existent");
      expect(swap).toBeNull();
    });

    it("should store and retrieve swap", async () => {
      const testSwap: TestSwap = { id: "swap-1", amount: 100 };
      await storage.store("swap-1", testSwap);

      const retrieved = await storage.get("swap-1");
      expect(retrieved).toEqual(testSwap);
    });

    it("should overwrite existing swap", async () => {
      await storage.store("swap-1", { id: "swap-1", amount: 100 });
      await storage.store("swap-1", { id: "swap-1", amount: 200 });

      const retrieved = await storage.get("swap-1");
      expect(retrieved?.amount).toBe(200);
    });
  });

  describe("delete", () => {
    it("should delete existing swap", async () => {
      await storage.store("swap-1", { id: "swap-1", amount: 100 });
      await storage.delete("swap-1");

      const retrieved = await storage.get("swap-1");
      expect(retrieved).toBeNull();
    });

    it("should not throw when deleting non-existent swap", async () => {
      await expect(storage.delete("non-existent")).resolves.not.toThrow();
    });
  });

  describe("list", () => {
    it("should return empty array when no swaps", async () => {
      const list = await storage.list();
      expect(list).toEqual([]);
    });

    it("should return all swap IDs", async () => {
      await storage.store("swap-1", { id: "swap-1", amount: 100 });
      await storage.store("swap-2", { id: "swap-2", amount: 200 });
      await storage.store("swap-3", { id: "swap-3", amount: 300 });

      const list = await storage.list();
      expect(list).toHaveLength(3);
      expect(list).toContain("swap-1");
      expect(list).toContain("swap-2");
      expect(list).toContain("swap-3");
    });
  });

  describe("getAll", () => {
    it("should return empty array when no swaps", async () => {
      const all = await storage.getAll();
      expect(all).toEqual([]);
    });

    it("should return all swaps", async () => {
      await storage.store("swap-1", { id: "swap-1", amount: 100 });
      await storage.store("swap-2", { id: "swap-2", amount: 200 });

      const all = await storage.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContainEqual({ id: "swap-1", amount: 100 });
      expect(all).toContainEqual({ id: "swap-2", amount: 200 });
    });
  });

  describe("clear", () => {
    it("should clear all swaps", async () => {
      await storage.store("swap-1", { id: "swap-1", amount: 100 });
      await storage.store("swap-2", { id: "swap-2", amount: 200 });

      await storage.clear();

      expect(await storage.list()).toEqual([]);
      expect(await storage.getAll()).toEqual([]);
    });
  });
});

describe("inMemoryStorageFactory", () => {
  it("should create wallet storage", () => {
    const walletStorage = inMemoryStorageFactory.createWalletStorage();
    expect(walletStorage).toBeInstanceOf(InMemoryWalletStorage);
  });

  it("should create swap storage", () => {
    const swapStorage = inMemoryStorageFactory.createSwapStorage<{
      test: string;
    }>();
    expect(swapStorage).toBeInstanceOf(InMemorySwapStorage);
  });
});
