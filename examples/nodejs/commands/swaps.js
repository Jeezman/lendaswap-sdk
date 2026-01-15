/**
 * List stored swaps with transaction details.
 */

import { printSwapSummary } from "../utils/print-swap-details.js";

export async function listSwaps(client) {
    console.log("Fetching stored swaps...\n");
    const storedSwaps = await client.listAll();

    if (storedSwaps.length === 0) {
        console.log("No swaps found.");
        return;
    }

    // Refresh each swap from the API to get latest state
    const swaps = [];
    for (const stored of storedSwaps) {
        const response = stored.btcToEvmResponse || stored.evmToBtcResponse || stored.btcToArkadeResponse;
        if (response) {
            try {
                const refreshed = await client.getSwap(response.id);
                swaps.push(refreshed);
            } catch {
                // If refresh fails, use stored data
                swaps.push(stored);
            }
        }
    }

    console.log("Stored Swaps:");
    for (const swap of swaps) {
        printSwapSummary(swap);
    }
    console.log(`\nTotal: ${swaps.length} swaps`);
}
