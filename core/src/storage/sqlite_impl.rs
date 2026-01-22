//! SQLite storage implementation with flat database schema.
//!
//! This module provides persistent storage using SQLite with proper columnar storage
//! for better queryability and migration support. Suitable for native applications
//! (CLI tools, Flutter apps, Node.js via napi-rs, etc.).

use super::{
    ExtendedSwapStorageData, ExtendedVtxoSwapStorageData, StorageFuture, SwapStorage,
    VtxoSwapStorage, WalletStorage,
};
use crate::api::{
    BtcToArkadeSwapResponse, BtcToEvmSwapResponse, EvmToBtcSwapResponse, GetSwapResponse,
    OnchainToEvmSwapResponse, SwapCommonFields, SwapStatus, TokenId, VtxoSwapResponse,
    VtxoSwapStatus,
};
use crate::types::SwapParams;
use rusqlite::{Connection, params};
use rust_decimal::prelude::ToPrimitive;
use std::path::Path;
use std::str::FromStr;
use std::sync::{Arc, Mutex};
use time::OffsetDateTime;
use uuid::Uuid;

/// Swap type discriminator for the registry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SwapType {
    BtcToEvm,
    EvmToBtc,
    BtcToArkade,
    OnchainToEvm,
}

impl SwapType {
    fn as_str(&self) -> &'static str {
        match self {
            SwapType::BtcToEvm => "BtcToEvm",
            SwapType::EvmToBtc => "EvmToBtc",
            SwapType::BtcToArkade => "BtcToArkade",
            SwapType::OnchainToEvm => "OnchainToEvm",
        }
    }

    fn from_str(s: &str) -> Option<Self> {
        match s {
            "BtcToEvm" => Some(SwapType::BtcToEvm),
            "EvmToBtc" => Some(SwapType::EvmToBtc),
            "BtcToArkade" => Some(SwapType::BtcToArkade),
            "OnchainToEvm" => Some(SwapType::OnchainToEvm),
            _ => None,
        }
    }
}

/// SQLite-based storage implementation with flat database schema.
///
/// This provides persistent storage using SQLite with proper columnar storage,
/// suitable for native applications (CLI tools, Flutter apps, Node.js via napi-rs, etc.).
///
/// # Example
///
/// ```rust,ignore
/// use lendaswap_core::SqliteStorage;
///
/// let storage = SqliteStorage::open("./lendaswap.db")?;
/// let client = Client::new(
///     url,
///     storage.clone(),
///     storage.clone(),
///     storage,
///     network,
///     arkade_url,
///     esplora_url,
/// );
/// ```
#[derive(Clone)]
pub struct SqliteStorage {
    conn: Arc<Mutex<Connection>>,
}

impl SqliteStorage {
    /// Open or create a SQLite database at the given path.
    ///
    /// Creates the necessary tables if they don't exist.
    pub fn open<P: AsRef<Path>>(path: P) -> std::result::Result<Self, rusqlite::Error> {
        let conn = Connection::open(path)?;
        let storage = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        storage.initialize_schema()?;
        Ok(storage)
    }

    /// Create an in-memory SQLite database (useful for testing).
    pub fn in_memory() -> std::result::Result<Self, rusqlite::Error> {
        let conn = Connection::open_in_memory()?;
        let storage = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        storage.initialize_schema()?;
        Ok(storage)
    }

    /// Initialize the database schema.
    fn initialize_schema(&self) -> std::result::Result<(), rusqlite::Error> {
        let conn = self.conn.lock().unwrap();

        // Wallet table
        conn.execute(
            "CREATE TABLE IF NOT EXISTS wallet (
                id TEXT PRIMARY KEY,
                mnemonic TEXT,
                key_index INTEGER NOT NULL DEFAULT 0
            )",
            [],
        )?;

        // Ensure default wallet row exists
        conn.execute(
            "INSERT OR IGNORE INTO wallet (id, key_index) VALUES ('default', 0)",
            [],
        )?;

        // Swap registry table to track which table contains each swap
        conn.execute(
            "CREATE TABLE IF NOT EXISTS swap_registry (
                swap_id TEXT PRIMARY KEY NOT NULL,
                swap_type TEXT NOT NULL
            )",
            [],
        )?;

        // BTC → EVM swaps table
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS btc_to_evm_swaps (
                swap_id TEXT PRIMARY KEY NOT NULL,
                -- Common fields
                status TEXT NOT NULL,
                hash_lock TEXT NOT NULL,
                fee_sats INTEGER NOT NULL,
                asset_amount REAL NOT NULL,
                sender_pk TEXT NOT NULL,
                receiver_pk TEXT NOT NULL,
                server_pk TEXT NOT NULL,
                evm_refund_locktime INTEGER NOT NULL,
                vhtlc_refund_locktime INTEGER NOT NULL,
                unilateral_claim_delay INTEGER NOT NULL,
                unilateral_refund_delay INTEGER NOT NULL,
                unilateral_refund_without_receiver_delay INTEGER NOT NULL,
                network TEXT NOT NULL,
                created_at TEXT NOT NULL,
                source_token TEXT NOT NULL,
                target_token TEXT NOT NULL,
                -- BtcToEvm specific
                htlc_address_evm TEXT NOT NULL,
                htlc_address_arkade TEXT NOT NULL,
                user_address_evm TEXT NOT NULL,
                ln_invoice TEXT NOT NULL,
                sats_receive INTEGER NOT NULL,
                bitcoin_htlc_claim_txid TEXT,
                bitcoin_htlc_fund_txid TEXT,
                evm_htlc_claim_txid TEXT,
                evm_htlc_fund_txid TEXT,
                -- SwapParams
                secret_key TEXT NOT NULL,
                public_key TEXT NOT NULL,
                preimage TEXT NOT NULL,
                preimage_hash TEXT NOT NULL,
                user_id TEXT NOT NULL,
                key_index INTEGER NOT NULL
            )
            "#,
            [],
        )?;

        // EVM → BTC swaps table
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS evm_to_btc_swaps (
                swap_id TEXT PRIMARY KEY NOT NULL,
                -- Common fields
                status TEXT NOT NULL,
                hash_lock TEXT NOT NULL,
                fee_sats INTEGER NOT NULL,
                asset_amount REAL NOT NULL,
                sender_pk TEXT NOT NULL,
                receiver_pk TEXT NOT NULL,
                server_pk TEXT NOT NULL,
                evm_refund_locktime INTEGER NOT NULL,
                vhtlc_refund_locktime INTEGER NOT NULL,
                unilateral_claim_delay INTEGER NOT NULL,
                unilateral_refund_delay INTEGER NOT NULL,
                unilateral_refund_without_receiver_delay INTEGER NOT NULL,
                network TEXT NOT NULL,
                created_at TEXT NOT NULL,
                source_token TEXT NOT NULL,
                target_token TEXT NOT NULL,
                -- EvmToBtc specific
                htlc_address_evm TEXT NOT NULL,
                htlc_address_arkade TEXT NOT NULL,
                user_address_evm TEXT NOT NULL,
                user_address_arkade TEXT,
                ln_invoice TEXT NOT NULL,
                sats_receive INTEGER NOT NULL,
                bitcoin_htlc_fund_txid TEXT,
                bitcoin_htlc_claim_txid TEXT,
                evm_htlc_claim_txid TEXT,
                evm_htlc_fund_txid TEXT,
                create_swap_tx TEXT,
                approve_tx TEXT,
                gelato_forwarder_address TEXT,
                gelato_user_nonce TEXT,
                gelato_user_deadline TEXT,
                source_token_address TEXT NOT NULL,
                source_amount REAL NOT NULL,
                target_amount INTEGER NOT NULL,
                -- SwapParams
                secret_key TEXT NOT NULL,
                public_key TEXT NOT NULL,
                preimage TEXT NOT NULL,
                preimage_hash TEXT NOT NULL,
                user_id TEXT NOT NULL,
                key_index INTEGER NOT NULL
            )
            "#,
            [],
        )?;

        // BTC → Arkade swaps table
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS btc_to_arkade_swaps (
                swap_id TEXT PRIMARY KEY NOT NULL,
                status TEXT NOT NULL,
                btc_htlc_address TEXT NOT NULL,
                asset_amount INTEGER NOT NULL,
                sats_receive INTEGER NOT NULL,
                fee_sats INTEGER NOT NULL,
                hash_lock TEXT NOT NULL,
                btc_refund_locktime INTEGER NOT NULL,
                arkade_vhtlc_address TEXT NOT NULL,
                target_arkade_address TEXT NOT NULL,
                btc_fund_txid TEXT,
                btc_claim_txid TEXT,
                arkade_fund_txid TEXT,
                arkade_claim_txid TEXT,
                network TEXT NOT NULL,
                created_at TEXT NOT NULL,
                -- VHTLC parameters
                server_vhtlc_pk TEXT NOT NULL,
                arkade_server_pk TEXT NOT NULL,
                vhtlc_refund_locktime INTEGER NOT NULL,
                unilateral_claim_delay INTEGER NOT NULL,
                unilateral_refund_delay INTEGER NOT NULL,
                unilateral_refund_without_receiver_delay INTEGER NOT NULL,
                source_token TEXT NOT NULL,
                target_token TEXT NOT NULL,
                source_amount INTEGER NOT NULL,
                target_amount INTEGER NOT NULL,
                -- SwapParams
                secret_key TEXT NOT NULL,
                public_key TEXT NOT NULL,
                preimage TEXT NOT NULL,
                preimage_hash TEXT NOT NULL,
                user_id TEXT NOT NULL,
                key_index INTEGER NOT NULL
            )
            "#,
            [],
        )?;

        // Onchain BTC → EVM swaps table
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS onchain_to_evm_swaps (
                swap_id TEXT PRIMARY KEY NOT NULL,
                status TEXT NOT NULL,
                btc_htlc_address TEXT NOT NULL,
                source_amount INTEGER NOT NULL,
                target_amount REAL NOT NULL,
                fee_sats INTEGER NOT NULL,
                hash_lock TEXT NOT NULL,
                btc_refund_locktime INTEGER NOT NULL,
                btc_fund_txid TEXT,
                btc_claim_txid TEXT,
                evm_fund_txid TEXT,
                evm_claim_txid TEXT,
                network TEXT NOT NULL,
                created_at TEXT NOT NULL,
                chain TEXT NOT NULL,
                client_evm_address TEXT NOT NULL,
                evm_htlc_address TEXT NOT NULL,
                server_evm_address TEXT NOT NULL,
                evm_refund_locktime INTEGER NOT NULL,
                source_token TEXT NOT NULL,
                target_token TEXT NOT NULL,
                -- SwapParams
                secret_key TEXT NOT NULL,
                public_key TEXT NOT NULL,
                preimage TEXT NOT NULL,
                preimage_hash TEXT NOT NULL,
                user_id TEXT NOT NULL,
                key_index INTEGER NOT NULL
            )
            "#,
            [],
        )?;

        // VTXO swaps table
        conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS vtxo_swaps (
                swap_id TEXT PRIMARY KEY NOT NULL,
                -- VtxoSwapResponse fields
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                -- Client VHTLC params
                client_vhtlc_address TEXT NOT NULL,
                client_fund_amount_sats INTEGER NOT NULL,
                client_pk TEXT NOT NULL,
                client_locktime INTEGER NOT NULL,
                client_unilateral_claim_delay INTEGER NOT NULL,
                client_unilateral_refund_delay INTEGER NOT NULL,
                client_unilateral_refund_without_receiver_delay INTEGER NOT NULL,
                -- Server VHTLC params
                server_vhtlc_address TEXT NOT NULL,
                server_fund_amount_sats INTEGER NOT NULL,
                server_pk TEXT NOT NULL,
                server_locktime INTEGER NOT NULL,
                server_unilateral_claim_delay INTEGER NOT NULL,
                server_unilateral_refund_delay INTEGER NOT NULL,
                server_unilateral_refund_without_receiver_delay INTEGER NOT NULL,
                -- Common params
                arkade_server_pk TEXT NOT NULL,
                preimage_hash_response TEXT NOT NULL,
                fee_sats INTEGER NOT NULL,
                network TEXT NOT NULL,
                -- SwapParams fields (stored as hex)
                secret_key TEXT NOT NULL,
                public_key TEXT NOT NULL,
                preimage TEXT NOT NULL,
                preimage_hash_params TEXT NOT NULL,
                user_id TEXT NOT NULL,
                key_index INTEGER NOT NULL
            )
            "#,
            [],
        )?;

        // Create indexes
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_btc_to_evm_swaps_status ON btc_to_evm_swaps(status)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_evm_to_btc_swaps_status ON evm_to_btc_swaps(status)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_btc_to_arkade_swaps_status ON btc_to_arkade_swaps(status)",
            [],
        )?;
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_vtxo_swaps_status ON vtxo_swaps(status)",
            [],
        )?;

        Ok(())
    }

    // =========================================================================
    // Swap Storage Helpers
    // =========================================================================

    fn store_btc_to_evm(
        conn: &Connection,
        swap_id: &str,
        r: &BtcToEvmSwapResponse,
        params: &SwapParams,
    ) -> Result<(), crate::Error> {
        let created_at = r
            .common
            .created_at
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default();

        conn.execute(
            r#"
            INSERT OR REPLACE INTO btc_to_evm_swaps (
                swap_id, status, hash_lock, fee_sats, asset_amount, sender_pk, receiver_pk, server_pk,
                evm_refund_locktime, vhtlc_refund_locktime, unilateral_claim_delay, unilateral_refund_delay,
                unilateral_refund_without_receiver_delay, network, created_at, source_token, target_token,
                htlc_address_evm, htlc_address_arkade, user_address_evm, ln_invoice, sats_receive,
                bitcoin_htlc_claim_txid, bitcoin_htlc_fund_txid, evm_htlc_claim_txid, evm_htlc_fund_txid,
                secret_key, public_key, preimage, preimage_hash, user_id, key_index
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32)
            "#,
            params![
                swap_id,
                format!("{:?}", r.common.status),
                r.common.hash_lock,
                r.common.fee_sats,
                r.common.asset_amount,
                r.common.sender_pk,
                r.common.receiver_pk,
                r.common.server_pk,
                r.common.evm_refund_locktime as i64,
                r.common.vhtlc_refund_locktime as i64,
                r.common.unilateral_claim_delay,
                r.common.unilateral_refund_delay,
                r.common.unilateral_refund_without_receiver_delay,
                r.common.network,
                created_at,
                r.common.source_token.as_str(),
                r.common.target_token.as_str(),
                r.htlc_address_evm,
                r.htlc_address_arkade,
                r.user_address_evm,
                r.ln_invoice,
                r.sats_receive,
                r.bitcoin_htlc_claim_txid,
                r.bitcoin_htlc_fund_txid,
                r.evm_htlc_claim_txid,
                r.evm_htlc_fund_txid,
                hex::encode(params.secret_key.secret_bytes()),
                hex::encode(params.public_key.serialize()),
                hex::encode(params.preimage),
                hex::encode(params.preimage_hash),
                hex::encode(params.user_id.serialize()),
                params.key_index as i64,
            ],
        )
        .map_err(|e| crate::Error::Storage(format!("Failed to store BtcToEvm swap: {}", e)))?;

        Ok(())
    }

    fn store_evm_to_btc(
        conn: &Connection,
        swap_id: &str,
        r: &EvmToBtcSwapResponse,
        params: &SwapParams,
    ) -> Result<(), crate::Error> {
        let created_at = r
            .common
            .created_at
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default();

        conn.execute(
            r#"
            INSERT OR REPLACE INTO evm_to_btc_swaps (
                swap_id, status, hash_lock, fee_sats, asset_amount, sender_pk, receiver_pk, server_pk,
                evm_refund_locktime, vhtlc_refund_locktime, unilateral_claim_delay, unilateral_refund_delay,
                unilateral_refund_without_receiver_delay, network, created_at, source_token, target_token,
                htlc_address_evm, htlc_address_arkade, user_address_evm, user_address_arkade, ln_invoice,
                sats_receive, bitcoin_htlc_fund_txid, bitcoin_htlc_claim_txid, evm_htlc_claim_txid,
                evm_htlc_fund_txid, create_swap_tx, approve_tx, gelato_forwarder_address, gelato_user_nonce,
                gelato_user_deadline, source_token_address, source_amount, target_amount, secret_key, public_key, preimage, preimage_hash,
                user_id, key_index
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34, ?35, ?36, ?37, ?38, ?39, ?40, ?41)
            "#,
            params![
                swap_id,
                format!("{:?}", r.common.status),
                r.common.hash_lock,
                r.common.fee_sats,
                r.common.asset_amount,
                r.common.sender_pk,
                r.common.receiver_pk,
                r.common.server_pk,
                r.common.evm_refund_locktime as i64,
                r.common.vhtlc_refund_locktime as i64,
                r.common.unilateral_claim_delay,
                r.common.unilateral_refund_delay,
                r.common.unilateral_refund_without_receiver_delay,
                r.common.network,
                created_at,
                r.common.source_token.as_str(),
                r.common.target_token.as_str(),
                r.htlc_address_evm,
                r.htlc_address_arkade,
                r.user_address_evm,
                r.user_address_arkade,
                r.ln_invoice,
                r.sats_receive,
                r.bitcoin_htlc_fund_txid,
                r.bitcoin_htlc_claim_txid,
                r.evm_htlc_claim_txid,
                r.evm_htlc_fund_txid,
                r.create_swap_tx,
                r.approve_tx,
                r.gelato_forwarder_address,
                r.gelato_user_nonce,
                r.gelato_user_deadline,
                r.source_token_address,
                r.source_amount,
                r.target_amount as i64,
                hex::encode(params.secret_key.secret_bytes()),
                hex::encode(params.public_key.serialize()),
                hex::encode(params.preimage),
                hex::encode(params.preimage_hash),
                hex::encode(params.user_id.serialize()),
                params.key_index as i64,
            ],
        )
        .map_err(|e| crate::Error::Storage(format!("Failed to store EvmToBtc swap: {}", e)))?;

        Ok(())
    }

    fn store_btc_to_arkade(
        conn: &Connection,
        swap_id: &str,
        r: &BtcToArkadeSwapResponse,
        params: &SwapParams,
    ) -> Result<(), crate::Error> {
        let created_at = r
            .created_at
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default();

        conn.execute(
            r#"
            INSERT OR REPLACE INTO btc_to_arkade_swaps (
                swap_id, status, btc_htlc_address, asset_amount, sats_receive, fee_sats, hash_lock,
                btc_refund_locktime, arkade_vhtlc_address, target_arkade_address,
                btc_fund_txid, btc_claim_txid, arkade_fund_txid, arkade_claim_txid, network, created_at,
                server_vhtlc_pk, arkade_server_pk, vhtlc_refund_locktime,
                unilateral_claim_delay, unilateral_refund_delay, unilateral_refund_without_receiver_delay,
                source_token, target_token, source_amount, target_amount, secret_key, public_key, preimage, preimage_hash, user_id, key_index
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32)
            "#,
            params![
                swap_id,
                format!("{:?}", r.status),
                r.btc_htlc_address,
                r.asset_amount,
                r.sats_receive,
                r.fee_sats,
                r.hash_lock,
                r.btc_refund_locktime,
                r.arkade_vhtlc_address,
                r.target_arkade_address,
                r.btc_fund_txid,
                r.btc_claim_txid,
                r.arkade_fund_txid,
                r.arkade_claim_txid,
                r.network,
                created_at,
                r.server_vhtlc_pk,
                r.arkade_server_pk,
                r.vhtlc_refund_locktime,
                r.unilateral_claim_delay,
                r.unilateral_refund_delay,
                r.unilateral_refund_without_receiver_delay,
                r.source_token.as_str(),
                r.target_token.as_str(),
                r.source_amount as i64,
                r.target_amount as i64,
                hex::encode(params.secret_key.secret_bytes()),
                hex::encode(params.public_key.serialize()),
                hex::encode(params.preimage),
                hex::encode(params.preimage_hash),
                hex::encode(params.user_id.serialize()),
                params.key_index as i64,
            ],
        )
        .map_err(|e| crate::Error::Storage(format!("Failed to store BtcToArkade swap: {}", e)))?;

        Ok(())
    }

    fn store_onchain_to_evm(
        conn: &Connection,
        swap_id: &str,
        r: &OnchainToEvmSwapResponse,
        params: &SwapParams,
    ) -> Result<(), crate::Error> {
        let created_at = r
            .created_at
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default();

        conn.execute(
            r#"
            INSERT OR REPLACE INTO onchain_to_evm_swaps (
                swap_id, status, btc_htlc_address, fee_sats, btc_server_pk,
                evm_hash_lock, btc_hash_lock, btc_refund_locktime, btc_fund_txid, btc_claim_txid, evm_fund_txid,
                evm_claim_txid, network, created_at, chain, client_evm_address, evm_htlc_address,
                server_evm_address, evm_refund_locktime, source_token, target_token,
                secret_key, public_key, preimage, preimage_hash, user_id, key_index, source_amount, target_amount
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28)
            "#,
            params![
                swap_id,
                format!("{:?}", r.status),
                r.btc_htlc_address,
                r.fee_sats,
                r.btc_server_pk,
                r.evm_hash_lock,
                r.btc_hash_lock,
                r.btc_refund_locktime,
                r.btc_fund_txid,
                r.btc_claim_txid,
                r.evm_fund_txid,
                r.evm_claim_txid,
                r.network,
                created_at,
                r.chain,
                r.client_evm_address,
                r.evm_htlc_address,
                r.server_evm_address,
                r.evm_refund_locktime,
                r.source_token.as_str(),
                r.target_token.as_str(),
                hex::encode(params.secret_key.secret_bytes()),
                hex::encode(params.public_key.serialize()),
                hex::encode(params.preimage),
                hex::encode(params.preimage_hash),
                hex::encode(params.user_id.serialize()),
                params.key_index as i64,
                r.source_amount as i64,
                r.target_amount.to_f64().expect("to fit")
            ],
        )
        .map_err(|e| crate::Error::Storage(format!("Failed to store OnchainToEvm swap: {}", e)))?;

        Ok(())
    }

    fn load_btc_to_evm(
        conn: &Connection,
        swap_id: &str,
    ) -> Result<Option<ExtendedSwapStorageData>, crate::Error> {
        let mut stmt = conn
            .prepare("SELECT * FROM btc_to_evm_swaps WHERE swap_id = ?1")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

        let result = stmt.query_row(params![swap_id], |row| Ok(Self::row_to_btc_to_evm(row)));

        match result {
            Ok(data) => Ok(Some(data?)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(crate::Error::Storage(format!("SQLite error: {}", e))),
        }
    }

    fn load_evm_to_btc(
        conn: &Connection,
        swap_id: &str,
    ) -> Result<Option<ExtendedSwapStorageData>, crate::Error> {
        let mut stmt = conn
            .prepare("SELECT * FROM evm_to_btc_swaps WHERE swap_id = ?1")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

        let result = stmt.query_row(params![swap_id], |row| Ok(Self::row_to_evm_to_btc(row)));

        match result {
            Ok(data) => Ok(Some(data?)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(crate::Error::Storage(format!("SQLite error: {}", e))),
        }
    }

    fn load_btc_to_arkade(
        conn: &Connection,
        swap_id: &str,
    ) -> Result<Option<ExtendedSwapStorageData>, crate::Error> {
        let mut stmt = conn
            .prepare("SELECT * FROM btc_to_arkade_swaps WHERE swap_id = ?1")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

        let result = stmt.query_row(params![swap_id], |row| Ok(Self::row_to_btc_to_arkade(row)));

        match result {
            Ok(data) => Ok(Some(data?)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(crate::Error::Storage(format!("SQLite error: {}", e))),
        }
    }

    fn load_onchain_to_evm(
        conn: &Connection,
        swap_id: &str,
    ) -> Result<Option<ExtendedSwapStorageData>, crate::Error> {
        let mut stmt = conn
            .prepare("SELECT * FROM onchain_to_evm_swaps WHERE swap_id = ?1")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

        let result = stmt.query_row(params![swap_id], |row| Ok(Self::row_to_onchain_to_evm(row)));

        match result {
            Ok(data) => Ok(Some(data?)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(crate::Error::Storage(format!("SQLite error: {}", e))),
        }
    }

    fn row_to_btc_to_evm(row: &rusqlite::Row) -> Result<ExtendedSwapStorageData, crate::Error> {
        let swap_id: String = row
            .get("swap_id")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let status: String = row
            .get("status")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let hash_lock: String = row
            .get("hash_lock")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let fee_sats: i64 = row
            .get("fee_sats")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let asset_amount: f64 = row
            .get("asset_amount")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let sender_pk: String = row
            .get("sender_pk")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let receiver_pk: String = row
            .get("receiver_pk")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let server_pk: String = row
            .get("server_pk")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let evm_refund_locktime: i64 = row
            .get("evm_refund_locktime")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let vhtlc_refund_locktime: i64 = row
            .get("vhtlc_refund_locktime")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let unilateral_claim_delay: i64 = row
            .get("unilateral_claim_delay")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let unilateral_refund_delay: i64 = row
            .get("unilateral_refund_delay")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let unilateral_refund_without_receiver_delay: i64 = row
            .get("unilateral_refund_without_receiver_delay")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let network: String = row
            .get("network")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let created_at: String = row
            .get("created_at")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let source_token: String = row
            .get("source_token")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let target_token: String = row
            .get("target_token")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let htlc_address_evm: String = row
            .get("htlc_address_evm")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let htlc_address_arkade: String = row
            .get("htlc_address_arkade")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let user_address_evm: String = row
            .get("user_address_evm")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let ln_invoice: String = row
            .get("ln_invoice")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let sats_receive: i64 = row
            .get("sats_receive")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let bitcoin_htlc_claim_txid: Option<String> = row.get("bitcoin_htlc_claim_txid").ok();
        let bitcoin_htlc_fund_txid: Option<String> = row.get("bitcoin_htlc_fund_txid").ok();
        let evm_htlc_claim_txid: Option<String> = row.get("evm_htlc_claim_txid").ok();
        let evm_htlc_fund_txid: Option<String> = row.get("evm_htlc_fund_txid").ok();
        let secret_key: String = row
            .get("secret_key")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let public_key: String = row
            .get("public_key")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let preimage: String = row
            .get("preimage")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let preimage_hash: String = row
            .get("preimage_hash")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let user_id: String = row
            .get("user_id")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let key_index: i64 = row
            .get("key_index")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

        let id = Uuid::from_str(&swap_id)
            .map_err(|e| crate::Error::Storage(format!("Failed to parse swap_id: {}", e)))?;
        let status = parse_swap_status(&status)?;
        let created_at =
            OffsetDateTime::parse(&created_at, &time::format_description::well_known::Rfc3339)
                .map_err(|e| crate::Error::Storage(format!("Failed to parse created_at: {}", e)))?;

        let source_amount: i64 = row.get("source_amount").unwrap_or(sats_receive);
        let target_amount: f64 = row.get("target_amount").unwrap_or(asset_amount);

        let swap_params = parse_swap_params(
            &secret_key,
            &public_key,
            &preimage,
            &preimage_hash,
            &user_id,
            key_index,
        )?;

        let common = SwapCommonFields {
            id,
            status,
            hash_lock,
            fee_sats,
            asset_amount,
            sender_pk,
            receiver_pk,
            server_pk,
            evm_refund_locktime: evm_refund_locktime as u32,
            vhtlc_refund_locktime: vhtlc_refund_locktime as u32,
            unilateral_claim_delay,
            unilateral_refund_delay,
            unilateral_refund_without_receiver_delay,
            network,
            created_at,
            source_token: parse_token_id(&source_token),
            target_token: parse_token_id(&target_token),
        };

        let response = BtcToEvmSwapResponse {
            common,
            htlc_address_evm,
            htlc_address_arkade,
            user_address_evm,
            ln_invoice,
            sats_receive,
            bitcoin_htlc_claim_txid,
            bitcoin_htlc_fund_txid,
            evm_htlc_claim_txid,
            evm_htlc_fund_txid,
            target_amount: Some(target_amount),
            source_amount: Some(source_amount as u64),
        };

        Ok(ExtendedSwapStorageData {
            response: GetSwapResponse::BtcToEvm(response),
            swap_params,
        })
    }

    fn row_to_evm_to_btc(row: &rusqlite::Row) -> Result<ExtendedSwapStorageData, crate::Error> {
        let swap_id: String = row
            .get("swap_id")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let status: String = row
            .get("status")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let hash_lock: String = row
            .get("hash_lock")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let fee_sats: i64 = row
            .get("fee_sats")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let asset_amount: f64 = row
            .get("asset_amount")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let sender_pk: String = row
            .get("sender_pk")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let receiver_pk: String = row
            .get("receiver_pk")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let server_pk: String = row
            .get("server_pk")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let evm_refund_locktime: i64 = row
            .get("evm_refund_locktime")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let vhtlc_refund_locktime: i64 = row
            .get("vhtlc_refund_locktime")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let unilateral_claim_delay: i64 = row
            .get("unilateral_claim_delay")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let unilateral_refund_delay: i64 = row
            .get("unilateral_refund_delay")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let unilateral_refund_without_receiver_delay: i64 = row
            .get("unilateral_refund_without_receiver_delay")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let network: String = row
            .get("network")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let created_at: String = row
            .get("created_at")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let source_token: String = row
            .get("source_token")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let target_token: String = row
            .get("target_token")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let htlc_address_evm: String = row
            .get("htlc_address_evm")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let htlc_address_arkade: String = row
            .get("htlc_address_arkade")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let user_address_evm: String = row
            .get("user_address_evm")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let user_address_arkade: Option<String> = row.get("user_address_arkade").ok();
        let ln_invoice: String = row
            .get("ln_invoice")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let sats_receive: i64 = row
            .get("sats_receive")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let bitcoin_htlc_fund_txid: Option<String> = row.get("bitcoin_htlc_fund_txid").ok();
        let bitcoin_htlc_claim_txid: Option<String> = row.get("bitcoin_htlc_claim_txid").ok();
        let evm_htlc_claim_txid: Option<String> = row.get("evm_htlc_claim_txid").ok();
        let evm_htlc_fund_txid: Option<String> = row.get("evm_htlc_fund_txid").ok();
        let create_swap_tx: Option<String> = row.get("create_swap_tx").ok();
        let approve_tx: Option<String> = row.get("approve_tx").ok();
        let gelato_forwarder_address: Option<String> = row.get("gelato_forwarder_address").ok();
        let gelato_user_nonce: Option<String> = row.get("gelato_user_nonce").ok();
        let gelato_user_deadline: Option<String> = row.get("gelato_user_deadline").ok();
        let source_token_address: String = row
            .get("source_token_address")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let source_amount: f64 = row
            .get("source_amount")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let target_amount: i64 = row
            .get("target_amount")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let secret_key: String = row
            .get("secret_key")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let public_key: String = row
            .get("public_key")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let preimage: String = row
            .get("preimage")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let preimage_hash: String = row
            .get("preimage_hash")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let user_id: String = row
            .get("user_id")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let key_index: i64 = row
            .get("key_index")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

        let id = Uuid::from_str(&swap_id)
            .map_err(|e| crate::Error::Storage(format!("Failed to parse swap_id: {}", e)))?;
        let status = parse_swap_status(&status)?;
        let created_at =
            OffsetDateTime::parse(&created_at, &time::format_description::well_known::Rfc3339)
                .map_err(|e| crate::Error::Storage(format!("Failed to parse created_at: {}", e)))?;
        let swap_params = parse_swap_params(
            &secret_key,
            &public_key,
            &preimage,
            &preimage_hash,
            &user_id,
            key_index,
        )?;

        let common = SwapCommonFields {
            id,
            status,
            hash_lock,
            fee_sats,
            asset_amount,
            sender_pk,
            receiver_pk,
            server_pk,
            evm_refund_locktime: evm_refund_locktime as u32,
            vhtlc_refund_locktime: vhtlc_refund_locktime as u32,
            unilateral_claim_delay,
            unilateral_refund_delay,
            unilateral_refund_without_receiver_delay,
            network,
            created_at,
            source_token: parse_token_id(&source_token),
            target_token: parse_token_id(&target_token),
        };

        let response = EvmToBtcSwapResponse {
            common,
            htlc_address_evm,
            htlc_address_arkade,
            user_address_evm,
            user_address_arkade,
            ln_invoice,
            sats_receive,
            bitcoin_htlc_fund_txid,
            bitcoin_htlc_claim_txid,
            evm_htlc_claim_txid,
            evm_htlc_fund_txid,
            create_swap_tx,
            approve_tx,
            gelato_forwarder_address,
            gelato_user_nonce,
            gelato_user_deadline,
            source_token_address,
            source_amount,
            target_amount: target_amount as u64,
        };

        Ok(ExtendedSwapStorageData {
            response: GetSwapResponse::EvmToBtc(response),
            swap_params,
        })
    }

    fn row_to_btc_to_arkade(row: &rusqlite::Row) -> Result<ExtendedSwapStorageData, crate::Error> {
        let swap_id: String = row
            .get("swap_id")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let status: String = row
            .get("status")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let btc_htlc_address: String = row
            .get("btc_htlc_address")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let asset_amount: i64 = row
            .get("asset_amount")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let sats_receive: i64 = row
            .get("sats_receive")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let fee_sats: i64 = row
            .get("fee_sats")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let hash_lock: String = row
            .get("hash_lock")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let btc_refund_locktime: i64 = row
            .get("btc_refund_locktime")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let arkade_vhtlc_address: String = row
            .get("arkade_vhtlc_address")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let target_arkade_address: String = row
            .get("target_arkade_address")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let btc_fund_txid: Option<String> = row.get("btc_fund_txid").ok();
        let btc_claim_txid: Option<String> = row.get("btc_claim_txid").ok();
        let arkade_fund_txid: Option<String> = row.get("arkade_fund_txid").ok();
        let arkade_claim_txid: Option<String> = row.get("arkade_claim_txid").ok();
        let network: String = row
            .get("network")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let created_at: String = row
            .get("created_at")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let server_vhtlc_pk: String = row
            .get("server_vhtlc_pk")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let arkade_server_pk: String = row
            .get("arkade_server_pk")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let vhtlc_refund_locktime: i64 = row
            .get("vhtlc_refund_locktime")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let unilateral_claim_delay: i64 = row
            .get("unilateral_claim_delay")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let unilateral_refund_delay: i64 = row
            .get("unilateral_refund_delay")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let unilateral_refund_without_receiver_delay: i64 = row
            .get("unilateral_refund_without_receiver_delay")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let source_token: String = row
            .get("source_token")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let target_token: String = row
            .get("target_token")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let source_amount: i64 = row
            .get("source_amount")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let target_amount: i64 = row
            .get("target_amount")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let secret_key: String = row
            .get("secret_key")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let public_key: String = row
            .get("public_key")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let preimage: String = row
            .get("preimage")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let preimage_hash: String = row
            .get("preimage_hash")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let user_id: String = row
            .get("user_id")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let key_index: i64 = row
            .get("key_index")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

        let id = Uuid::from_str(&swap_id)
            .map_err(|e| crate::Error::Storage(format!("Failed to parse swap_id: {}", e)))?;
        let status = parse_swap_status(&status)?;
        let created_at =
            OffsetDateTime::parse(&created_at, &time::format_description::well_known::Rfc3339)
                .map_err(|e| crate::Error::Storage(format!("Failed to parse created_at: {}", e)))?;
        let swap_params = parse_swap_params(
            &secret_key,
            &public_key,
            &preimage,
            &preimage_hash,
            &user_id,
            key_index,
        )?;

        let response = BtcToArkadeSwapResponse {
            id,
            status,
            btc_htlc_address,
            asset_amount,
            sats_receive,
            fee_sats,
            hash_lock,
            btc_refund_locktime,
            arkade_vhtlc_address,
            target_arkade_address,
            btc_fund_txid,
            btc_claim_txid,
            arkade_fund_txid,
            arkade_claim_txid,
            network,
            created_at,
            server_vhtlc_pk,
            arkade_server_pk,
            vhtlc_refund_locktime,
            unilateral_claim_delay,
            unilateral_refund_delay,
            unilateral_refund_without_receiver_delay,
            source_token: parse_token_id(&source_token),
            target_token: parse_token_id(&target_token),
            source_amount: source_amount as u64,
            target_amount: target_amount as u64,
        };

        Ok(ExtendedSwapStorageData {
            response: GetSwapResponse::BtcToArkade(response),
            swap_params,
        })
    }

    fn row_to_onchain_to_evm(row: &rusqlite::Row) -> Result<ExtendedSwapStorageData, crate::Error> {
        let swap_id: String = row
            .get("swap_id")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let status: String = row
            .get("status")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let btc_htlc_address: String = row
            .get("btc_htlc_address")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let source_amount: i64 = row
            .get("source_amount")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let target_amount: f64 = row
            .get("target_amount")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let fee_sats: i64 = row
            .get("fee_sats")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let evm_hash_lock: String = row
            .get("evm_hash_lock")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let btc_hash_lock: String = row
            .get("btc_hash_lock")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let btc_server_pk: String = row
            .get("btc_server_pk")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let btc_refund_locktime: i64 = row
            .get("btc_refund_locktime")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let btc_fund_txid: Option<String> = row.get("btc_fund_txid").ok();
        let btc_claim_txid: Option<String> = row.get("btc_claim_txid").ok();
        let evm_fund_txid: Option<String> = row.get("evm_fund_txid").ok();
        let evm_claim_txid: Option<String> = row.get("evm_claim_txid").ok();
        let network: String = row
            .get("network")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let created_at: String = row
            .get("created_at")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let chain: String = row
            .get("chain")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let client_evm_address: String = row
            .get("client_evm_address")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let evm_htlc_address: String = row
            .get("evm_htlc_address")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let server_evm_address: String = row
            .get("server_evm_address")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let evm_refund_locktime: i64 = row
            .get("evm_refund_locktime")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let source_token: String = row
            .get("source_token")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let target_token: String = row
            .get("target_token")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let secret_key: String = row
            .get("secret_key")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let public_key: String = row
            .get("public_key")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let preimage: String = row
            .get("preimage")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let preimage_hash: String = row
            .get("preimage_hash")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let user_id: String = row
            .get("user_id")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let key_index: i64 = row
            .get("key_index")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

        let id = Uuid::from_str(&swap_id)
            .map_err(|e| crate::Error::Storage(format!("Failed to parse swap_id: {}", e)))?;
        let status = parse_swap_status(&status)?;
        let created_at =
            OffsetDateTime::parse(&created_at, &time::format_description::well_known::Rfc3339)
                .map_err(|e| crate::Error::Storage(format!("Failed to parse created_at: {}", e)))?;
        let swap_params = parse_swap_params(
            &secret_key,
            &public_key,
            &preimage,
            &preimage_hash,
            &user_id,
            key_index,
        )?;

        let response = OnchainToEvmSwapResponse {
            id,
            status,
            btc_htlc_address,
            source_amount: source_amount as u64,
            target_amount,
            fee_sats,
            btc_server_pk,
            evm_hash_lock,
            btc_hash_lock,
            btc_refund_locktime,
            btc_fund_txid,
            btc_claim_txid,
            evm_fund_txid,
            evm_claim_txid,
            network,
            created_at,
            chain,
            client_evm_address,
            evm_htlc_address,
            server_evm_address,
            evm_refund_locktime,
            source_token: parse_token_id(&source_token),
            target_token: parse_token_id(&target_token),
        };

        Ok(ExtendedSwapStorageData {
            response: GetSwapResponse::OnchainToEvm(response),
            swap_params,
        })
    }

    // =========================================================================
    // VTXO Swap Storage Helpers
    // =========================================================================

    fn store_vtxo_swap(
        conn: &Connection,
        swap_id: &str,
        response: &VtxoSwapResponse,
        params: &SwapParams,
    ) -> Result<(), crate::Error> {
        let created_at = response
            .created_at
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default();

        conn.execute(
            r#"
            INSERT OR REPLACE INTO vtxo_swaps (
                swap_id, status, created_at,
                client_vhtlc_address, client_fund_amount_sats, client_pk,
                client_locktime, client_unilateral_claim_delay,
                client_unilateral_refund_delay, client_unilateral_refund_without_receiver_delay,
                server_vhtlc_address, server_fund_amount_sats, server_pk,
                server_locktime, server_unilateral_claim_delay,
                server_unilateral_refund_delay, server_unilateral_refund_without_receiver_delay,
                arkade_server_pk, preimage_hash_response, fee_sats, network,
                secret_key, public_key, preimage, preimage_hash_params, user_id, key_index
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27)
            "#,
            params![
                swap_id,
                format!("{:?}", response.status),
                created_at,
                response.client_vhtlc_address,
                response.client_fund_amount_sats,
                response.client_pk,
                response.client_locktime as i64,
                response.client_unilateral_claim_delay,
                response.client_unilateral_refund_delay,
                response.client_unilateral_refund_without_receiver_delay,
                response.server_vhtlc_address,
                response.server_fund_amount_sats,
                response.server_pk,
                response.server_locktime as i64,
                response.server_unilateral_claim_delay,
                response.server_unilateral_refund_delay,
                response.server_unilateral_refund_without_receiver_delay,
                response.arkade_server_pk,
                response.preimage_hash,
                response.fee_sats,
                response.network,
                hex::encode(params.secret_key.secret_bytes()),
                hex::encode(params.public_key.serialize()),
                hex::encode(params.preimage),
                hex::encode(params.preimage_hash),
                hex::encode(params.user_id.serialize()),
                params.key_index as i64,
            ],
        )
        .map_err(|e| crate::Error::Storage(format!("Failed to store VTXO swap: {}", e)))?;

        Ok(())
    }

    fn row_to_vtxo_swap(row: &rusqlite::Row) -> Result<ExtendedVtxoSwapStorageData, crate::Error> {
        let swap_id: String = row
            .get("swap_id")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let status: String = row
            .get("status")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let created_at: String = row
            .get("created_at")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let client_vhtlc_address: String = row
            .get("client_vhtlc_address")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let client_fund_amount_sats: i64 = row
            .get("client_fund_amount_sats")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let client_pk: String = row
            .get("client_pk")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let client_locktime: i64 = row
            .get("client_locktime")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let client_unilateral_claim_delay: i64 = row
            .get("client_unilateral_claim_delay")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let client_unilateral_refund_delay: i64 = row
            .get("client_unilateral_refund_delay")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let client_unilateral_refund_without_receiver_delay: i64 = row
            .get("client_unilateral_refund_without_receiver_delay")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let server_vhtlc_address: String = row
            .get("server_vhtlc_address")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let server_fund_amount_sats: i64 = row
            .get("server_fund_amount_sats")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let server_pk: String = row
            .get("server_pk")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let server_locktime: i64 = row
            .get("server_locktime")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let server_unilateral_claim_delay: i64 = row
            .get("server_unilateral_claim_delay")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let server_unilateral_refund_delay: i64 = row
            .get("server_unilateral_refund_delay")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let server_unilateral_refund_without_receiver_delay: i64 = row
            .get("server_unilateral_refund_without_receiver_delay")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let arkade_server_pk: String = row
            .get("arkade_server_pk")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let preimage_hash_response: String = row
            .get("preimage_hash_response")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let fee_sats: i64 = row
            .get("fee_sats")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let network: String = row
            .get("network")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let secret_key: String = row
            .get("secret_key")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let public_key: String = row
            .get("public_key")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let preimage: String = row
            .get("preimage")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let preimage_hash_params: String = row
            .get("preimage_hash_params")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let user_id: String = row
            .get("user_id")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
        let key_index: i64 = row
            .get("key_index")
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

        let id = Uuid::from_str(&swap_id)
            .map_err(|e| crate::Error::Storage(format!("Failed to parse swap_id: {}", e)))?;
        let status = parse_vtxo_swap_status(&status)?;
        let created_at =
            OffsetDateTime::parse(&created_at, &time::format_description::well_known::Rfc3339)
                .map_err(|e| crate::Error::Storage(format!("Failed to parse created_at: {}", e)))?;
        let swap_params = parse_swap_params(
            &secret_key,
            &public_key,
            &preimage,
            &preimage_hash_params,
            &user_id,
            key_index,
        )?;

        let response = VtxoSwapResponse {
            id,
            status,
            created_at,
            client_vhtlc_address,
            client_fund_amount_sats,
            client_pk,
            client_locktime: client_locktime as u64,
            client_unilateral_claim_delay,
            client_unilateral_refund_delay,
            client_unilateral_refund_without_receiver_delay,
            server_vhtlc_address,
            server_fund_amount_sats,
            server_pk,
            server_locktime: server_locktime as u64,
            server_unilateral_claim_delay,
            server_unilateral_refund_delay,
            server_unilateral_refund_without_receiver_delay,
            arkade_server_pk,
            preimage_hash: preimage_hash_response,
            fee_sats,
            network,
        };

        Ok(ExtendedVtxoSwapStorageData {
            response,
            swap_params,
        })
    }
}

// ============================================================================
// Helper functions
// ============================================================================

fn parse_token_id(s: &str) -> TokenId {
    match s {
        "btc_lightning" => TokenId::BtcLightning,
        "btc_arkade" => TokenId::BtcArkade,
        "btc_onchain" => TokenId::BtcOnchain,
        other => TokenId::Coin(other.to_string()),
    }
}

fn parse_swap_status(s: &str) -> Result<SwapStatus, crate::Error> {
    match s {
        "Pending" => Ok(SwapStatus::Pending),
        "ClientFundingSeen" => Ok(SwapStatus::ClientFundingSeen),
        "ClientFunded" => Ok(SwapStatus::ClientFunded),
        "ServerFunded" => Ok(SwapStatus::ServerFunded),
        "ClientRedeeming" => Ok(SwapStatus::ClientRedeeming),
        "ClientRedeemed" => Ok(SwapStatus::ClientRedeemed),
        "ServerRedeemed" => Ok(SwapStatus::ServerRedeemed),
        "Expired" => Ok(SwapStatus::Expired),
        "ClientRefunded" => Ok(SwapStatus::ClientRefunded),
        "ClientFundedServerRefunded" => Ok(SwapStatus::ClientFundedServerRefunded),
        "ClientRefundedServerFunded" => Ok(SwapStatus::ClientRefundedServerFunded),
        "ClientRefundedServerRefunded" => Ok(SwapStatus::ClientRefundedServerRefunded),
        "ClientInvalidFunded" => Ok(SwapStatus::ClientInvalidFunded),
        "ClientFundedTooLate" => Ok(SwapStatus::ClientFundedTooLate),
        "ClientRedeemedAndClientRefunded" => Ok(SwapStatus::ClientRedeemedAndClientRefunded),
        _ => Err(crate::Error::Storage(format!("Unknown SwapStatus: {}", s))),
    }
}

fn parse_vtxo_swap_status(s: &str) -> Result<VtxoSwapStatus, crate::Error> {
    match s {
        "Pending" => Ok(VtxoSwapStatus::Pending),
        "ClientFunded" => Ok(VtxoSwapStatus::ClientFunded),
        "ServerFunded" => Ok(VtxoSwapStatus::ServerFunded),
        "ClientRedeemed" => Ok(VtxoSwapStatus::ClientRedeemed),
        "ServerRedeemed" => Ok(VtxoSwapStatus::ServerRedeemed),
        "ClientRefunded" => Ok(VtxoSwapStatus::ClientRefunded),
        "ClientFundedServerRefunded" => Ok(VtxoSwapStatus::ClientFundedServerRefunded),
        "Expired" => Ok(VtxoSwapStatus::Expired),
        _ => Err(crate::Error::Storage(format!(
            "Unknown VtxoSwapStatus: {}",
            s
        ))),
    }
}

fn parse_swap_params(
    secret_key: &str,
    public_key: &str,
    preimage: &str,
    preimage_hash: &str,
    user_id: &str,
    key_index: i64,
) -> Result<SwapParams, crate::Error> {
    let secret_key_bytes = hex::decode(secret_key)
        .map_err(|e| crate::Error::Storage(format!("Failed to decode secret_key: {}", e)))?;
    let secret_key = bitcoin::secp256k1::SecretKey::from_slice(&secret_key_bytes)
        .map_err(|e| crate::Error::Storage(format!("Failed to parse secret_key: {}", e)))?;

    let public_key_bytes = hex::decode(public_key)
        .map_err(|e| crate::Error::Storage(format!("Failed to decode public_key: {}", e)))?;
    let public_key = bitcoin::secp256k1::PublicKey::from_slice(&public_key_bytes)
        .map_err(|e| crate::Error::Storage(format!("Failed to parse public_key: {}", e)))?;

    let preimage_bytes = hex::decode(preimage)
        .map_err(|e| crate::Error::Storage(format!("Failed to decode preimage: {}", e)))?;
    let preimage: [u8; 32] = preimage_bytes
        .try_into()
        .map_err(|_| crate::Error::Storage("Invalid preimage length".to_string()))?;

    let preimage_hash_bytes = hex::decode(preimage_hash)
        .map_err(|e| crate::Error::Storage(format!("Failed to decode preimage_hash: {}", e)))?;
    let preimage_hash: [u8; 32] = preimage_hash_bytes
        .try_into()
        .map_err(|_| crate::Error::Storage("Invalid preimage_hash length".to_string()))?;

    let user_id_bytes = hex::decode(user_id)
        .map_err(|e| crate::Error::Storage(format!("Failed to decode user_id: {}", e)))?;
    let user_id = bitcoin::secp256k1::PublicKey::from_slice(&user_id_bytes)
        .map_err(|e| crate::Error::Storage(format!("Failed to parse user_id: {}", e)))?;

    Ok(SwapParams {
        secret_key,
        public_key,
        preimage,
        preimage_hash,
        user_id,
        key_index: key_index as u32,
    })
}

// ============================================================================
// Trait Implementations
// ============================================================================

impl WalletStorage for SqliteStorage {
    fn get_mnemonic(&self) -> StorageFuture<'_, Option<String>> {
        Box::pin(async move {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn
                .prepare("SELECT mnemonic FROM wallet WHERE id = 'default'")
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            let mnemonic: Option<String> = stmt
                .query_row([], |row| row.get(0))
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            Ok(mnemonic)
        })
    }

    fn set_mnemonic(&self, mnemonic: &str) -> StorageFuture<'_, ()> {
        let mnemonic = mnemonic.to_string();
        Box::pin(async move {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "UPDATE wallet SET mnemonic = ?1 WHERE id = 'default'",
                params![mnemonic],
            )
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
            Ok(())
        })
    }

    fn get_key_index(&self) -> StorageFuture<'_, u32> {
        Box::pin(async move {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn
                .prepare("SELECT key_index FROM wallet WHERE id = 'default'")
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            let index: u32 = stmt
                .query_row([], |row| row.get(0))
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            Ok(index)
        })
    }

    fn set_key_index(&self, index: u32) -> StorageFuture<'_, ()> {
        Box::pin(async move {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "UPDATE wallet SET key_index = ?1 WHERE id = 'default'",
                params![index],
            )
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
            Ok(())
        })
    }
}

impl SwapStorage for SqliteStorage {
    fn get(&self, swap_id: &str) -> StorageFuture<'_, Option<ExtendedSwapStorageData>> {
        let swap_id = swap_id.to_string();
        Box::pin(async move {
            let conn = self.conn.lock().unwrap();

            // Look up swap type in registry
            let mut stmt = conn
                .prepare("SELECT swap_type FROM swap_registry WHERE swap_id = ?1")
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            let swap_type: Option<String> =
                stmt.query_row(params![&swap_id], |row| row.get(0)).ok();

            let swap_type = match swap_type.and_then(|t| SwapType::from_str(&t)) {
                Some(st) => st,
                None => return Ok(None),
            };

            drop(stmt);

            match swap_type {
                SwapType::BtcToEvm => Self::load_btc_to_evm(&conn, &swap_id),
                SwapType::EvmToBtc => Self::load_evm_to_btc(&conn, &swap_id),
                SwapType::BtcToArkade => Self::load_btc_to_arkade(&conn, &swap_id),
                SwapType::OnchainToEvm => Self::load_onchain_to_evm(&conn, &swap_id),
            }
        })
    }

    fn store(&self, swap_id: &str, data: &ExtendedSwapStorageData) -> StorageFuture<'_, ()> {
        let swap_id = swap_id.to_string();
        let data = data.clone();
        Box::pin(async move {
            let conn = self.conn.lock().unwrap();

            let swap_type = match &data.response {
                GetSwapResponse::BtcToEvm(_) => SwapType::BtcToEvm,
                GetSwapResponse::EvmToBtc(_) => SwapType::EvmToBtc,
                GetSwapResponse::BtcToArkade(_) => SwapType::BtcToArkade,
                GetSwapResponse::OnchainToEvm(_) => SwapType::OnchainToEvm,
            };

            // Update registry
            conn.execute(
                "INSERT OR REPLACE INTO swap_registry (swap_id, swap_type) VALUES (?1, ?2)",
                params![&swap_id, swap_type.as_str()],
            )
            .map_err(|e| crate::Error::Storage(format!("Failed to update registry: {}", e)))?;

            // Store in appropriate table
            match &data.response {
                GetSwapResponse::BtcToEvm(r) => {
                    Self::store_btc_to_evm(&conn, &swap_id, r, &data.swap_params)
                }
                GetSwapResponse::EvmToBtc(r) => {
                    Self::store_evm_to_btc(&conn, &swap_id, r, &data.swap_params)
                }
                GetSwapResponse::BtcToArkade(r) => {
                    Self::store_btc_to_arkade(&conn, &swap_id, r, &data.swap_params)
                }
                GetSwapResponse::OnchainToEvm(r) => {
                    Self::store_onchain_to_evm(&conn, &swap_id, r, &data.swap_params)
                }
            }
        })
    }

    fn delete(&self, swap_id: &str) -> StorageFuture<'_, ()> {
        let swap_id = swap_id.to_string();
        Box::pin(async move {
            let conn = self.conn.lock().unwrap();

            // Look up swap type first
            let mut stmt = conn
                .prepare("SELECT swap_type FROM swap_registry WHERE swap_id = ?1")
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            let swap_type: Option<String> =
                stmt.query_row(params![&swap_id], |row| row.get(0)).ok();

            drop(stmt);

            if let Some(swap_type) = swap_type {
                let table = match swap_type.as_str() {
                    "BtcToEvm" => "btc_to_evm_swaps",
                    "EvmToBtc" => "evm_to_btc_swaps",
                    "BtcToArkade" => "btc_to_arkade_swaps",
                    _ => return Ok(()),
                };

                conn.execute(
                    &format!("DELETE FROM {} WHERE swap_id = ?1", table),
                    params![&swap_id],
                )
                .map_err(|e| crate::Error::Storage(format!("Failed to delete swap: {}", e)))?;
            }

            // Delete from registry
            conn.execute(
                "DELETE FROM swap_registry WHERE swap_id = ?1",
                params![&swap_id],
            )
            .map_err(|e| crate::Error::Storage(format!("Failed to delete from registry: {}", e)))?;

            Ok(())
        })
    }

    fn list(&self) -> StorageFuture<'_, Vec<String>> {
        Box::pin(async move {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn
                .prepare("SELECT swap_id FROM swap_registry")
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            let ids: Vec<String> = stmt
                .query_map([], |row| row.get(0))
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?
                .filter_map(|r| r.ok())
                .collect();

            Ok(ids)
        })
    }

    fn get_all(&self) -> StorageFuture<'_, Vec<ExtendedSwapStorageData>> {
        Box::pin(async move {
            let conn = self.conn.lock().unwrap();
            let mut swaps = Vec::new();

            // Get all BtcToEvm swaps
            {
                let mut stmt = conn
                    .prepare("SELECT * FROM btc_to_evm_swaps")
                    .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

                let rows = stmt
                    .query_map([], |row| Ok(Self::row_to_btc_to_evm(row)))
                    .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

                for row in rows {
                    if let Ok(Ok(data)) = row {
                        swaps.push(data);
                    }
                }
            }

            // Get all EvmToBtc swaps
            {
                let mut stmt = conn
                    .prepare("SELECT * FROM evm_to_btc_swaps")
                    .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

                let rows = stmt
                    .query_map([], |row| Ok(Self::row_to_evm_to_btc(row)))
                    .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

                for row in rows {
                    if let Ok(Ok(data)) = row {
                        swaps.push(data);
                    }
                }
            }

            // Get all BtcToArkade swaps
            {
                let mut stmt = conn
                    .prepare("SELECT * FROM btc_to_arkade_swaps")
                    .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

                let rows = stmt
                    .query_map([], |row| Ok(Self::row_to_btc_to_arkade(row)))
                    .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

                for row in rows {
                    if let Ok(Ok(data)) = row {
                        swaps.push(data);
                    }
                }
            }

            Ok(swaps)
        })
    }
}

impl VtxoSwapStorage for SqliteStorage {
    fn get(&self, swap_id: &str) -> StorageFuture<'_, Option<ExtendedVtxoSwapStorageData>> {
        let swap_id = swap_id.to_string();
        Box::pin(async move {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn
                .prepare("SELECT * FROM vtxo_swaps WHERE swap_id = ?1")
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            let result = stmt.query_row(params![&swap_id], |row| Ok(Self::row_to_vtxo_swap(row)));

            match result {
                Ok(data) => Ok(Some(data?)),
                Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
                Err(e) => Err(crate::Error::Storage(format!("SQLite error: {}", e))),
            }
        })
    }

    fn store(&self, swap_id: &str, data: &ExtendedVtxoSwapStorageData) -> StorageFuture<'_, ()> {
        let swap_id = swap_id.to_string();
        let data = data.clone();
        Box::pin(async move {
            let conn = self.conn.lock().unwrap();
            Self::store_vtxo_swap(&conn, &swap_id, &data.response, &data.swap_params)
        })
    }

    fn delete(&self, swap_id: &str) -> StorageFuture<'_, ()> {
        let swap_id = swap_id.to_string();
        Box::pin(async move {
            let conn = self.conn.lock().unwrap();
            conn.execute(
                "DELETE FROM vtxo_swaps WHERE swap_id = ?1",
                params![&swap_id],
            )
            .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
            Ok(())
        })
    }

    fn list(&self) -> StorageFuture<'_, Vec<String>> {
        Box::pin(async move {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn
                .prepare("SELECT swap_id FROM vtxo_swaps")
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            let ids: Vec<String> = stmt
                .query_map([], |row| row.get(0))
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?
                .filter_map(|r| r.ok())
                .collect();

            Ok(ids)
        })
    }

    fn get_all(&self) -> StorageFuture<'_, Vec<ExtendedVtxoSwapStorageData>> {
        Box::pin(async move {
            let conn = self.conn.lock().unwrap();
            let mut stmt = conn
                .prepare("SELECT * FROM vtxo_swaps")
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            let rows = stmt
                .query_map([], |row| Ok(Self::row_to_vtxo_swap(row)))
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            let mut swaps = Vec::new();
            for row in rows {
                if let Ok(Ok(data)) = row {
                    swaps.push(data);
                }
            }

            Ok(swaps)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use bitcoin::secp256k1::{PublicKey, Secp256k1, SecretKey};

    // =========================================================================
    // Test Fixtures
    // =========================================================================

    fn create_test_swap_params(key_index: u32) -> SwapParams {
        let secp = Secp256k1::new();
        let secret_key = SecretKey::from_slice(&[key_index as u8 + 1; 32]).unwrap();
        let public_key = PublicKey::from_secret_key(&secp, &secret_key);
        let preimage = [key_index as u8 + 2; 32];
        let preimage_hash = [key_index as u8 + 3; 32];
        let user_id = public_key;

        SwapParams {
            secret_key,
            public_key,
            preimage,
            preimage_hash,
            user_id,
            key_index,
        }
    }

    fn create_test_btc_to_evm_swap(id: &str) -> (ExtendedSwapStorageData, String) {
        let swap_id = Uuid::parse_str(id).unwrap();
        let swap_params = create_test_swap_params(1);

        let common = SwapCommonFields {
            id: swap_id,
            status: SwapStatus::Pending,
            hash_lock: "0xdeadbeef".to_string(),
            fee_sats: 1000,
            asset_amount: 100.5,
            sender_pk: "02sender".to_string(),
            receiver_pk: "02receiver".to_string(),
            server_pk: "02server".to_string(),
            evm_refund_locktime: 3600,
            vhtlc_refund_locktime: 7200,
            unilateral_claim_delay: 100,
            unilateral_refund_delay: 200,
            unilateral_refund_without_receiver_delay: 300,
            network: "bitcoin".to_string(),
            created_at: OffsetDateTime::now_utc(),
            source_token: TokenId::BtcLightning,
            target_token: TokenId::Coin("usdc_pol".to_string()),
        };

        let response = BtcToEvmSwapResponse {
            common,
            htlc_address_evm: "0xhtlc".to_string(),
            htlc_address_arkade: "ark1htlc".to_string(),
            user_address_evm: "0xuser".to_string(),
            ln_invoice: "lnbc100u1...".to_string(),
            sats_receive: 50000,
            bitcoin_htlc_claim_txid: None,
            bitcoin_htlc_fund_txid: None,
            evm_htlc_claim_txid: None,
            evm_htlc_fund_txid: None,
            target_amount: Some(100.5),
            source_amount: Some(50000),
        };

        let data = ExtendedSwapStorageData {
            response: GetSwapResponse::BtcToEvm(response),
            swap_params,
        };

        (data, id.to_string())
    }

    fn create_test_evm_to_btc_swap(id: &str) -> (ExtendedSwapStorageData, String) {
        let swap_id = Uuid::parse_str(id).unwrap();
        let swap_params = create_test_swap_params(2);

        let common = SwapCommonFields {
            id: swap_id,
            status: SwapStatus::ClientFunded,
            hash_lock: "0xcafebabe".to_string(),
            fee_sats: 2000,
            asset_amount: 200.75,
            sender_pk: "02sender2".to_string(),
            receiver_pk: "02receiver2".to_string(),
            server_pk: "02server2".to_string(),
            evm_refund_locktime: 1800,
            vhtlc_refund_locktime: 3600,
            unilateral_claim_delay: 150,
            unilateral_refund_delay: 250,
            unilateral_refund_without_receiver_delay: 350,
            network: "bitcoin".to_string(),
            created_at: OffsetDateTime::now_utc(),
            source_token: TokenId::Coin("usdc_pol".to_string()),
            target_token: TokenId::BtcArkade,
        };

        let response = EvmToBtcSwapResponse {
            common,
            htlc_address_evm: "0xhtlc2".to_string(),
            htlc_address_arkade: "ark1htlc2".to_string(),
            user_address_evm: "0xuser2".to_string(),
            user_address_arkade: Some("ark1user2".to_string()),
            ln_invoice: "".to_string(),
            sats_receive: 75000,
            bitcoin_htlc_fund_txid: None,
            bitcoin_htlc_claim_txid: None,
            evm_htlc_claim_txid: Some("0xclaimtx".to_string()),
            evm_htlc_fund_txid: Some("0xfundtx".to_string()),
            create_swap_tx: Some("0xswaptx".to_string()),
            approve_tx: Some("0xapprovetx".to_string()),
            gelato_forwarder_address: Some("0xgelato".to_string()),
            gelato_user_nonce: Some("1".to_string()),
            gelato_user_deadline: Some("9999999999".to_string()),
            source_token_address: "0xusdc".to_string(),
            source_amount: 200.75,
            target_amount: 75000,
        };

        let data = ExtendedSwapStorageData {
            response: GetSwapResponse::EvmToBtc(response),
            swap_params,
        };

        (data, id.to_string())
    }

    fn create_test_btc_to_arkade_swap(id: &str) -> (ExtendedSwapStorageData, String) {
        let swap_id = Uuid::parse_str(id).unwrap();
        let swap_params = create_test_swap_params(3);

        let response = BtcToArkadeSwapResponse {
            id: swap_id,
            status: SwapStatus::ServerFunded,
            btc_htlc_address: "bc1qhtlc...".to_string(),
            asset_amount: 100000,
            sats_receive: 99000,
            fee_sats: 1000,
            hash_lock: "abcdef1234567890".to_string(),
            btc_refund_locktime: 144,
            arkade_vhtlc_address: "ark1vhtlc...".to_string(),
            target_arkade_address: "ark1target...".to_string(),
            btc_fund_txid: Some("btctxid123".to_string()),
            btc_claim_txid: None,
            arkade_fund_txid: Some("arkadetxid456".to_string()),
            arkade_claim_txid: None,
            network: "bitcoin".to_string(),
            created_at: OffsetDateTime::now_utc(),
            server_vhtlc_pk: "02servervhtlc".to_string(),
            arkade_server_pk: "02arkadeserver".to_string(),
            vhtlc_refund_locktime: 288,
            unilateral_claim_delay: 100,
            unilateral_refund_delay: 200,
            unilateral_refund_without_receiver_delay: 300,
            source_token: TokenId::BtcOnchain,
            target_token: TokenId::BtcArkade,
            source_amount: 100000,
            target_amount: 99000,
        };

        let data = ExtendedSwapStorageData {
            response: GetSwapResponse::BtcToArkade(response),
            swap_params,
        };

        (data, id.to_string())
    }

    fn create_test_vtxo_swap(id: &str) -> (ExtendedVtxoSwapStorageData, String) {
        let swap_id = Uuid::parse_str(id).unwrap();
        let swap_params = create_test_swap_params(4);

        let response = VtxoSwapResponse {
            id: swap_id,
            status: VtxoSwapStatus::Pending,
            created_at: OffsetDateTime::now_utc(),
            client_vhtlc_address: "ark1client...".to_string(),
            client_fund_amount_sats: 50000,
            client_pk: "02clientpk".to_string(),
            client_locktime: 1000000,
            client_unilateral_claim_delay: 100,
            client_unilateral_refund_delay: 200,
            client_unilateral_refund_without_receiver_delay: 300,
            server_vhtlc_address: "ark1server...".to_string(),
            server_fund_amount_sats: 49500,
            server_pk: "02serverpk".to_string(),
            server_locktime: 1000500,
            server_unilateral_claim_delay: 100,
            server_unilateral_refund_delay: 200,
            server_unilateral_refund_without_receiver_delay: 300,
            arkade_server_pk: "02arkade".to_string(),
            preimage_hash: "hash123".to_string(),
            fee_sats: 500,
            network: "bitcoin".to_string(),
        };

        let data = ExtendedVtxoSwapStorageData {
            response,
            swap_params,
        };

        (data, id.to_string())
    }

    // =========================================================================
    // Wallet Storage Tests
    // =========================================================================

    #[tokio::test]
    async fn test_wallet_storage() {
        let storage = SqliteStorage::in_memory().unwrap();

        // Initially no mnemonic
        assert!(storage.get_mnemonic().await.unwrap().is_none());

        // Set and get mnemonic
        storage.set_mnemonic("test mnemonic phrase").await.unwrap();
        assert_eq!(
            storage.get_mnemonic().await.unwrap(),
            Some("test mnemonic phrase".to_string())
        );

        // Key index starts at 0
        assert_eq!(storage.get_key_index().await.unwrap(), 0);

        // Set and get key index
        storage.set_key_index(5).await.unwrap();
        assert_eq!(storage.get_key_index().await.unwrap(), 5);
    }

    #[tokio::test]
    async fn test_wallet_storage_update_mnemonic() {
        let storage = SqliteStorage::in_memory().unwrap();

        // Set initial mnemonic
        storage.set_mnemonic("first mnemonic").await.unwrap();
        assert_eq!(
            storage.get_mnemonic().await.unwrap(),
            Some("first mnemonic".to_string())
        );

        // Update mnemonic
        storage.set_mnemonic("second mnemonic").await.unwrap();
        assert_eq!(
            storage.get_mnemonic().await.unwrap(),
            Some("second mnemonic".to_string())
        );
    }

    // =========================================================================
    // SwapStorage CRUD Tests - BtcToEvm
    // =========================================================================

    #[tokio::test]
    async fn test_btc_to_evm_swap_crud() {
        let storage = SqliteStorage::in_memory().unwrap();
        let (data, swap_id) = create_test_btc_to_evm_swap("11111111-1111-1111-1111-111111111111");

        // CREATE
        SwapStorage::store(&storage, &swap_id, &data).await.unwrap();

        // READ
        let retrieved = SwapStorage::get(&storage, &swap_id).await.unwrap();
        assert!(retrieved.is_some());
        let retrieved = retrieved.unwrap();
        if let GetSwapResponse::BtcToEvm(ref r) = retrieved.response {
            assert_eq!(r.common.id.to_string(), swap_id);
            assert_eq!(r.htlc_address_evm, "0xhtlc");
            assert_eq!(r.sats_receive, 50000);
        } else {
            panic!("Expected BtcToEvm response");
        }

        // LIST
        let ids = SwapStorage::list(&storage).await.unwrap();
        assert_eq!(ids.len(), 1);
        assert!(ids.contains(&swap_id));

        // UPDATE (change status)
        let mut updated_data = data.clone();
        if let GetSwapResponse::BtcToEvm(ref mut r) = updated_data.response {
            r.common.status = SwapStatus::ServerRedeemed;
            r.evm_htlc_fund_txid = Some("0xnewtxid".to_string());
        }
        SwapStorage::store(&storage, &swap_id, &updated_data)
            .await
            .unwrap();

        // Verify update
        let retrieved = SwapStorage::get(&storage, &swap_id).await.unwrap().unwrap();
        if let GetSwapResponse::BtcToEvm(ref r) = retrieved.response {
            assert_eq!(r.common.status, SwapStatus::ServerRedeemed);
            assert_eq!(r.evm_htlc_fund_txid, Some("0xnewtxid".to_string()));
        } else {
            panic!("Expected BtcToEvm response");
        }

        // DELETE
        SwapStorage::delete(&storage, &swap_id).await.unwrap();
        let deleted = SwapStorage::get(&storage, &swap_id).await.unwrap();
        assert!(deleted.is_none());

        // LIST should be empty
        let ids = SwapStorage::list(&storage).await.unwrap();
        assert!(ids.is_empty());
    }

    // =========================================================================
    // SwapStorage CRUD Tests - EvmToBtc
    // =========================================================================

    #[tokio::test]
    async fn test_evm_to_btc_swap_crud() {
        let storage = SqliteStorage::in_memory().unwrap();
        let (data, swap_id) = create_test_evm_to_btc_swap("22222222-2222-2222-2222-222222222222");

        // CREATE
        SwapStorage::store(&storage, &swap_id, &data).await.unwrap();

        // READ
        let retrieved = SwapStorage::get(&storage, &swap_id).await.unwrap();
        assert!(retrieved.is_some());
        let retrieved = retrieved.unwrap();
        if let GetSwapResponse::EvmToBtc(ref r) = retrieved.response {
            assert_eq!(r.common.id.to_string(), swap_id);
            assert_eq!(r.source_token_address, "0xusdc");
            assert_eq!(r.user_address_arkade, Some("ark1user2".to_string()));
        } else {
            panic!("Expected EvmToBtc response");
        }

        // UPDATE
        let mut updated_data = data.clone();
        if let GetSwapResponse::EvmToBtc(ref mut r) = updated_data.response {
            r.common.status = SwapStatus::ClientRedeemed;
            r.bitcoin_htlc_claim_txid = Some("btctxid".to_string());
        }
        SwapStorage::store(&storage, &swap_id, &updated_data)
            .await
            .unwrap();

        let retrieved = SwapStorage::get(&storage, &swap_id).await.unwrap().unwrap();
        if let GetSwapResponse::EvmToBtc(ref r) = retrieved.response {
            assert_eq!(r.common.status, SwapStatus::ClientRedeemed);
            assert_eq!(r.bitcoin_htlc_claim_txid, Some("btctxid".to_string()));
        } else {
            panic!("Expected EvmToBtc response");
        }

        // DELETE
        SwapStorage::delete(&storage, &swap_id).await.unwrap();
        assert!(
            SwapStorage::get(&storage, &swap_id)
                .await
                .unwrap()
                .is_none()
        );
    }

    // =========================================================================
    // SwapStorage CRUD Tests - BtcToArkade
    // =========================================================================

    #[tokio::test]
    async fn test_btc_to_arkade_swap_crud() {
        let storage = SqliteStorage::in_memory().unwrap();
        let (data, swap_id) =
            create_test_btc_to_arkade_swap("33333333-3333-3333-3333-333333333333");

        // CREATE
        SwapStorage::store(&storage, &swap_id, &data).await.unwrap();

        // READ
        let retrieved = SwapStorage::get(&storage, &swap_id).await.unwrap();
        assert!(retrieved.is_some());
        let retrieved = retrieved.unwrap();
        if let GetSwapResponse::BtcToArkade(ref r) = retrieved.response {
            assert_eq!(r.id.to_string(), swap_id);
            assert_eq!(r.asset_amount, 100000);
            assert_eq!(r.btc_fund_txid, Some("btctxid123".to_string()));
        } else {
            panic!("Expected BtcToArkade response");
        }

        // UPDATE
        let mut updated_data = data.clone();
        if let GetSwapResponse::BtcToArkade(ref mut r) = updated_data.response {
            r.status = SwapStatus::ClientRedeemed;
            r.arkade_claim_txid = Some("arkadeclaimtx".to_string());
        }
        SwapStorage::store(&storage, &swap_id, &updated_data)
            .await
            .unwrap();

        let retrieved = SwapStorage::get(&storage, &swap_id).await.unwrap().unwrap();
        if let GetSwapResponse::BtcToArkade(ref r) = retrieved.response {
            assert_eq!(r.status, SwapStatus::ClientRedeemed);
            assert_eq!(r.arkade_claim_txid, Some("arkadeclaimtx".to_string()));
        } else {
            panic!("Expected BtcToArkade response");
        }

        // DELETE
        SwapStorage::delete(&storage, &swap_id).await.unwrap();
        assert!(
            SwapStorage::get(&storage, &swap_id)
                .await
                .unwrap()
                .is_none()
        );
    }

    // =========================================================================
    // SwapStorage - Multiple Swaps and get_all
    // =========================================================================

    #[tokio::test]
    async fn test_swap_storage_multiple_swaps_get_all() {
        let storage = SqliteStorage::in_memory().unwrap();

        let (btc_to_evm, id1) = create_test_btc_to_evm_swap("11111111-1111-1111-1111-111111111111");
        let (evm_to_btc, id2) = create_test_evm_to_btc_swap("22222222-2222-2222-2222-222222222222");
        let (btc_to_arkade, id3) =
            create_test_btc_to_arkade_swap("33333333-3333-3333-3333-333333333333");

        // Store all
        SwapStorage::store(&storage, &id1, &btc_to_evm)
            .await
            .unwrap();
        SwapStorage::store(&storage, &id2, &evm_to_btc)
            .await
            .unwrap();
        SwapStorage::store(&storage, &id3, &btc_to_arkade)
            .await
            .unwrap();

        // Verify list
        let ids = SwapStorage::list(&storage).await.unwrap();
        assert_eq!(ids.len(), 3);

        // Verify get_all returns all swaps
        let all_swaps = SwapStorage::get_all(&storage).await.unwrap();
        assert_eq!(all_swaps.len(), 3);

        // Verify each type is present
        let mut has_btc_to_evm = false;
        let mut has_evm_to_btc = false;
        let mut has_btc_to_arkade = false;

        for swap in &all_swaps {
            match &swap.response {
                GetSwapResponse::BtcToEvm(_) => has_btc_to_evm = true,
                GetSwapResponse::EvmToBtc(_) => has_evm_to_btc = true,
                GetSwapResponse::BtcToArkade(_) => has_btc_to_arkade = true,
                GetSwapResponse::OnchainToEvm(_) => {}
            }
        }

        assert!(has_btc_to_evm, "Missing BtcToEvm swap");
        assert!(has_evm_to_btc, "Missing EvmToBtc swap");
        assert!(has_btc_to_arkade, "Missing BtcToArkade swap");

        // Delete one and verify
        SwapStorage::delete(&storage, &id1).await.unwrap();
        let all_swaps = SwapStorage::get_all(&storage).await.unwrap();
        assert_eq!(all_swaps.len(), 2);

        // Delete remaining
        SwapStorage::delete(&storage, &id2).await.unwrap();
        SwapStorage::delete(&storage, &id3).await.unwrap();
        let all_swaps = SwapStorage::get_all(&storage).await.unwrap();
        assert!(all_swaps.is_empty());
    }

    // =========================================================================
    // VtxoSwapStorage CRUD Tests
    // =========================================================================

    #[tokio::test]
    async fn test_vtxo_swap_crud() {
        let storage = SqliteStorage::in_memory().unwrap();
        let (data, swap_id) = create_test_vtxo_swap("44444444-4444-4444-4444-444444444444");

        // CREATE
        VtxoSwapStorage::store(&storage, &swap_id, &data)
            .await
            .unwrap();

        // READ
        let retrieved = VtxoSwapStorage::get(&storage, &swap_id).await.unwrap();
        assert!(retrieved.is_some());
        let retrieved = retrieved.unwrap();
        assert_eq!(retrieved.response.id.to_string(), swap_id);
        assert_eq!(retrieved.response.client_fund_amount_sats, 50000);
        assert_eq!(retrieved.response.server_fund_amount_sats, 49500);
        assert_eq!(retrieved.response.status, VtxoSwapStatus::Pending);

        // LIST
        let ids = VtxoSwapStorage::list(&storage).await.unwrap();
        assert_eq!(ids.len(), 1);
        assert!(ids.contains(&swap_id));

        // UPDATE
        let mut updated_data = data.clone();
        updated_data.response.status = VtxoSwapStatus::ClientRedeemed;
        VtxoSwapStorage::store(&storage, &swap_id, &updated_data)
            .await
            .unwrap();

        let retrieved = VtxoSwapStorage::get(&storage, &swap_id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(retrieved.response.status, VtxoSwapStatus::ClientRedeemed);

        // DELETE
        VtxoSwapStorage::delete(&storage, &swap_id).await.unwrap();
        let deleted = VtxoSwapStorage::get(&storage, &swap_id).await.unwrap();
        assert!(deleted.is_none());
    }

    #[tokio::test]
    async fn test_vtxo_swap_get_all() {
        let storage = SqliteStorage::in_memory().unwrap();

        let (data1, id1) = create_test_vtxo_swap("44444444-4444-4444-4444-444444444444");
        let (data2, id2) = create_test_vtxo_swap("55555555-5555-5555-5555-555555555555");

        VtxoSwapStorage::store(&storage, &id1, &data1)
            .await
            .unwrap();
        VtxoSwapStorage::store(&storage, &id2, &data2)
            .await
            .unwrap();

        let all_swaps = VtxoSwapStorage::get_all(&storage).await.unwrap();
        assert_eq!(all_swaps.len(), 2);

        // Cleanup
        VtxoSwapStorage::delete(&storage, &id1).await.unwrap();
        VtxoSwapStorage::delete(&storage, &id2).await.unwrap();

        let all_swaps = VtxoSwapStorage::get_all(&storage).await.unwrap();
        assert!(all_swaps.is_empty());
    }

    // =========================================================================
    // Edge Cases
    // =========================================================================

    #[tokio::test]
    async fn test_get_nonexistent_swap() {
        let storage = SqliteStorage::in_memory().unwrap();
        let result = SwapStorage::get(&storage, "nonexistent-id").await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_delete_nonexistent_swap() {
        let storage = SqliteStorage::in_memory().unwrap();
        // Should not error when deleting non-existent swap
        SwapStorage::delete(&storage, "nonexistent-id")
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn test_get_nonexistent_vtxo_swap() {
        let storage = SqliteStorage::in_memory().unwrap();
        let result = VtxoSwapStorage::get(&storage, "nonexistent-id")
            .await
            .unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_swap_params_roundtrip() {
        let storage = SqliteStorage::in_memory().unwrap();
        let (data, swap_id) = create_test_btc_to_evm_swap("66666666-6666-6666-6666-666666666666");

        // Store
        SwapStorage::store(&storage, &swap_id, &data).await.unwrap();

        // Retrieve and verify swap_params are correctly preserved
        let retrieved = SwapStorage::get(&storage, &swap_id).await.unwrap().unwrap();
        assert_eq!(retrieved.swap_params.key_index, data.swap_params.key_index);
        assert_eq!(retrieved.swap_params.preimage, data.swap_params.preimage);
        assert_eq!(
            retrieved.swap_params.preimage_hash,
            data.swap_params.preimage_hash
        );
        assert_eq!(
            retrieved.swap_params.public_key.serialize(),
            data.swap_params.public_key.serialize()
        );
        assert_eq!(
            retrieved.swap_params.secret_key.secret_bytes(),
            data.swap_params.secret_key.secret_bytes()
        );
    }
}
