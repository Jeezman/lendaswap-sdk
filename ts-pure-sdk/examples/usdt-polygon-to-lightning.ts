/**
 * USDT on Polygon → Lightning: end-to-end example (non-gasless).
 *
 * The user signs a Permit2 message with their browser wallet and
 * submits the funding transaction themselves via `fundSwap`.
 */

import {
  BTC_LIGHTNING,
  Client,
  type EvmSigner,
  InMemorySwapStorage,
  InMemoryWalletStorage,
  type TokenInfo,
} from "../src";

const BTC_LIGHTNING_INFO: TokenInfo = {
  token_id: BTC_LIGHTNING,
  symbol: "BTC",
  name: "Bitcoin (Lightning)",
  decimals: 8,
  chain: "Lightning",
};

// #region evm-to-lightning-setup
const client = await Client.builder()
  .withSignerStorage(new InMemoryWalletStorage())
  .withSwapStorage(new InMemorySwapStorage())
  .withApiKey(process.env.API_KEY || "")
  .build();
// #endregion evm-to-lightning-setup

const lightningInvoice = "lnbc1m1p..."; // Your BOLT11 invoice

// #region find-source-token
const tokens = await client.getTokens();
const usdtPolygon = tokens.evm_tokens.find(
  (t) => t.symbol === "USDT" && t.chain === "137",
);
// #endregion find-source-token

if (!usdtPolygon) throw new Error("USDT on Polygon not found");

// #region create-swap
const result = await client.createSwap({
  sourceAsset: usdtPolygon,
  targetAsset: BTC_LIGHTNING_INFO,
  targetAddress: lightningInvoice,
});

const { response } = result;
// #endregion create-swap

if (!("evm_htlc_address" in response)) {
  throw new Error("Expected EVM-to-Lightning swap response");
}

console.log("Swap ID:", response.id);
// ... "550e8400-e29b-41d4-a716-446655440000"
console.log("Source amount:", response.source_amount, usdtPolygon.symbol);

// #region fund-swap
// Build an EvmSigner from your wallet (wagmi/viem example):
//
// import { createPublicClient, http } from "viem";
// const publicClient = createPublicClient({ chain, transport: http() });
// const signer: EvmSigner = {
//   address: walletClient.account.address,
//   chainId: chain.id,
//   signTypedData: (td) => walletClient.signTypedData({ ...td, account: walletClient.account }),
//   sendTransaction: (tx) => walletClient.sendTransaction({ to: tx.to, data: tx.data, chain, gas: tx.gas }),
//   getTransactionReceipt: (h) => publicClient.getTransactionReceipt({ hash: h }).then((r) => ({ status: r.status, blockNumber: r.blockNumber, transactionHash: r.transactionHash })),
//   getTransaction: (h) => publicClient.getTransaction({ hash: h }).then((tx) => ({ to: tx.to ?? null, input: tx.input, from: tx.from })),
//   call: (tx) => publicClient.call({ to: tx.to, data: tx.data, account: tx.from, blockNumber: tx.blockNumber }).then((r) => r.data ?? "0x"),
// };

declare const signer: EvmSigner; // your wallet — see EvmSigner docs

// fundSwap handles everything: allowance check, ERC-20 approval,
// Permit2 EIP-712 signing, and transaction submission.
const { txHash } = await client.fundSwap(response.id, signer);
console.log("Funded! TX:", txHash);
// #endregion fund-swap

// #region poll-status
let swap = await client.getSwap(response.id);
while (swap.status !== "serverfunded" && swap.status !== "expired") {
  await new Promise((r) => setTimeout(r, 3000));
  swap = await client.getSwap(response.id);
  console.log("Status:", swap.status);
  // ... "pending" → "clientfunded" → "serverfunded"
}
// #endregion poll-status

if (swap.status === "expired") {
  throw new Error("Swap expired — deposit was not completed in time.");
}

// #region verify-complete
const finalSwap = await client.getSwap(response.id);
console.log("Final status:", finalSwap.status);
// ... "clientredeemed"
console.log("Source:", finalSwap.source_amount, usdtPolygon.symbol);
console.log("Target:", finalSwap.target_amount, "sats");
// ... "Target: 100000 sats"
// #endregion verify-complete
