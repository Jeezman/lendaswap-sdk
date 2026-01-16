# @lendasat/lendaswap-sdk-native

Native Node.js SDK for Lendaswap - Bitcoin-to-stablecoin atomic swaps with SQLite storage.

## Overview

This SDK provides native Node.js bindings via [napi-rs](https://napi.rs/) for the Lendaswap client, enabling atomic
swaps between Bitcoin (Lightning/Arkade/On-chain) and EVM stablecoins (USDC, USDT on Polygon/Ethereum). It uses SQLite
for persistent storage, making it ideal for server-side applications, CLI tools, and backend services.

## Installation

```bash
npm install @lendasat/lendaswap-sdk-native
# or
pnpm add @lendasat/lendaswap-sdk-native
```

### Platform Support

Pre-built binaries are available for:

- macOS (x64, ARM64)
- Linux (x64, ARM64)
- Windows (x64)

## Quick Start

```javascript
import {
    SqliteStorageHandle,
    ClientBuilder,
} from "@lendasat/lendaswap-sdk-native";

// Open SQLite database (creates if not exists)
const storage = SqliteStorageHandle.open("./lendaswap.db");

// Create client
const client = new ClientBuilder()
    .storage(storage)
    .url("https://apilendaswap.lendasat.com")
    .network("bitcoin")
    .arkadeUrl("https://arkade.computer")
    .esploraUrl("https://mempool.space/api")
    .build();

// Initialize wallet (generates or loads mnemonic)
await client.init();

// Get available trading pairs
const pairs = await client.getAssetPairs();
console.log("Available pairs:", pairs);

// Get a quote
const quote = await client.getQuote("btc_lightning", "usdc_pol", 100000);
console.log("Rate:", quote.exchangeRate);
console.log("You receive:", quote.minAmount);
```

## Swap Examples

### Lightning to USDC (Polygon)

```javascript
const swap = await client.createLightningToEvmSwap(
    "0xYourPolygonAddress", // target EVM address
    100000,                 // source amount in sats
    null,                   // target amount (null = use source)
    "usdc_pol",             // target token
    "polygon",              // target chain
    null                    // referral code
);

console.log("Swap ID:", swap.id);
console.log("Pay this Lightning invoice:", swap.lnInvoice);
console.log("You will receive:", swap.assetAmount, "USDC");
```

### Arkade to USDC (Polygon)

```javascript
const swap = await client.createArkadeToEvmSwap(
    "0xYourPolygonAddress", // target EVM address
    100000,                 // source amount in sats
    null,                   // target amount
    "usdc_pol",             // target token
    "polygon",              // target chain
    null                    // referral code
);

console.log("Swap ID:", swap.id);
console.log("Fund this Arkade VHTLC:", swap.htlcAddressArkade);
```

### On-chain BTC to Arkade

```javascript
const swap = await client.createBitcoinToArkadeSwap(
    "ark1...",  // target Arkade address
    100000,     // sats to receive on Arkade
    null        // referral code
);

console.log("Swap ID:", swap.id);
console.log("Send BTC to:", swap.btcHtlcAddress);
console.log("Fee:", swap.feeSats, "sats");
```

## Monitoring Swap Status

```javascript
import {SwapStatus} from "@lendasat/lendaswap-sdk-native";

// Poll for status updates
const checkStatus = async (swapId) => {
    const swap = await client.getSwap(swapId);
    const response = swap.btcToEvmResponse || swap.evmToBtcResponse || swap.btcToArkadeResponse;

    switch (response.status) {
        case SwapStatus.Pending:
            console.log("Waiting for funding...");
            break;
        case SwapStatus.ClientFunded:
            console.log("Funded! Waiting for server...");
            break;
        case SwapStatus.ServerFunded:
            console.log("Server funded! Claiming...");
            await client.claimGelato(swapId);
            break;
        case SwapStatus.ServerRedeemed:
            console.log("Swap complete!");
            break;
        case SwapStatus.Expired:
            console.log("Swap expired");
            break;
    }

    return response.status;
};
```

## API Reference

### Storage

```javascript
// File-based SQLite database
const storage = SqliteStorageHandle.open("./lendaswap.db");

// In-memory database (for testing)
const memStorage = SqliteStorageHandle.inMemory();
```

### Client

```javascript
const client = new ClientBuilder()
    .storage(storage)
    .url(apiUrl)
    .network(network)       // "bitcoin", "testnet", or "regtest"
    .arkadeUrl(arkadeUrl)
    .esploraUrl(esploraUrl)
    .build();

// Wallet operations
await client.init();                      // Initialize with new mnemonic
await client.init("your mnemonic...");    // Initialize with existing mnemonic
await client.getMnemonic();               // Get current mnemonic
await client.getUserIdXpub();             // Get user ID xpub

// API info
await client.getVersion();
await client.getAssetPairs();
await client.getTokens();
await client.getQuote(from, to, amount);

// Swap operations
await client.createLightningToEvmSwap(...);
await client.createArkadeToEvmSwap(...);
await client.createEvmToArkadeSwap(...);
await client.createEvmToLightningSwap(...);
await client.createBitcoinToArkadeSwap(...);
await client.getSwap(id);
await client.listAll();

// Claiming and refunding
await client.claimGelato(swapId);         // Gasless EVM claim via Gelato
await client.claimVhtlc(swapId);          // Claim Arkade VHTLC
await client.claimBtcToArkadeVhtlc(swapId);
await client.refundVhtlc(swapId, addr);
await client.refundOnchainHtlc(swapId, addr);

// Recovery and cleanup
await client.recoverSwaps();
await client.deleteSwap(id);
await client.clearSwapStorage();
```

### SwapStatus Enum

```javascript
import {SwapStatus} from "@lendasat/lendaswap-sdk-native";

SwapStatus.Pending                  // Waiting for client funding
SwapStatus.ClientFundingSeen        // Funding seen, not confirmed
SwapStatus.ClientFunded             // Client funded
SwapStatus.ServerFunded             // Server funded, ready to claim
SwapStatus.ClientRedeeming          // Claiming in progress
SwapStatus.ClientRedeemed           // Client claimed
SwapStatus.ServerRedeemed           // Complete
SwapStatus.Expired                  // Expired before funding
SwapStatus.ClientRefunded           // Refunded
SwapStatus.ClientFundedServerRefunded
SwapStatus.ClientInvalidFunded
SwapStatus.ClientFundedTooLate
```

## CLI Example

A full CLI example is available in `examples/nodejs/`:

```bash
cd client-sdk/examples/nodejs
pnpm install
node index.js help
```

Commands:

- `pairs` - List available trading pairs
- `tokens` - List available tokens
- `quote <from> <to> <amount>` - Get a quote
- `swap <from> <to> <amount> <address>` - Create and monitor a swap
- `swaps` - List stored swaps with transaction links
- `info` - Show wallet and API info

## Environment Variables

| Variable            | Description                       | Default                             |
| ------------------- | --------------------------------- | ----------------------------------- |
| `LENDASWAP_API_URL` | API endpoint                      | `https://apilendaswap.lendasat.com` |
| `BITCOIN_NETWORK`   | Network (bitcoin/testnet/regtest) | `bitcoin`                           |
| `ARKADE_URL`        | Arkade server URL                 | `https://arkade.computer`           |
| `ESPLORA_URL`       | Esplora API URL                   | `https://mempool.space/api`         |
| `DB_PATH`           | SQLite database path              | `./lendaswap.db`                    |
| `MNEMONIC`          | Wallet mnemonic (optional)        | Auto-generated                      |

## Supported Tokens

| Token | Chain     | ID              |
| ----- | --------- | --------------- |
| BTC   | Lightning | `btc_lightning` |
| BTC   | Arkade    | `btc_arkade`    |
| BTC   | On-chain  | `btc_onchain`   |
| USDC  | Polygon   | `usdc_pol`      |
| USDT  | Polygon   | `usdt0_pol`     |
| USDC  | Ethereum  | `usdc_eth`      |
| USDT  | Ethereum  | `usdt_eth`      |

## Comparison with WASM/TS SDK

| Feature  | Native SDK                       | WASM/TS SDK               |
| -------- | -------------------------------- | ------------------------- |
| Storage  | SQLite                           | IndexedDB (Dexie)         |
| Platform | Node.js                          | Browser + Node.js         |
| Use case | Servers, CLI, backends           | Web apps, frontends       |
| Package  | `@lendasat/lendaswap-sdk-native` | `@lendasat/lendaswap-sdk` |

## License

MIT
