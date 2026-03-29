import { describe, expect, it } from "vitest";
import { buildRedeemDigest } from "../src/evm/coordinator.js";
import { signEvmDigest } from "../src/evm/signing.js";

/**
 * Reproduces the EIP-712 signature mismatch from swap e679620c-f9cb-4ab7-88ea-f20e1b5d1c8f.
 *
 * On Ethereum/Arbitrum the BTC-pegged token (tBTC) has 18 decimals, so
 * evm_expected_sats is stored in tBTC units (sats × 10^10). Even small
 * swaps produce values above Number.MAX_SAFE_INTEGER (2^53 - 1), which
 * JSON.parse silently rounds.
 *
 * Error: "EIP-712 signature mismatch: recovered signer 0xeD0c5ACc...
 *         but expected client address 0x9D7407CF..."
 */
describe("EIP-712 precision loss on large evm_expected_sats", () => {
  const TEST_SECRET_KEY = new Uint8Array(32).fill(0xab);

  // Exact server JSON for the failed swap (evm_expected_sats as a number, not a string)
  const SERVER_JSON = `{
    "evm_chain_id": 1,
    "evm_htlc_address": "0x5317dccd55DDe04d5F7Ba2e34fE8B1B214F1e022",
    "evm_coordinator_address": "0x57Ef7025F9f6F135e8338e18EB3027acB9D4785C",
    "evm_expected_sats": 9949426433915211,
    "wbtc_address": "0x18084fbA666a33d37592fA2633fD49a74DD93a88",
    "server_evm_address": "0x5ce278AAec6d9fa67bFcaF98512fE5175dFEebac",
    "target_evm_address": "0x72cf2114CB5aFaE7D058F9Df75962E79cd44dB85",
    "target_token_address": "0xdac17f958d2ee523a2206206994597c13d831ec7",
    "evm_refund_locktime": 1774793591,
    "claim_calls_hash": "0x4fc7ceab20b2ee1133ae071804d6a8eb9ff883b785cfa245b00e9a4bd32226e9"
  }`;

  // The exact amount the server has in its DB (Rust i64, no precision loss)
  const SERVER_EXACT_AMOUNT = BigInt("9949426433915211");

  function buildServerDigest() {
    return buildRedeemDigest({
      htlcAddress: "0x5317dccd55DDe04d5F7Ba2e34fE8B1B214F1e022",
      chainId: 1,
      preimage:
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      amount: SERVER_EXACT_AMOUNT,
      token: "0x18084fbA666a33d37592fA2633fD49a74DD93a88",
      sender: "0x5ce278AAec6d9fa67bFcaF98512fE5175dFEebac",
      timelock: 1774793591,
      caller: "0x57Ef7025F9f6F135e8338e18EB3027acB9D4785C",
      destination: "0x72cf2114CB5aFaE7D058F9Df75962E79cd44dB85",
      sweepToken: "0xdac17f958d2ee523a2206206994597c13d831ec7",
      minAmountOut: 0n,
      callsHash:
        "0x4fc7ceab20b2ee1133ae071804d6a8eb9ff883b785cfa245b00e9a4bd32226e9",
    });
  }

  /**
   * Simulates exactly what the client does in gasless.ts:
   *   const amount = BigInt(swap.evm_expected_sats);
   * where swap comes from JSON.parse of the server response.
   */
  function buildClientDigestFromJson(json: string) {
    const swap = JSON.parse(json);
    // This is the exact line from gasless.ts:65
    const amount = BigInt(swap.evm_expected_sats);

    return buildRedeemDigest({
      htlcAddress: swap.evm_htlc_address,
      chainId: swap.evm_chain_id,
      preimage:
        "0x0000000000000000000000000000000000000000000000000000000000000001",
      amount,
      token: swap.wbtc_address,
      sender: swap.server_evm_address,
      timelock: swap.evm_refund_locktime,
      caller: swap.evm_coordinator_address,
      destination: swap.target_evm_address,
      sweepToken: swap.target_token_address,
      minAmountOut: 0n,
      callsHash: swap.claim_calls_hash,
    });
  }

  it("client digest must match server digest for gasless claim to succeed", () => {
    const clientDigest = buildClientDigestFromJson(SERVER_JSON);
    const serverDigest = buildServerDigest();

    // This is what the server checks — if these differ, ecrecover yields a wrong address
    expect(clientDigest).toBe(serverDigest);
  });

  it("client signature on server digest must recover to the correct address", () => {
    const clientDigest = buildClientDigestFromJson(SERVER_JSON);
    const serverDigest = buildServerDigest();

    // Client signs its digest
    const clientSig = signEvmDigest(TEST_SECRET_KEY, clientDigest);
    // Server would verify against its digest — signatures must be identical
    const serverSig = signEvmDigest(TEST_SECRET_KEY, serverDigest);

    expect(clientSig.v).toBe(serverSig.v);
    expect(clientSig.r).toBe(serverSig.r);
    expect(clientSig.s).toBe(serverSig.s);
  });
});
