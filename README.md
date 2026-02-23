# Lendaswap Client SDK

Monorepo containing client SDKs for Lendaswap - Bitcoin-to-stablecoin atomic swaps.

## Structure

This repository contains interconnected packages:

### [`core/`](./core/) - Rust Core Library

Platform-agnostic Rust library containing:

- API client for the Lendaswap backend
- Type definitions matching the backend API schema
- HTTP request handling with `reqwest`

### [`ts-pure-sdk/`](./ts-pure-sdk/) - TypeScript SDK

High-level TypeScript/JavaScript SDK:

- Pure idiomatic TypeScript
- HD key management for swap parameters
- Storage providers (LocalStorage, IndexedDB, Memory, SQLite via node-sdk)
- Published as `@lendasat/lendaswap-sdk-pure` on npm

### [`examples/`](./examples/) - Example Projects

Example implementations:

- [`examples/pure-ts/`](./examples/pure-ts/) - CLI example using the pure TypeScript SDK

## Building

This project uses [Just](https://github.com/casey/just) as a command runner.

```bash
# Build the TypeScript SDK
just build-sdk
```

## License

MIT
