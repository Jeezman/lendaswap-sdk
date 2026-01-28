# Lendaswap Pure TypeScript SDK

A pure TypeScript SDK for interacting with the Lendaswap API. This SDK is designed to work in all JavaScript
environments, including React Native.

## Installation

```bash
npm install @lendasat/lendaswap-sdk-pure
```

## Supported Swaps

This SDK currently supports the following swap directions:

| Source       | Target                | Status    |
| ------------ | --------------------- | --------- |
| Lightning    | Polygon (USDC, USDT)  | Supported |
| Lightning    | Arbitrum (USDC, USDT) | Supported |
| Arkade       | Polygon (USDC, USDT)  | Supported |
| Arkade       | Arbitrum (USDC, USDT) | Supported |
| On-chain BTC | Polygon (USDC, USDT)  | Supported |
| On-chain BTC | Arbitrum (USDC, USDT) | Supported |

**Refund support:**

- Lightning swaps: Auto-expire, no refund needed
- Arkade swaps: Off-chain refund via Arkade protocol
- On-chain BTC swaps: On-chain refund transaction after timelock

> More swap directions (e.g., EVM to BTC) will be added in future versions.

## Usage

### Setup

```typescript
import { Client, IdbWalletStorage, IdbSwapStorage } from "@lendasat/lendaswap-sdk-pure";

// Create a client with persistent storage (browser)
const client = await Client.builder()
  .withSignerStorage(new IdbWalletStorage())
  .withSwapStorage(new IdbSwapStorage())
  .withApiKey("your-api-key")
  .build();

// Or import an existing wallet
const client = await Client.builder()
  .withSignerStorage(new IdbWalletStorage())
  .withSwapStorage(new IdbSwapStorage())
  .withMnemonic("abandon abandon abandon ...")
  .build();

// Get the mnemonic (for backup)
const mnemonic = client.getMnemonic();
```

### Get a Quote

```typescript
// Get available asset pairs
const pairs = await client.getAssetPairs();

// Get a quote for swapping 100k sats to USDC on Polygon
const quote = await client.getQuote("btc_arkade", "usdc_pol", 100000);
console.log(`You'll receive: ${quote.target_amount} USDC`);
```

### Create a Swap

#### Lightning to EVM

```typescript
const result = await client.createLightningToEvmSwap({
  targetAddress: "0x1234567890abcdef1234567890abcdef12345678",
  targetToken: "usdc_pol",    // or "usdc_arb", "usdt_pol", "usdt_arb"
  targetChain: "polygon",      // or "arbitrum"
  sourceAmount: 100000,        // Amount in sats
});

// Pay the Lightning invoice to complete the swap
console.log(`Pay this invoice: ${result.response.ln_invoice}`);
console.log(`Swap ID: ${result.response.id}`);
```

#### Arkade to EVM

```typescript
const result = await client.createArkadeToEvmSwap({
  targetAddress: "0x1234567890abcdef1234567890abcdef12345678",
  targetToken: "usdc_arb",
  targetChain: "arbitrum",
  sourceAmount: 100000,
});

// Send BTC to the Arkade VHTLC address
console.log(`Send BTC to: ${result.response.htlc_address_arkade}`);
console.log(`Swap ID: ${result.response.id}`);
```

#### On-chain BTC to EVM

```typescript
const result = await client.createBitcoinToEvmSwap({
  targetAddress: "0x1234567890abcdef1234567890abcdef12345678",
  targetToken: "usdc_pol",
  targetChain: "polygon",
  sourceAmount: 100000,
});

// Send BTC to the on-chain HTLC address
console.log(`Send BTC to: ${result.response.btc_htlc_address}`);
console.log(`Swap ID: ${result.response.id}`);
```

### Monitor Swap Status

```typescript
// Get current swap status
const swap = await client.getSwap("swap-uuid");
console.log(`Status: ${swap.status}`);

// Status flow: pending -> clientfunded -> serverfunded -> clientredeemed -> serverredeemed
```

### Claim EVM Tokens

Once the server has funded the EVM HTLC (`serverfunded` status), claim your tokens:

```typescript
const claimResult = await client.claimEvmSwap("swap-uuid");
console.log(`Claim tx: ${claimResult.tx_hash}`);
```

### Refund (if swap times out)

```typescript
// For on-chain BTC swaps
const refundResult = await client.refundSwap("swap-uuid", {
  destinationAddress: "bc1q...",  // Your Bitcoin address
  feeRateSatPerVb: 5,
});

// For Arkade swaps
const refundResult = await client.refundSwap("swap-uuid", {
  destinationAddress: "ark1...",  // Your Arkade address
});
```

### Storage

The SDK provides pluggable storage interfaces for persisting wallet and swap data.
Browser storage uses [Dexie](https://dexie.org/) for IndexedDB access with the database name `lendaswap-v3`.

**Storage Types:**

- `WalletStorage` - Stores mnemonic and key derivation index
- `SwapStorage` - Stores `StoredSwap` records (API response + client-side params)

**StoredSwap Structure:**

Each swap is stored with both the API response and client-side parameters needed for claim/refund operations:

```typescript
interface StoredSwap {
  version: number;        // Schema version for migrations
  swapId: string;         // Primary key
  keyIndex: number;       // Key derivation index
  response: GetSwapResponse;  // Full API response
  publicKey: string;      // Hex-encoded compressed public key
  preimage: string;       // Hex-encoded preimage for claiming HTLCs
  preimageHash: string;   // Hex-encoded hash lock
  secretKey: string;      // Hex-encoded secret key for signing
  storedAt: number;       // Timestamp when first stored
  updatedAt: number;      // Timestamp when last updated
}
```

**Usage:**

```typescript
import {
  InMemoryWalletStorage,
  InMemorySwapStorage,
  IdbWalletStorage,     // Browser only (IndexedDB via Dexie)
  IdbSwapStorage,       // Browser only (IndexedDB via Dexie)
  idbStorageFactory,    // Factory for creating IDB storage
  inMemoryStorageFactory,
  SWAP_STORAGE_VERSION,
  type StoredSwap,
} from "@lendasat/lendaswap-sdk-pure";

// In-memory storage (for testing or temporary sessions)
const walletStorage = new InMemoryWalletStorage();
const swapStorage = new InMemorySwapStorage();

// IndexedDB storage (for browser persistence)
// Uses shared "lendaswap-v3" database with "wallet" and "swaps" tables
const walletStorage = new IdbWalletStorage();
const swapStorage = new IdbSwapStorage();

// Store a swap
await swapStorage.store({
  version: SWAP_STORAGE_VERSION,
  swapId: "uuid",
  keyIndex: 0,
  response: apiResponse,
  publicKey: "02...",
  preimage: "...",
  preimageHash: "...",
  secretKey: "...",
  storedAt: Date.now(),
  updatedAt: Date.now(),
});

// Update swap response (e.g., after polling for status)
await swapStorage.update("uuid", newApiResponse);

// Custom storage (implement the WalletStorage/SwapStorage interfaces)
// For React Native, you might use AsyncStorage or SQLite
```

## Development

### Project Structure

```
src/
├── api/
│   └── client.ts       # Low-level API client wrapper
├── generated/
│   └── api.ts          # Auto-generated types from OpenAPI spec
├── signer/
│   └── index.ts        # HD wallet key derivation (BIP39/BIP32)
├── storage/
│   ├── index.ts        # Storage interfaces and in-memory implementations
│   ├── idb.ts          # IndexedDB storage for browsers
│   └── types.ts        # StoredSwap type definition
├── client.ts           # High-level Client class with convenience methods
└── index.ts            # Public exports
```

### Auto-generated API Types

The TypeScript types in `src/generated/api.ts` are **auto-generated** from the OpenAPI specification. Do not edit this
file manually.

#### How it works

1. The Lendaswap backend generates an OpenAPI 3.0 specification (`openapi.json`)
   using [utoipa](https://github.com/juhaku/utoipa)
2. We use [openapi-typescript](https://github.com/openapi-ts/openapi-typescript) to generate TypeScript types from the
   spec
3. The [openapi-fetch](https://github.com/openapi-ts/openapi-typescript/tree/main/packages/openapi-fetch) library
   provides a type-safe HTTP client

#### Regenerating the API client

When the backend API changes:

1. Download the latest OpenAPI spec from the backend:
   ```bash
   curl -o openapi.json https://apilendaswap.lendasat.com/api-docs/openapi.json
   ```

2. Run the generate command:
   ```bash
   npm run generate:api
   ```

This will regenerate `src/generated/api.ts` with the updated types.

### Scripts

| Command                | Description                            |
| ---------------------- | -------------------------------------- |
| `npm run build`        | Compile TypeScript to JavaScript       |
| `npm run test`         | Run tests with Vitest                  |
| `npm run lint`         | Run Biome linter                       |
| `npm run lint:fix`     | Fix linting issues                     |
| `npm run generate:api` | Regenerate API types from OpenAPI spec |

### Adding New Features

When adding new functionality:

1. **API methods**: Add convenience methods to `src/client.ts` that wrap the low-level API calls
2. **New types**: If the backend adds new endpoints, regenerate the API types first
3. **Exports**: Update `src/index.ts` to export any new public types or classes

### Dependencies

- `openapi-fetch` - Type-safe HTTP client for OpenAPI specs
- `@noble/hashes` - Cryptographic hash functions
- `@scure/bip32` - BIP32 HD wallet derivation
- `@scure/bip39` - BIP39 mnemonic phrase handling
- `dexie` - IndexedDB wrapper for browser storage
