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

  // sign returns a RecoveredSignature object
  const sigBytes = secp256k1.sign(digestBytes, keyBytes, { prehash: false });
  const sigObj = secp256k1.Signature.fromBytes(sigBytes);

  const r = sigObj.r.toString(16).padStart(64, "0");
  const s = sigObj.s.toString(16).padStart(64, "0");

  // Determine recovery bit by trying both values against the known public key
  const pubkey = secp256k1.getPublicKey(keyBytes, false);
  let recoveryBit = 0;
  for (let bit = 0; bit < 2; bit++) {
    try {
      const recovered = sigObj
        .addRecoveryBit(bit)
        .recoverPublicKey(digestBytes);
      if (arraysEqual(recovered.toBytes(false), pubkey)) {
        recoveryBit = bit;
        break;
      }
    } catch {
      // Try the other bit
    }
  }

  return { v: recoveryBit + 27, r: `0x${r}`, s: `0x${s}` };
}

function arraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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
