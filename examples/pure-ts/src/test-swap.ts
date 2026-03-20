import "dotenv/config";
import {Client} from "@lendasat/lendaswap-sdk-pure";

async function main() {
  const client = await Client.builder()
    .withBaseUrl("http://localhost:3333")
    .build();
  
  console.log("Client baseUrl:", client.baseUrl);
  
  try {
    const result = await client.createLightningToEvmSwapGeneric({
      claimingAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      targetAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
      evmChainId: 137,
      tokenAddress: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
      amountIn: 10000,
    });
    console.log("Swap created:", result.response.id);
    console.log("Invoice:", result.response.bolt11_invoice);
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
