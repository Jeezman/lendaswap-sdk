/**
 * EVM key derivation and signing utilities.
 *
 * Derives EVM addresses and signs EIP-712 digests using secp256k1 keys
 * from the SDK's HD wallet — no external wallet or signer required.
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";

/**
 * Derives an EVM address from a secp256k1 private key.
 *
 * The address is computed as the last 20 bytes of keccak256(uncompressed_pubkey).
 *
 * @param secretKey - 32-byte private key (Uint8Array or hex string)
 * @returns EVM address as a checksummed hex string with 0x prefix
 */
export function deriveEvmAddress(secretKey: Uint8Array | string): string {
  const keyBytes =
    typeof secretKey === "string"
      ? hexToBytes(secretKey.replace(/^0x/, ""))
      : secretKey;

  // Get uncompressed public key (65 bytes: 0x04 || x || y)
  const uncompressedPubkey = secp256k1.getPublicKey(keyBytes, false);

  // Keccak256 of the 64-byte public key (drop the 0x04 prefix)
  const hash = keccak_256(uncompressedPubkey.slice(1));

  // Take last 20 bytes as address
  const addressBytes = hash.slice(12);
  const addressHex = bytesToHex(addressBytes);

  return toChecksumAddress(addressHex);
}

/**
 * Signs an EIP-712 digest with a secp256k1 private key.
 *
 * Returns the signature components (v, r, s) needed for EVM contract calls.
 *
 * @param secretKey - 32-byte private key (Uint8Array or hex string)
 * @param digest - 32-byte digest hex string (with or without 0x prefix)
 * @returns Signature components { v, r, s }
 */
export function signEvmDigest(
  secretKey: Uint8Array | string,
  digest: string,
): { v: number; r: string; s: string } {
  const keyBytes =
    typeof secretKey === "string"
      ? hexToBytes(secretKey.replace(/^0x/, ""))
      : secretKey;

  const digestBytes = hexToBytes(digest.replace(/^0x/, ""));

  // @noble/curves v2 returns raw Uint8Array from sign().
  // Use format: 'recovered' to get 65 bytes: [recovery_byte, r(32), s(32)].
  const sig = secp256k1.sign(digestBytes, keyBytes, {
    prehash: false,
    format: "recovered",
  });

  const recovery = sig[0];
  const r = bytesToHex(sig.slice(1, 33));
  const s = bytesToHex(sig.slice(33, 65));
  const v = (recovery ?? 0) + 27;

  return { v, r: `0x${r}`, s: `0x${s}` };
}

/**
 * Converts an address to EIP-55 checksummed format.
 */
function toChecksumAddress(address: string): string {
  const clean = address.replace(/^0x/, "").toLowerCase();
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(clean)));

  let checksummed = "0x";
  for (let i = 0; i < 40; i++) {
    checksummed +=
      parseInt(hash[i], 16) >= 8 ? clean[i].toUpperCase() : clean[i];
  }
  return checksummed;
}
