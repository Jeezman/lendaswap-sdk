# Lendaswap Client SDK

Monorepo containing client SDKs for Lendaswap - Bitcoin-to-stablecoin atomic swaps.

## Structure

This repository contains interconnected packages:

### [`core/`](./core/) - Rust Core Library

Platform-agnostic Rust library containing:

- API client for the Lendaswap backend
- Type definitions matching the backend API schema
- HTTP request handling with `reqwest`

Used as a dependency by both the WASM SDK and the Node.js native SDK.

### [`wasm-sdk/`](./wasm-sdk/) - WASM Bindings

WebAssembly bindings for the core library:

- `wasm-bindgen` exports for browser/Node.js usage
- JavaScript-friendly type conversions
- Async API methods

Compiled to WASM and consumed by the TypeScript SDK.

### [`node-sdk/`](./node-sdk/) - Native Node.js SDK

Native Node.js bindings via [napi-rs](https://napi.rs/):

- SQLite storage for server-side applications
- Pre-built binaries for macOS, Linux, and Windows (x64, ARM64)
- Designed for CLI tools and backend services
- Published as `@lendasat/lendaswap-sdk-native` on npm

### [`ts-sdk/`](./ts-sdk/) - TypeScript SDK

High-level TypeScript/JavaScript SDK:

- Wraps the WASM bindings with idiomatic TypeScript
- HD wallet management for swap parameters
- Storage providers (LocalStorage, IndexedDB, Memory, SQLite via node-sdk)
- Real-time WebSocket price feed
- Published as `@lendasat/lendaswap-sdk` on npm

### [`examples/`](./examples/) - Example Projects

Example implementations:

- [`examples/nodejs/`](./examples/nodejs/) - CLI example using the native Node.js SDK with SQLite storage

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   ts-sdk (TypeScript)               │
│  - ApiClient, Wallet, PriceFeedService              │
│  - Storage providers (browser + Node.js)            │
│  - Published to npm as @lendasat/lendaswap-sdk      │
└─────────────────────┬───────────────────────────────┘
                      │ imports
        ┌─────────────┴─────────────┐
        │                           │
┌───────▼───────────┐     ┌─────────▼─────────────────┐
│   wasm-sdk (WASM) │     │  node-sdk (Native)        │
│  - wasm-bindgen   │     │  - napi-rs bindings       │
│  - Browser/WASM   │     │  - SQLite storage         │
└───────┬───────────┘     │  - @lendasat/lendaswap-   │
        │                 │    sdk-native             │
        │                 └─────────┬─────────────────┘
        │ depends on                │ depends on
        └─────────────┬─────────────┘
┌─────────────────────▼───────────────────────────────┐
│                  core (Rust)                        │
│  - API types and client                             │
│  - HTTP with reqwest                                │
└─────────────────────────────────────────────────────┘
```

## Building

This project uses [Just](https://github.com/casey/just) as a command runner.

```bash
# Build both SDKs (WASM + Native)
just build-all

# Build WASM SDK + TypeScript
just build-sdk

# Build native Node.js SDK
just build-native

# Run Node.js example
just run-nodejs-example
```

Manual build commands:

```bash
# Build WASM + TypeScript SDK
cd ts-sdk
pnpm install
pnpm run build

# Build native Node.js SDK
cd node-sdk
npm install
npm run build
```

## Development

```bash
# Format Rust code
cargo fmt --all

# Check Rust code
cargo check --all

# Run Rust tests
cargo test --all

# Run TypeScript SDK tests
just test-sdk
```

## License

MIT
