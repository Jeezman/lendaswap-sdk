/**
 * Get a quote for a swap.
 */

export async function getQuote(client, from, to, amount) {
    if (!from || !to || !amount) {
        console.error("Usage: node index.js quote <from> <to> <amount>");
        console.error("Example: node index.js quote btc_lightning usdc_pol 100000");
        process.exit(1);
    }

    const amountNum = parseInt(amount, 10);
    if (isNaN(amountNum)) {
        console.error("Error: amount must be a number (in satoshis for BTC sources)");
        process.exit(1);
    }

    console.log(`Getting quote: ${from} → ${to} (amount: ${amountNum})...\n`);

    try {
        const quote = await client.getQuote(from, to, amountNum);

        console.log("Quote Details:");
        console.log("-".repeat(40));
        console.log(`  From:           ${from}`);
        console.log(`  To:             ${to}`);
        console.log(`  Amount:         ${amountNum}`);
        console.log("-".repeat(40));
        console.log(`  Exchange Rate:  ${quote.exchangeRate}`);
        console.log(`  Network Fee:    ${quote.networkFee} sats`);
        console.log(`  Protocol Fee:   ${quote.protocolFee} sats`);
        console.log(`  Fee Rate:       ${(quote.protocolFeeRate * 100).toFixed(2)}%`);
        console.log("-".repeat(40));
        console.log(`  Min Amount:     ${quote.minAmount} sats`);
        console.log(`  Max Amount:     ${quote.maxAmount} sats`);
    } catch (error) {
        console.error(`Error getting quote: ${error.message}`);
        process.exit(1);
    }
}
