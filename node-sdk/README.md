# @lendasat/lendaswap-sdk-native

Native Node.js bindings for Lendaswap with SQLite storage.

## Overview

This package provides native Node.js bindings via [napi-rs](https://napi.rs/) for the Lendaswap client with SQLite
storage. It's designed for server-side applications, CLI tools, and backend services.

**Recommended:** Use this package through `@lendasat/lendaswap-sdk` with `.withSqliteStorage()` for a unified API across
browser and Node.js.

## Installation

```bash
# Install
pnpm add @lendasat/lendaswap-sdk-native
```

### Platform Support

Pre-built binaries are available for:

- macOS (x64, ARM64)
- Linux (x64, ARM64)
- Windows (x64)

## Usage (Recommended)

Use the main SDK with SQLite storage:

```javascript
import {Client} from "@lendasat/lendaswap-sdk";

const client = await Client.builder()
    .url("https://apilendaswap.lendasat.com")
    .network("bitcoin")
    .arkadeUrl("https://arkade.computer")
    .esploraUrl("https://mempool.space/api")
    .withSqliteStorage("./lendaswap.db")
    .build();

await client.init();

// Get available trading pairs
const pairs = await client.getAssetPairs();

// Get a quote
const quote = await client.getQuote("btc_lightning", "usdc_pol", 100000n);

// Create a swap
const swap = await client.createLightningToEvmSwap({
    target_address: "0xYourPolygonAddress",
    source_amount: 100000,
    target_token: "usdc_pol",
}, "polygon");
```

## Direct Usage (Advanced)

For advanced use cases, you can use the native SDK directly:

```javascript
import {
    SqliteStorageHandle,
    ClientBuilder,
} from "@lendasat/lendaswap-sdk-native";

const storage = SqliteStorageHandle.open("./lendaswap.db");
const client = new ClientBuilder()
    .storage(storage)
    .url("https://apilendaswap.lendasat.com")
    .network("bitcoin")
    .arkadeUrl("https://arkade.computer")
    .esploraUrl("https://mempool.space/api")
    .build();

await client.init();
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

## Supported Tokens

| Token | Chain     | ID              |
|-------|-----------|-----------------|
| BTC   | Lightning | `btc_lightning` |
| BTC   | Arkade    | `btc_arkade`    |
| BTC   | On-chain  | `btc_onchain`   |
| USDC  | Polygon   | `usdc_pol`      |
| USDT  | Polygon   | `usdt0_pol`     |
| USDC  | Ethereum  | `usdc_eth`      |
| USDT  | Ethereum  | `usdt_eth`      |

## Related Packages

- `@lendasat/lendaswap-sdk` - Main SDK with unified API for browser (IndexedDB) and Node.js (SQLite)

## License

MIT
