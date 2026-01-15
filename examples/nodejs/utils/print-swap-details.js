/**
 * Utility for printing swap details with transaction IDs and block explorer links.
 */

/**
 * Print transaction details for a swap with block explorer links.
 * @param {object} swapData - The swap data object containing response
 * @param {boolean} compact - If true, print in compact format (for list view)
 */
export function printSwapDetails(swapData, compact = false) {
    const indent = compact ? "      " : "  ";

    if (swapData.btcToEvmResponse) {
        printBtcToEvmDetails(swapData.btcToEvmResponse, indent, compact);
    } else if (swapData.evmToBtcResponse) {
        printEvmToBtcDetails(swapData.evmToBtcResponse, indent, compact);
    } else if (swapData.btcToArkadeResponse) {
        printBtcToArkadeDetails(swapData.btcToArkadeResponse, indent, compact);
    }
}

/**
 * Print BTC to EVM swap transaction details.
 */
function printBtcToEvmDetails(r, indent, compact) {
    if (compact) {
        printCompactTxIds(r, indent, "btcToEvm");
    } else {
        if (r.bitcoinHtlcFundTxid) {
            console.log(`${indent}Client Funded (Arkade):`);
            console.log(`${indent}  https://arkade.space/tx/${r.bitcoinHtlcFundTxid}`);
        }
        if (r.evmHtlcFundTxid) {
            console.log(`${indent}Server Funded (Polygon):`);
            console.log(`${indent}  https://polygonscan.com/tx/${r.evmHtlcFundTxid}`);
        }
        if (r.evmHtlcClaimTxid) {
            console.log(`${indent}Client Claimed (Polygon):`);
            console.log(`${indent}  https://polygonscan.com/tx/${r.evmHtlcClaimTxid}`);
        }
        if (r.bitcoinHtlcClaimTxid) {
            console.log(`${indent}Server Claimed (Arkade):`);
            console.log(`${indent}  https://arkade.space/tx/${r.bitcoinHtlcClaimTxid}`);
        }
    }
}

/**
 * Print EVM to BTC swap transaction details.
 */
function printEvmToBtcDetails(r, indent, compact) {
    if (compact) {
        printCompactTxIds(r, indent, "evmToBtc");
    } else {
        if (r.evmHtlcFundTxid) {
            console.log(`${indent}Client Funded (Polygon):`);
            console.log(`${indent}  https://polygonscan.com/tx/${r.evmHtlcFundTxid}`);
        }
        if (r.bitcoinHtlcFundTxid) {
            console.log(`${indent}Server Funded (Arkade):`);
            console.log(`${indent}  https://arkade.space/tx/${r.bitcoinHtlcFundTxid}`);
        }
        if (r.bitcoinHtlcClaimTxid) {
            console.log(`${indent}Client Claimed (Arkade):`);
            console.log(`${indent}  https://arkade.space/tx/${r.bitcoinHtlcClaimTxid}`);
        }
        if (r.evmHtlcClaimTxid) {
            console.log(`${indent}Server Claimed (Polygon):`);
            console.log(`${indent}  https://polygonscan.com/tx/${r.evmHtlcClaimTxid}`);
        }
    }
}

/**
 * Print BTC to Arkade swap transaction details.
 */
function printBtcToArkadeDetails(r, indent, compact) {
    if (compact) {
        printCompactTxIds(r, indent, "btcToArkade");
    } else {
        if (r.btcFundTxid) {
            console.log(`${indent}Client Funded (On-chain BTC):`);
            console.log(`${indent}  https://mempool.space/tx/${r.btcFundTxid}`);
        }
        if (r.arkadeFundTxid) {
            console.log(`${indent}Server Funded (Arkade):`);
            console.log(`${indent}  https://arkade.space/tx/${r.arkadeFundTxid}`);
        }
        if (r.arkadeClaimTxid) {
            console.log(`${indent}Client Claimed (Arkade):`);
            console.log(`${indent}  https://arkade.space/tx/${r.arkadeClaimTxid}`);
        }
        if (r.btcClaimTxid) {
            console.log(`${indent}Server Claimed (On-chain BTC):`);
            console.log(`${indent}  https://mempool.space/tx/${r.btcClaimTxid}`);
        }
    }
}

/**
 * Print compact transaction IDs for list view.
 */
function printCompactTxIds(r, indent, swapType) {
    const txIds = [];

    if (swapType === "btcToEvm") {
        if (r.bitcoinHtlcFundTxid) txIds.push(`Fund: arkade.space/tx/${r.bitcoinHtlcFundTxid.slice(0, 8)}...`);
        if (r.evmHtlcClaimTxid) txIds.push(`Claim: polygonscan.com/tx/${r.evmHtlcClaimTxid.slice(0, 8)}...`);
    } else if (swapType === "evmToBtc") {
        if (r.evmHtlcFundTxid) txIds.push(`Fund: polygonscan.com/tx/${r.evmHtlcFundTxid.slice(0, 8)}...`);
        if (r.bitcoinHtlcClaimTxid) txIds.push(`Claim: arkade.space/tx/${r.bitcoinHtlcClaimTxid.slice(0, 8)}...`);
    } else if (swapType === "btcToArkade") {
        if (r.btcFundTxid) txIds.push(`Fund: mempool.space/tx/${r.btcFundTxid.slice(0, 8)}...`);
        if (r.arkadeClaimTxid) txIds.push(`Claim: arkade.space/tx/${r.arkadeClaimTxid.slice(0, 8)}...`);
    }

    if (txIds.length > 0) {
        console.log(`${indent}Txs: ${txIds.join(" | ")}`);
    }
}

/**
 * Print full swap summary with all details.
 */
export function printSwapSummary(swapData) {
    const response = swapData.btcToEvmResponse || swapData.evmToBtcResponse || swapData.btcToArkadeResponse;
    if (!response) return;

    console.log("-".repeat(60));
    console.log(`  ID:     ${response.id}`);
    console.log(`  Type:   ${swapData.swapType}`);
    console.log(`  Status: ${response.status}`);
    console.log(`  From:   ${response.sourceToken} → ${response.targetToken}`);

    // Print transaction IDs if available
    const hasTxIds = hasAnyTransactionIds(swapData);
    if (hasTxIds) {
        console.log("");
        console.log("  Transactions:");
        printSwapDetails(swapData, true);
    }

    console.log("-".repeat(60));
}

/**
 * Check if swap has any transaction IDs.
 */
function hasAnyTransactionIds(swapData) {
    if (swapData.btcToEvmResponse) {
        const r = swapData.btcToEvmResponse;
        return !!(r.bitcoinHtlcFundTxid || r.evmHtlcFundTxid || r.evmHtlcClaimTxid || r.bitcoinHtlcClaimTxid);
    }
    if (swapData.evmToBtcResponse) {
        const r = swapData.evmToBtcResponse;
        return !!(r.evmHtlcFundTxid || r.bitcoinHtlcFundTxid || r.bitcoinHtlcClaimTxid || r.evmHtlcClaimTxid);
    }
    if (swapData.btcToArkadeResponse) {
        const r = swapData.btcToArkadeResponse;
        return !!(r.btcFundTxid || r.arkadeFundTxid || r.arkadeClaimTxid || r.btcClaimTxid);
    }
    return false;
}
