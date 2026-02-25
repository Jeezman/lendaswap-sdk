/**
 * Derive the EVM address from a stored swap's secretKey.
 * Outputs just the address to stdout (for scripting).
 */

import type {SwapStorage} from "@lendasat/lendaswap-sdk-pure";
import {deriveEvmAddress} from "@lendasat/lendaswap-sdk-pure";

export async function deriveSwapEvmAddress(
  swapStorage: SwapStorage | undefined,
  swapId: string | undefined,
): Promise<void> {
  if (!swapId) {
    console.error("Usage: tsx src/index.ts derive-evm-address <swap-id>");
    process.exit(1);
  }

  if (!swapStorage) {
    console.error("Error: Swap storage is required.");
    process.exit(1);
  }

  const stored = await swapStorage.get(swapId);
  if (!stored) {
    console.error(`Error: Swap ${swapId} not found in local storage.`);
    process.exit(1);
  }

  const address = deriveEvmAddress(stored.secretKey);
  console.log(address);
}
