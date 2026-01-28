# Lendaswap Pure TypeScript SDK - CLI Example

A simple CLI demonstrating the Lendaswap Pure TypeScript SDK.

## Setup

```bash
npm install

# Optional: Create a .env file from the example
cp .env.example .env
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

# Watch a swap's status (polls every 5 seconds)
npm run watch -- <swap-id>

# Redeem a swap (when in serverfunded status)
npm run redeem -- <swap-id>

# Refund a swap (on-chain swaps require destination address)
npm run refund -- <swap-id>                           # Check refund status
npm run refund -- <swap-id> <btc-address> 5           # Refund with 5 sat/vB fee (broadcasts automatically)
npm run refund -- <swap-id> <btc-address> 5 --dry-run # Build tx without broadcasting

# List locally stored swaps
npm run swaps

# Show wallet and API info
npm run info
```

## Environment Variables

| Variable            | Description                               | Default                              |
| ------------------- | ----------------------------------------- | ------------------------------------ |
| `LENDASWAP_API_URL` | API base URL                              | `https://apilendaswap.lendasat.com/` |
| `MNEMONIC`          | BIP39 mnemonic (generates new if not set) | -                                    |
| `LENDASWAP_API_KEY` | API key for authentication                | -                                    |
| `LENDASWAP_DB_PATH` | SQLite database path                      | `~/.lendaswap/data.db`               |
| `ESPLORA_URL`       | Esplora API URL for broadcasting          | `https://mempool.space/api`          |

## Example with Custom Mnemonic

```bash
MNEMONIC="your twelve word mnemonic phrase here" npm run pairs
```

## Notes

- This example uses SQLite storage for persistent data (wallet mnemonic, key index, and swaps)
- Data is stored in `~/.lendaswap/data.db` by default (can be changed via `LENDASWAP_DB_PATH`)
- For browser apps, use `IdbWalletStorage` and `IdbSwapStorage` for persistent IndexedDB storage
- For React Native, implement custom storage backends using `WalletStorage` and `SwapStorage` interfaces
