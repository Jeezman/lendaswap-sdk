/**
 * List available trading pairs.
 */

export async function listPairs(client) {
    console.log("Fetching available trading pairs...\n");
    const pairs = await client.getAssetPairs();

    console.log("Available Trading Pairs:");
    console.log("-".repeat(50));
    for (const pair of pairs) {
        console.log(`  ${pair.source.symbol.padEnd(12)} → ${pair.target.symbol.padEnd(12)} (${pair.source.tokenId} → ${pair.target.tokenId})`);
    }
    console.log("-".repeat(50));
    console.log(`Total: ${pairs.length} pairs`);
}
