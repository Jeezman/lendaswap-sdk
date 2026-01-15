/**
 * List available tokens.
 */

export async function listTokens(client) {
    console.log("Fetching available tokens...\n");
    const tokens = await client.getTokens();

    console.log("Available Tokens:");
    console.log("-".repeat(60));
    console.log("  Token ID".padEnd(20) + "Symbol".padEnd(10) + "Chain".padEnd(12) + "Name");
    console.log("-".repeat(60));
    for (const token of tokens) {
        console.log(`  ${token.tokenId.padEnd(18)} ${token.symbol.padEnd(10)} ${token.chain.padEnd(12)} ${token.name}`);
    }
    console.log("-".repeat(60));
    console.log(`Total: ${tokens.length} tokens`);
}
