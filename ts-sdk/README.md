# @lendasat/lendaswap-sdk

TypeScript/JavaScript SDK for Lendaswap - Bitcoin-to-stablecoin atomic swaps.

## Overview

This SDK provides a high-level interface for interacting with the Lendaswap API, enabling atomic swaps between Bitcoin (
Lightning/Arkade/On-chain) and EVM stablecoins (USDC, USDT on Polygon/Ethereum). Built with WebAssembly for browser
environments and IndexedDB for persistent storage.

**For Node.js server-side applications**, use `@lendasat/lendaswap-sdk-native` instead.

## Installation

```bash
npm install @lendasat/lendaswap-sdk
# or
pnpm add @lendasat/lendaswap-sdk
```

## Bundler Setup

This SDK uses WebAssembly (WASM) for cryptographic operations. Modern bundlers require plugins to handle WASM imports.

### Vite

```bash
pnpm add -D vite-plugin-wasm vite-plugin-top-level-await
```

```typescript
// vite.config.ts
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';
import {defineConfig} from 'vite';

export default defineConfig({
  plugins: [wasm(), topLevelAwait()],
});
```

### Webpack 5

```bash
pnpm add -D wasm-loader
```

```javascript
// webpack.config.js
module.exports = {
    experiments: {
        asyncWebAssembly: true,
    },
    module: {
        rules: [
            {
                test: /\.wasm$/,
                type: 'webassembly/async',
            },
        ],
    },
};
```

### Next.js

```javascript
// next.config.js
module.exports = {
    webpack: (config) => {
        config.experiments = {
            ...config.experiments,
            asyncWebAssembly: true,
        };
        return config;
    },
};
```

## Quick Start

### Create a Client

```typescript
import { Client } from '@lendasat/lendaswap-sdk';

// Create client using the builder pattern
const client = await Client.builder()
  .url('https://apilendaswap.lendasat.com')
  .withIdbStorage()  // Uses IndexedDB for browser storage
  .network('bitcoin')
  .arkadeUrl('https://arkade.computer')
  .esploraUrl('https://mempool.space/api')
  .build();

// Initialize wallet (generates or loads mnemonic)
await client.init();
```

### Get Asset Pairs and Quote

```typescript
import { Client } from '@lendasat/lendaswap-sdk';

const client = await Client.builder()
  .url('https://apilendaswap.lendasat.com')
  .withIdbStorage()
  .network('bitcoin')
  .arkadeUrl('https://arkade.computer')
  .esploraUrl('https://mempool.space/api')
  .build();

await client.init();

// Get available trading pairs
const pairs = await client.getAssetPairs();
console.log('Available pairs:', pairs);

// Get a quote for swapping 100,000 sats to USDC on Polygon
const quote = await client.getQuote('btc_arkade', 'usdc_pol', 100_000n);
console.log('Exchange rate:', quote.exchange_rate);
console.log('You receive:', quote.min_amount, 'USDC');
console.log('Protocol fee:', quote.protocol_fee);
```

### Lightning to USDC (Polygon) Swap

This example shows how to swap BTC via Lightning to USDC on Polygon.

```typescript
import { Client } from '@lendasat/lendaswap-sdk';

const client = await Client.builder()
  .url('https://apilendaswap.lendasat.com')
  .withIdbStorage()
  .network('bitcoin')
  .arkadeUrl('https://arkade.computer')
  .esploraUrl('https://mempool.space/api')
  .build();

await client.init();

// Create Lightning → USDC (Polygon) swap
const swap = await client.createLightningToEvmSwap(
  {
    target_address: '0xYourPolygonAddress',
    source_amount: 100000n, // 100,000 sats
    target_token: 'usdc_pol',
  },
  'polygon'
);

console.log('Swap created:', swap.id);
console.log('Pay this Lightning invoice:', swap.lnInvoice);
console.log('You will receive:', swap.assetAmount, 'USDC');

// After paying the invoice, claim via Gelato (gasless)
await client.claimGelato(swap.id);
console.log('Swap claimed via Gelato relay!');
```

### Arkade to Polygon Swap (with Gelato Auto-Redeem)

This example shows how to swap BTC from Arkade to USDC on Polygon. The swap uses Gelato relay for gasless claiming on
the EVM side.

```typescript
import { Client } from '@lendasat/lendaswap-sdk';

const client = await Client.builder()
  .url('https://apilendaswap.lendasat.com')
  .withIdbStorage()
  .network('bitcoin')
  .arkadeUrl('https://arkade.computer')
  .esploraUrl('https://mempool.space/api')
  .build();

await client.init();

// Create Arkade → USDC (Polygon) swap
const swap = await client.createArkadeToEvmSwap(
  {
    target_address: '0xYourPolygonAddress',
    target_amount: 10, // 10 USDC
    target_token: 'usdc_pol',
  },
  'polygon'
);

console.log('Swap created:', swap.id);
console.log('Send BTC to Arkade VHTLC to proceed');

// After sending BTC, claim via Gelato (gasless)
// The secret is automatically derived from your wallet
await client.claimGelato(swap.id);
console.log('Swap claimed via Gelato relay!');
```

### USDC (Ethereum) to Lightning Swap

This example shows how to swap USDC on Ethereum to Bitcoin via Lightning. You'll need to sign the EVM transaction using
a wallet like MetaMask.

We recommend using [wagmi](https://wagmi.sh/) with [viem](https://viem.sh/) for React apps,
or [ethers.js](https://docs.ethers.org/) for vanilla JS/TS.

```typescript
import { Client } from '@lendasat/lendaswap-sdk';

const client = await Client.builder()
  .url('https://apilendaswap.lendasat.com')
  .withIdbStorage()
  .network('bitcoin')
  .arkadeUrl('https://arkade.computer')
  .esploraUrl('https://mempool.space/api')
  .build();

await client.init();

// Create USDC (Ethereum) → Lightning swap
const swap = await client.createEvmToLightningSwap(
  {
    bolt11_invoice: 'lnbc...', // Your Lightning invoice
    user_address: '0xYourEthereumAddress', // Your connected wallet address
    source_token: 'usdc_eth',
  },
  'ethereum'
);

console.log('Swap created:', swap.id);
console.log('Contract address:', swap.contractAddress);
console.log('Amount to send:', swap.sourceAmount);

// Now use your wallet to send the transaction to the HTLC contract
// Example with wagmi/viem:
//
// import { useWriteContract } from 'wagmi';
// const { writeContract } = useWriteContract();
//
// await writeContract({
//   address: swap.contractAddress,
//   abi: htlcAbi,
//   functionName: 'deposit',
//   args: [swap.hashLock, swap.timelock, ...],
//   value: swap.sourceAmount,
// });
//
// Example with ethers.js:
//
// const signer = await provider.getSigner();
// const contract = new ethers.Contract(swap.contractAddress, htlcAbi, signer);
// await contract.deposit(swap.hashLock, swap.timelock, ...);
```

### Real-time Price Feed (WebSocket)

Subscribe to real-time price updates via WebSocket:

```typescript
import { PriceFeedService } from '@lendasat/lendaswap-sdk';

const priceFeed = new PriceFeedService('https://apilendaswap.lendasat.com');

// Subscribe to price updates
const unsubscribe = priceFeed.subscribe((update) => {
  console.log('Timestamp:', update.timestamp);

  for (const pair of update.pairs) {
    console.log(`${pair.pair}:`);
    console.log(`  1 unit:      ${pair.tiers.tier_1}`);
    console.log(`  100 units:   ${pair.tiers.tier_100}`);
    console.log(`  1,000 units: ${pair.tiers.tier_1000}`);
    console.log(`  5,000 units: ${pair.tiers.tier_5000}`);
  }
});

// Check connection status
console.log('Connected:', priceFeed.isConnected());
console.log('Listeners:', priceFeed.listenerCount());

// Unsubscribe when done
unsubscribe();
```

## Features

- **Client** - Full-featured client for the Lendaswap API with WASM-powered cryptography
- **Wallet Management** - HD wallet derivation for swap parameters
- **Price Feed** - Real-time WebSocket price updates with auto-reconnection
- **Price Calculations** - Helper functions for computing exchange rates and amounts
- **USD Prices** - Fetch current USD prices from CoinGecko
- **IndexedDB Storage** - Automatic storage via native Rust IndexedDB implementation
- **Configurable Logging** - Set log level via code or localStorage

## API Reference

### Client

```typescript
// Create client using builder pattern
const client = await Client.builder()
  .url('https://apilendaswap.lendasat.com')
  .withIdbStorage()
  .network('bitcoin')
  .arkadeUrl('https://arkade.computer')
  .esploraUrl('https://mempool.space/api')
  .build();

// Initialize wallet
await client.init();
await client.init('your mnemonic phrase'); // Or with existing mnemonic

// Trading pairs, tokens, and quotes
await client.getAssetPairs();
await client.getTokens();
await client.getQuote(from, to, amount);
await client.getVersion();

// Swap operations
await client.createArkadeToEvmSwap(request, targetNetwork);
await client.createLightningToEvmSwap(request, targetNetwork);
await client.createEvmToArkadeSwap(request, sourceNetwork);
await client.createEvmToLightningSwap(request, sourceNetwork);
await client.getSwap(id);
await client.listAllSwaps();
await client.deleteSwap(id);
await client.clearSwapStorage();

// Claiming and refunding
await client.claimGelato(swapId);        // Gasless EVM claim via Gelato
await client.claimVhtlc(swapId);         // Claim Arkade VHTLC
await client.refundVhtlc(swapId, addr);  // Refund expired VHTLC
await client.amountsForSwap(swapId);     // Get VHTLC amounts

// On-chain Bitcoin to Arkade swaps
await client.createBitcoinToArkadeSwap(request);
await client.claimBtcToArkadeVhtlc(swapId);
await client.refundOnchainHtlc(swapId, refundAddress);

// VTXO swaps (refresh VTXOs)
await client.estimateVtxoSwap(vtxos);
await client.createVtxoSwap(vtxos);
await client.getVtxoSwap(id);
await client.claimVtxoSwap(swap, swapParams, claimAddress);
await client.refundVtxoSwap(swapId, refundAddress);
await client.listAllVtxoSwaps();

// Recovery
await client.recoverSwaps();

// Wallet info
await client.getMnemonic();
await client.getUserIdXpub();
```

### PriceFeedService

```typescript
import { PriceFeedService } from '@lendasat/lendaswap-sdk';

const priceFeed = new PriceFeedService('https://apilendaswap.lendasat.com');

// Subscribe (auto-connects)
const unsubscribe = priceFeed.subscribe((prices) => {
  console.log('Price update:', prices);
});

// Status
priceFeed.isConnected();
priceFeed.listenerCount();

// Cleanup
unsubscribe();
```

### Logging

```typescript
import { setLogLevel, getLogLevel } from '@lendasat/lendaswap-sdk';

// Set log level programmatically
setLogLevel('debug'); // 'trace' | 'debug' | 'info' | 'warn' | 'error'

// Get current log level
console.log('Current level:', getLogLevel());

// Or set via localStorage (persists across page reloads)
localStorage.setItem('lendaswap_log_level', 'debug');
// Reload page for changes to take effect
```

### Price Calculations

```typescript
import {
  calculateSourceAmount,
  calculateTargetAmount,
  computeExchangeRate,
  selectTierRate,
} from '@lendasat/lendaswap-sdk';

// Select the appropriate tier rate based on amount
const rate = selectTierRate(priceTiers, amount);

// Calculate target amount from source
const targetAmount = calculateTargetAmount(sourceAmount, exchangeRate);

// Calculate source amount from target
const sourceAmount = calculateSourceAmount(targetAmount, exchangeRate);

// Compute exchange rate from price tiers
const exchangeRate = computeExchangeRate(priceTiers, amount);
```

### USD Prices

```typescript
import {
  getUsdPrice,
  getUsdPrices,
  getSupportedTokensForUsdPrice,
} from '@lendasat/lendaswap-sdk';

// Get USD price for a single token
const btcPrice = await getUsdPrice('btc_arkade');
console.log('BTC price:', btcPrice.usd);

// Get USD prices for multiple tokens
const prices = await getUsdPrices(['btc_arkade', 'usdc_pol']);

// Get list of supported tokens for USD price lookup
const supported = getSupportedTokensForUsdPrice();
```

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
| XAUT  | Ethereum  | `xaut_eth`      |

## Comparison with Native SDK

| Feature  | This SDK (Browser)        | Native SDK (Node.js)             |
| -------- | ------------------------- | -------------------------------- |
| Storage  | IndexedDB                 | SQLite                           |
| Platform | Browser                   | Node.js                          |
| Use case | Web apps, frontends       | Servers, CLI, backends           |
| Package  | `@lendasat/lendaswap-sdk` | `@lendasat/lendaswap-sdk-native` |

For server-side applications, CLI tools, or backends requiring SQLite storage, use `@lendasat/lendaswap-sdk-native`.

## License

MIT
