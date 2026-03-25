/**
 * Signer module for HD wallet key derivation.
 *
 * This module provides BIP39/BIP32 key derivation for Lendaswap swaps,
 * mirroring the Rust implementation in `client-sdk/core/src/hd_wallet.rs`.
 */

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { HDKey } from "@scure/bip32";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

/** BIP-85 prefix for signing keys. */
const SIGNING_PREFIX = 83696968;
/** Prefix for identity key derivation. */
const ID_PREFIX = 9419;
/** Lendaswap identifier ("LSW" encoded). */
const LSW_IDENTIFIER = 121923;
/** Tag for BIP340-style tagged hash preimage generation. */
const PREIMAGE_TAG = "lendaswap/preimage";
/** BIP44 coin type for Nostr (NIP-06). */
const NOSTR_COIN_TYPE = 1237;

/**
 * Parameters derived for a single swap.
 */
export interface SwapParams {
  /** The secret key (32 bytes) for signing. */
  secretKey: Uint8Array;
  /** The compressed public key (33 bytes). */
  publicKey: Uint8Array;
  /** The preimage (32 bytes) for the HTLC. */
  preimage: Uint8Array;
  /** The SHA256 hash of the preimage (32 bytes). */
  preimageHash: Uint8Array;
  /** The user ID public key (33 bytes) for swap recovery. */
  userId: Uint8Array;
  /** The key index used for derivation. */
  keyIndex: number;
}

/**
 * BIP340-style tagged hash function for domain separation.
 *
 * Computes: sha256(sha256(tag) || sha256(tag) || data).
 *
 * @param tag - The domain separation tag.
 * @param data - The data to hash.
 * @returns The tagged hash (32 bytes).
 */
function taggedHash(tag: string, data: Uint8Array): Uint8Array {
  const tagHash = sha256(new TextEncoder().encode(tag));
  const combined = new Uint8Array(tagHash.length * 2 + data.length);
  combined.set(tagHash, 0);
  combined.set(tagHash, tagHash.length);
  combined.set(data, tagHash.length * 2);
  return sha256(combined);
}

/**
 * HD Wallet Signer for Lendaswap key derivation.
 *
 * Provides BIP39/BIP32 key derivation matching the Rust `HdWallet` implementation.
 *
 * @example
 * ```ts
 * // Generate a new signer with a random mnemonic
 * const signer = Signer.generate();
 *
 * // Or restore from an existing mnemonic
 * const signer = Signer.fromMnemonic("your twelve word mnemonic phrase here ...");
 *
 * // Derive swap parameters at a specific index
 * const params = signer.deriveSwapParams(0);
 * ```
 */
export class Signer {
  readonly #mnemonic: string;
  readonly #seed: Uint8Array;

  private constructor(mnemonic: string) {
    this.#mnemonic = mnemonic;
    // No passphrase, matching Rust implementation
    this.#seed = bip39.mnemonicToSeedSync(mnemonic, "");
  }

  /**
   * Generate a new Signer with a random mnemonic.
   *
   * @param wordCount - Number of words (12, 15, 18, 21, or 24). Defaults to 12.
   * @returns A new Signer instance.
   * @throws Error if the word count is invalid.
   */
  static generate(wordCount: 12 | 15 | 18 | 21 | 24 = 12): Signer {
    const strength = (wordCount / 3) * 32; // 128, 160, 192, 224, or 256 bits
    const mnemonic = bip39.generateMnemonic(wordlist, strength);
    return new Signer(mnemonic);
  }

  /**
   * Create a Signer from an existing mnemonic phrase.
   *
   * @param phrase - The BIP39 mnemonic phrase (12, 15, 18, 21, or 24 words).
   * @returns A new Signer instance.
   * @throws Error if the mnemonic is invalid.
   */
  static fromMnemonic(phrase: string): Signer {
    const normalized = phrase.trim().toLowerCase();
    if (!bip39.validateMnemonic(normalized, wordlist)) {
      throw new Error("Invalid mnemonic phrase");
    }
    return new Signer(normalized);
  }

  /**
   * Get the mnemonic phrase.
   *
   * @returns The BIP39 mnemonic phrase.
   */
  get mnemonic(): string {
    return this.#mnemonic;
  }

  /**
   * Derive swap parameters at the given index.
   *
   * Derivation path: `m/{SIGNING_PREFIX}'/{LSW_IDENTIFIER}'/{index}'`
   *
   * @param index - The key index to derive.
   * @returns The derived swap parameters.
   */
  deriveSwapParams(index: number): SwapParams {
    const master = HDKey.fromMasterSeed(this.#seed);

    // Derive signing key: m/{SIGNING_PREFIX}'/{LSW_IDENTIFIER}'/{index}'
    const signingPath = `m/${SIGNING_PREFIX}'/${LSW_IDENTIFIER}'/${index}'`;
    const derived = master.derive(signingPath);

    if (!derived.privateKey || !derived.publicKey) {
      throw new Error("Failed to derive key");
    }

    const secretKey = derived.privateKey;
    const publicKey = derived.publicKey;

    // Generate preimage using tagged hash (BIP340-style)
    const preimage = taggedHash(PREIMAGE_TAG, secretKey);

    // preimageHash = SHA256(preimage)
    const preimageHash = sha256(preimage);

    // Derive user ID
    const userId = this.deriveUserId(index);

    return {
      secretKey,
      publicKey,
      preimage,
      preimageHash,
      userId,
      keyIndex: index,
    };
  }

  /**
   * Derive a user ID at the specified index.
   *
   * User IDs are derived using a non-hardened path, so that the corresponding
   * Xpub can be shared with the server for efficient recovery of swap data.
   *
   * @param index - The key index.
   * @returns The user ID public key (33 bytes).
   */
  private deriveUserId(index: number): Uint8Array {
    const xpub = this.deriveUserIdXpub();

    // Build non-hardened derivation path from the xpub
    const path = `m/${ID_PREFIX}/${LSW_IDENTIFIER}/${index}`;
    const derived = xpub.derive(path);

    if (!derived.publicKey) {
      throw new Error("Failed to derive user ID");
    }

    return derived.publicKey;
  }

  /**
   * Derive the Xpub used for user ID derivation.
   *
   * This Xpub is derived using a hardened path from the master key,
   * ensuring parent key safety even if individual derived keys are leaked.
   *
   * This Xpub can be shared with the server for wallet recovery.
   *
   * @returns The HDKey representing the user ID Xpub.
   */
  deriveUserIdXpub(): HDKey {
    const master = HDKey.fromMasterSeed(this.#seed);

    // Build hardened derivation path
    const path = `m/${ID_PREFIX}'/${LSW_IDENTIFIER}'/0'`;
    const derived = master.derive(path);

    // Return neutered key (Xpub only, no private key)
    return derived.wipePrivateData();
  }

  /**
   * Get the serialized user ID Xpub string.
   *
   * @returns The base58check-encoded extended public key (xpub...).
   */
  getUserIdXpubString(): string {
    const xpub = this.deriveUserIdXpub();
    // HDKey.publicExtendedKey returns the base58check-encoded xpub
    return xpub.publicExtendedKey;
  }

  /**
   * Derive a deterministic EVM signing key from the mnemonic.
   *
   * Unlike per-swap keys, this key is fixed for a given mnemonic,
   * allowing a single Permit2 approval to be reused across all swaps.
   * Uses the standard BIP-44 Ethereum path so the key is recoverable
   * with any standard wallet in emergency scenarios.
   *
   * Derivation path: `m/44'/60'/0'/0/0`
   *
   * @returns The 32-byte secret key for EVM signing.
   */
  deriveEvmKey(): { secretKey: Uint8Array } {
    const master = HDKey.fromMasterSeed(this.#seed);
    const path = "m/44'/60'/0'/0/0";
    const derived = master.derive(path);

    if (!derived.privateKey) {
      throw new Error("Failed to derive EVM key");
    }

    return { secretKey: derived.privateKey };
  }

  /**
   * Derive a deterministic Nostr private key from the mnemonic.
   *
   * Uses the NIP-06 derivation path: `m/44'/1237'/account'/0/0`
   * The same mnemonic always produces the same Nostr identity.
   *
   * @param account - The account index (default 0).
   * @returns The 32-byte private key as a hex string.
   */
  deriveNostrKeyHex(account = 0): string {
    const master = HDKey.fromMasterSeed(this.#seed);
    const path = `m/44'/${NOSTR_COIN_TYPE}'/${account}'/0/0`;
    const derived = master.derive(path);

    if (!derived.privateKey) {
      throw new Error("Failed to derive Nostr key");
    }

    return bytesToHex(derived.privateKey);
  }
}

// Re-export utility functions
export { bytesToHex, hexToBytes };
