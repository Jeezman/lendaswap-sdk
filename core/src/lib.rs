//! Lendaswap Client SDK - Core Library
//!
//! Platform-agnostic wallet functionality for HD key derivation and VHTLC operations.
//!
//! This crate provides the core wallet logic that can be used in both native Rust
//! applications and WebAssembly environments. Storage is abstracted through traits
//! that can be implemented for any backend (localStorage, IndexedDB, filesystem, etc.).

// Allow some lints at crate level - these are tedious to fix individually

//! # Example
//!
//! ```rust,ignore
//! use lendaswap_core::{Wallet, WalletStorage, Network};
//!
//! // Create a wallet with your storage implementation
//! let wallet = Wallet::new(my_wallet_storage, Network::Bitcoin);
//!
//! // Generate or retrieve mnemonic
//! let mnemonic = wallet.generate_or_get_mnemonic().await?;
//!
//! // Derive swap parameters
//! let params = wallet.derive_swap_params().await?;
//! ```

pub mod api;
pub mod client;
pub mod error;
pub mod esplora;
pub mod hd_wallet;
pub mod onchain_htlc;
pub mod storage;
pub mod types;
pub mod vhtlc;
pub mod vtxo_swap;
pub mod wallet;

pub use api::ApiClient;
pub use client::Client;
pub use client::ClientBuilder;
pub use client::ExtendedSwapStorageData;
pub use client::ExtendedVtxoSwapStorageData;
pub use error::Error;
pub use error::Result;
pub use hd_wallet::HdWallet;
pub use storage::StorageFuture;
pub use storage::SwapStorage;
pub use storage::VtxoSwapStorage;
pub use storage::WalletStorage;
pub use storage::WalletStorageExt;
#[cfg(feature = "sqlite")]
pub use storage::sqlite::SqliteStorage;
pub use types::Network;
pub use types::SwapParams;
pub use types::VhtlcAmounts;
pub use wallet::Wallet;
