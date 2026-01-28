# Lendaswap Pure TypeScript SDK - CLI Example

A simple CLI demonstrating the Lendaswap Pure TypeScript SDK.

## Setup

```bash
npm install
```

## Usage

```bash
# Show help
npm start -- help

# List available trading pairs
npm run pairs

# Get a quote
npm run quote -- btc_lightning usdc_pol 100000

# Create a swap (requires funding)
npm run swap -- btc_lightning usdc_pol 100000 0xYourAddress

# List locally stored swaps
npm run swaps

# Show wallet and API info
npm start -- info
```

## Environment Variables

| Variable            | Description                               | Default                              |
| ------------------- | ----------------------------------------- | ------------------------------------ |
| `LENDASWAP_API_URL` | API base URL                              | `https://apilendaswap.lendasat.com/` |
| `MNEMONIC`          | BIP39 mnemonic (generates new if not set) | -                                    |
| `LENDASWAP_API_KEY` | API key for authentication                | -                                    |

## Example with Custom Mnemonic

```bash
MNEMONIC="your twelve word mnemonic phrase here" npm run pairs
```

## Notes

- This example uses in-memory storage, so swaps are only persisted during the CLI session
- For browser apps, use `IdbWalletStorage` and `IdbSwapStorage` for persistent IndexedDB storage
- For React Native, implement custom storage backends using `WalletStorage` and `SwapStorage` interfaces
