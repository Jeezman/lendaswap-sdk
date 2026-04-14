import { HDKey } from "@scure/bip32";
import * as bip39 from "@scure/bip39";
import { describe, expect, it } from "vitest";
import { bytesToHex, Signer } from "../src/index.js";

const TEST_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

function xprvFromMnemonic(mnemonic: string): string {
  const seed = bip39.mnemonicToSeedSync(mnemonic, "");
  return HDKey.fromMasterSeed(seed).privateExtendedKey;
}

describe("Signer", () => {
  describe("generate", () => {
    it("should generate a signer with 12 words by default", () => {
      const signer = Signer.generate();
      const words = signer.mnemonic?.split(" ");
      expect(words).toHaveLength(12);
    });

    it("should generate a signer with 24 words when specified", () => {
      const signer = Signer.generate(24);
      const words = signer.mnemonic?.split(" ");
      expect(words).toHaveLength(24);
    });

    it("should generate different mnemonics each time", () => {
      const signer1 = Signer.generate();
      const signer2 = Signer.generate();
      expect(signer1.mnemonic).not.toBe(signer2.mnemonic);
    });
  });

  describe("fromMnemonic", () => {
    it("should create a signer from a valid mnemonic", () => {
      const mnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      const signer = Signer.fromMnemonic(mnemonic);
      expect(signer.mnemonic).toBe(mnemonic);
    });

    it("should normalize mnemonic (trim and lowercase)", () => {
      const mnemonic =
        "  ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABANDON ABOUT  ";
      const signer = Signer.fromMnemonic(mnemonic);
      expect(signer.mnemonic).toBe(
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      );
    });

    it("should throw on invalid mnemonic", () => {
      expect(() => Signer.fromMnemonic("invalid mnemonic phrase")).toThrow(
        "Invalid mnemonic phrase",
      );
    });
  });

  describe("deriveSwapParams", () => {
    const mnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

    it("should derive swap parameters at index 0", () => {
      const signer = Signer.fromMnemonic(mnemonic);
      const params = signer.deriveSwapParams(0);

      expect(params.secretKey).toHaveLength(32);
      expect(params.publicKey).toHaveLength(33);
      expect(params.preimage).toHaveLength(32);
      expect(params.preimageHash).toHaveLength(32);
      expect(params.userId).toHaveLength(33);
      expect(params.keyIndex).toBe(0);
    });

    it("should derive different parameters for different indices", () => {
      const signer = Signer.fromMnemonic(mnemonic);
      const params0 = signer.deriveSwapParams(0);
      const params1 = signer.deriveSwapParams(1);

      expect(bytesToHex(params0.secretKey)).not.toBe(
        bytesToHex(params1.secretKey),
      );
      expect(bytesToHex(params0.publicKey)).not.toBe(
        bytesToHex(params1.publicKey),
      );
      expect(bytesToHex(params0.preimage)).not.toBe(
        bytesToHex(params1.preimage),
      );
      expect(bytesToHex(params0.preimageHash)).not.toBe(
        bytesToHex(params1.preimageHash),
      );
    });

    it("should derive same parameters for same index", () => {
      const signer = Signer.fromMnemonic(mnemonic);
      const params1 = signer.deriveSwapParams(0);
      const params2 = signer.deriveSwapParams(0);

      expect(bytesToHex(params1.secretKey)).toBe(bytesToHex(params2.secretKey));
      expect(bytesToHex(params1.publicKey)).toBe(bytesToHex(params2.publicKey));
      expect(bytesToHex(params1.preimage)).toBe(bytesToHex(params2.preimage));
      expect(bytesToHex(params1.preimageHash)).toBe(
        bytesToHex(params2.preimageHash),
      );
    });

    it("should derive same parameters from same mnemonic", () => {
      const signer1 = Signer.fromMnemonic(mnemonic);
      const signer2 = Signer.fromMnemonic(mnemonic);

      const params1 = signer1.deriveSwapParams(0);
      const params2 = signer2.deriveSwapParams(0);

      expect(bytesToHex(params1.secretKey)).toBe(bytesToHex(params2.secretKey));
      expect(bytesToHex(params1.preimage)).toBe(bytesToHex(params2.preimage));
    });
  });

  describe("fromXprv", () => {
    it("should derive the same swap params as the source mnemonic", () => {
      const fromMnemonic = Signer.fromMnemonic(TEST_MNEMONIC);
      const fromXprv = Signer.fromXprv(xprvFromMnemonic(TEST_MNEMONIC));

      const a = fromMnemonic.deriveSwapParams(0);
      const b = fromXprv.deriveSwapParams(0);

      expect(bytesToHex(a.secretKey)).toBe(bytesToHex(b.secretKey));
      expect(bytesToHex(a.publicKey)).toBe(bytesToHex(b.publicKey));
      expect(bytesToHex(a.preimage)).toBe(bytesToHex(b.preimage));
      expect(bytesToHex(a.preimageHash)).toBe(bytesToHex(b.preimageHash));
      expect(bytesToHex(a.userId)).toBe(bytesToHex(b.userId));
    });

    it("should derive the same EVM and Nostr keys as the source mnemonic", () => {
      const fromMnemonic = Signer.fromMnemonic(TEST_MNEMONIC);
      const fromXprv = Signer.fromXprv(xprvFromMnemonic(TEST_MNEMONIC));

      expect(bytesToHex(fromMnemonic.deriveEvmKey().secretKey)).toBe(
        bytesToHex(fromXprv.deriveEvmKey().secretKey),
      );
      expect(fromMnemonic.deriveNostrKeyHex()).toBe(
        fromXprv.deriveNostrKeyHex(),
      );
      expect(fromMnemonic.getUserIdXpubString()).toBe(
        fromXprv.getUserIdXpubString(),
      );
    });

    it("should expose undefined mnemonic for xprv-based signers", () => {
      const signer = Signer.fromXprv(xprvFromMnemonic(TEST_MNEMONIC));
      expect(signer.mnemonic).toBeUndefined();
    });

    it("should accept whitespace around the xprv string", () => {
      const xprv = xprvFromMnemonic(TEST_MNEMONIC);
      expect(() => Signer.fromXprv(`  ${xprv}\n`)).not.toThrow();
    });

    it("should throw on a malformed xprv", () => {
      expect(() => Signer.fromXprv("not-an-xprv")).toThrow(/Invalid xprv/);
    });

    it("should reject an xpub (public-only extended key)", () => {
      const seed = bip39.mnemonicToSeedSync(TEST_MNEMONIC, "");
      const xpub = HDKey.fromMasterSeed(seed).publicExtendedKey;
      expect(() => Signer.fromXprv(xpub)).toThrow(/xprv required/);
    });
  });

  describe("getUserIdXpubString", () => {
    it("should return a base58-encoded xpub", () => {
      const mnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      const signer = Signer.fromMnemonic(mnemonic);
      const xpub = signer.getUserIdXpubString();

      // Should be a base58-encoded extended public key starting with "xpub"
      expect(xpub).toMatch(
        /^xpub[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/,
      );
      expect(xpub).toHaveLength(111); // Standard xpub length
    });

    it("should return same xpub for same mnemonic", () => {
      const mnemonic =
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
      const signer1 = Signer.fromMnemonic(mnemonic);
      const signer2 = Signer.fromMnemonic(mnemonic);

      expect(signer1.getUserIdXpubString()).toBe(signer2.getUserIdXpubString());
    });
  });
});
