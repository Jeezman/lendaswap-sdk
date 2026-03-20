/**
 * USDT on Polygon → Lightning: end-to-end example (non-gasless).
 *
 * The user signs a Permit2 message with their browser wallet and
 * submits the funding transaction themselves.
 */

import {
  BTC_LIGHTNING,
  Client,
  encodeExecuteAndCreateWithPermit2,
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
const userWalletAddress = "0xYourPolygonAddress";
const polygonChainId = 137;

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
// 1. Get unsigned Permit2 funding parameters
const params = await client.getPermit2FundingParamsUnsigned(
  response.id,
  polygonChainId,
);

// 2. Sign the EIP-712 typed data with the user's wallet (e.g. wagmi/viem)
// const signature = await walletClient.signTypedData(params.typedData);
const signature = "0x..."; // placeholder — use walletClient.signTypedData(params.typedData)

// 3. Encode the executeAndCreateWithPermit2 transaction calldata
// biome-ignore lint/correctness/noUnusedVariables: example code
const { to, data } = encodeExecuteAndCreateWithPermit2(
  params.coordinatorAddress,
  {
    calls: params.calls,
    preimageHash: params.preimageHash,
    token: params.lockTokenAddress,
    claimAddress: params.claimAddress,
    timelock: params.timelock,
    depositor: userWalletAddress,
    sourceToken: params.sourceTokenAddress,
    sourceAmount: params.sourceAmount,
    nonce: params.nonce,
    deadline: params.deadline,
    signature,
  },
);

// 4. Submit two transactions:
//    a) One-time approve: source token → Permit2 (skip if already approved)
//    await walletClient.sendTransaction({
//      to: params.sourceTokenAddress,
//      data: encodeApproveCallData(PERMIT2_ADDRESS, MaxUint256),
//    });
//
//    b) Fund the swap via the coordinator
//    await walletClient.sendTransaction({ to, data });

// #endregion fund-swap

console.log("Funded!");

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
