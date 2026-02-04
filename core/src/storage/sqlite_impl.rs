//! SQLite storage implementation using sqlx with migration support.
//!
//! This module provides persistent storage using SQLite with proper migrations
//! via sqlx. Suitable for native applications (CLI tools, Flutter apps, Node.js
//! via napi-rs, etc.).

use super::{
    ExtendedSwapStorageData, ExtendedVtxoSwapStorageData, StorageFuture, SwapStorage,
    VtxoSwapStorage, WalletStorage,
};
use crate::api::{
    ArkadeToEvmSwapResponse, BtcToArkadeSwapResponse, BtcToEvmSwapResponse, EvmToBtcSwapResponse,
    GetSwapResponse, OnchainToEvmSwapResponse, SwapCommonFields, SwapStatus, TokenId,
    VtxoSwapResponse, VtxoSwapStatus,
};
use crate::types::SwapParams;
use sqlx::Row;
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::path::Path;
use std::str::FromStr;
use std::sync::Arc;
use time::OffsetDateTime;
use uuid::Uuid;

/// Parse SwapStatus from stored Debug format string.
fn parse_swap_status(s: &str) -> SwapStatus {
    // We store using Debug format (e.g., "Pending", "ClientFunded")
    // Try to parse via serde (expects lowercase)
    serde_json::from_str(&format!("\"{}\"", s.to_lowercase())).unwrap_or(SwapStatus::Pending)
}

/// Parse VtxoSwapStatus from stored Debug format string.
fn parse_vtxo_swap_status(s: &str) -> VtxoSwapStatus {
    serde_json::from_str(&format!("\"{}\"", s.to_lowercase())).unwrap_or(VtxoSwapStatus::Pending)
}

/// Parse TokenId from stored string.
fn parse_token_id(s: &str) -> TokenId {
    match s {
        "btc_lightning" => TokenId::BtcLightning,
        "btc_arkade" => TokenId::BtcArkade,
        "btc_onchain" => TokenId::BtcOnchain,
        other => TokenId::Coin(other.to_string()),
    }
}

/// Swap type discriminator for the registry.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SwapType {
    BtcToEvm,
    EvmToBtc,
    BtcToArkade,
    OnchainToEvm,
    ArkadeToEvm,
}

impl SwapType {
    fn as_str(&self) -> &'static str {
        match self {
            SwapType::BtcToEvm => "BtcToEvm",
            SwapType::EvmToBtc => "EvmToBtc",
            SwapType::BtcToArkade => "BtcToArkade",
            SwapType::OnchainToEvm => "OnchainToEvm",
            SwapType::ArkadeToEvm => "ArkadeToEvm",
        }
    }

    fn from_str(s: &str) -> Option<Self> {
        match s {
            "BtcToEvm" => Some(SwapType::BtcToEvm),
            "EvmToBtc" => Some(SwapType::EvmToBtc),
            "BtcToArkade" => Some(SwapType::BtcToArkade),
            "OnchainToEvm" => Some(SwapType::OnchainToEvm),
            "ArkadeToEvm" => Some(SwapType::ArkadeToEvm),
            _ => None,
        }
    }
}

/// SQLite-based storage implementation using sqlx with migrations.
///
/// This provides persistent storage using SQLite with proper migration support,
/// suitable for native applications (CLI tools, Flutter apps, Node.js via napi-rs, etc.).
///
/// # Example
///
/// ```rust,ignore
/// use lendaswap_core::SqliteStorage;
///
/// let storage = SqliteStorage::open("./lendaswap.db").await?;
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
    pool: Arc<SqlitePool>,
}

impl SqliteStorage {
    /// Open or create a SQLite database at the given path.
    ///
    /// Runs migrations automatically on startup.
    pub async fn open<P: AsRef<Path>>(path: P) -> Result<Self, sqlx::Error> {
        let path_str = path.as_ref().to_string_lossy().to_string();
        let options = SqliteConnectOptions::new()
            .filename(&path_str)
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_with(options)
            .await?;

        let storage = Self {
            pool: Arc::new(pool),
        };
        storage.run_migrations().await?;
        Ok(storage)
    }

    /// Create an in-memory SQLite database (useful for testing).
    pub async fn in_memory() -> Result<Self, sqlx::Error> {
        let options = SqliteConnectOptions::from_str(":memory:")?;

        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(options)
            .await?;

        let storage = Self {
            pool: Arc::new(pool),
        };
        storage.run_migrations().await?;
        Ok(storage)
    }

    /// Run database migrations.
    async fn run_migrations(&self) -> Result<(), sqlx::Error> {
        sqlx::migrate!("./migrations").run(&*self.pool).await?;
        Ok(())
    }

    // =========================================================================
    // Helper functions for storing different swap types
    // =========================================================================

    #[allow(deprecated)] // sats_receive is deprecated but needed for backward compatibility
    async fn store_btc_to_evm(
        &self,
        swap_id: &str,
        r: &BtcToEvmSwapResponse,
        params: &SwapParams,
    ) -> Result<(), crate::Error> {
        let created_at = r
            .common
            .created_at
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default();

        sqlx::query(
            r#"
            INSERT OR REPLACE INTO btc_to_evm_swaps (
                swap_id, status, hash_lock, fee_sats, asset_amount, sender_pk, receiver_pk,
                server_pk, evm_refund_locktime, vhtlc_refund_locktime, unilateral_claim_delay,
                unilateral_refund_delay, unilateral_refund_without_receiver_delay, network,
                created_at, source_token, target_token, htlc_address_evm, htlc_address_arkade,
                user_address_evm, ln_invoice, sats_receive, bitcoin_htlc_claim_txid,
                bitcoin_htlc_fund_txid, evm_htlc_claim_txid, evm_htlc_fund_txid,
                target_amount, source_amount,
                secret_key, public_key, preimage, preimage_hash, user_id, key_index
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
                ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33, ?34
            )
            "#,
        )
        .bind(swap_id)
        .bind(format!("{:?}", r.common.status))
        .bind(&r.common.hash_lock)
        .bind(r.common.fee_sats)
        .bind(r.common.asset_amount)
        .bind(&r.common.sender_pk)
        .bind(&r.common.receiver_pk)
        .bind(&r.common.server_pk)
        .bind(r.common.evm_refund_locktime as i64)
        .bind(r.common.vhtlc_refund_locktime as i64)
        .bind(r.common.unilateral_claim_delay)
        .bind(r.common.unilateral_refund_delay)
        .bind(r.common.unilateral_refund_without_receiver_delay)
        .bind(&r.common.network)
        .bind(&created_at)
        .bind(r.common.source_token.as_str())
        .bind(r.common.target_token.as_str())
        .bind(&r.htlc_address_evm)
        .bind(&r.htlc_address_arkade)
        .bind(&r.user_address_evm)
        .bind(&r.ln_invoice)
        .bind(r.sats_receive)
        .bind(&r.bitcoin_htlc_claim_txid)
        .bind(&r.bitcoin_htlc_fund_txid)
        .bind(&r.evm_htlc_claim_txid)
        .bind(&r.evm_htlc_fund_txid)
        .bind(r.target_amount)
        .bind(r.source_amount.map(|v| v as i64))
        .bind(hex::encode(params.secret_key.secret_bytes()))
        .bind(hex::encode(params.public_key.serialize()))
        .bind(hex::encode(params.preimage))
        .bind(hex::encode(params.preimage_hash))
        .bind(hex::encode(params.user_id.serialize()))
        .bind(params.key_index as i64)
        .execute(&*self.pool)
        .await
        .map_err(|e| crate::Error::Storage(format!("Failed to store BtcToEvm swap: {}", e)))?;

        Ok(())
    }

    #[allow(deprecated)] // sats_receive is deprecated but needed for backward compatibility
    async fn store_evm_to_btc(
        &self,
        swap_id: &str,
        r: &EvmToBtcSwapResponse,
        params: &SwapParams,
    ) -> Result<(), crate::Error> {
        let created_at = r
            .common
            .created_at
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default();

        sqlx::query(
            r#"
            INSERT OR REPLACE INTO evm_to_btc_swaps (
                swap_id, status, hash_lock, fee_sats, asset_amount, sender_pk, receiver_pk,
                server_pk, evm_refund_locktime, vhtlc_refund_locktime, unilateral_claim_delay,
                unilateral_refund_delay, unilateral_refund_without_receiver_delay, network,
                created_at, source_token, target_token, htlc_address_evm, htlc_address_arkade,
                user_address_evm, user_address_arkade, ln_invoice, sats_receive,
                bitcoin_htlc_fund_txid, bitcoin_htlc_claim_txid, evm_htlc_claim_txid,
                evm_htlc_fund_txid, create_swap_tx, approve_tx, gelato_forwarder_address,
                gelato_user_nonce, gelato_user_deadline, source_token_address, source_amount,
                target_amount, secret_key, public_key, preimage, preimage_hash, user_id, key_index
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
                ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33,
                ?34, ?35, ?36, ?37, ?38, ?39, ?40, ?41
            )
            "#,
        )
        .bind(swap_id)
        .bind(format!("{:?}", r.common.status))
        .bind(&r.common.hash_lock)
        .bind(r.common.fee_sats)
        .bind(r.common.asset_amount)
        .bind(&r.common.sender_pk)
        .bind(&r.common.receiver_pk)
        .bind(&r.common.server_pk)
        .bind(r.common.evm_refund_locktime as i64)
        .bind(r.common.vhtlc_refund_locktime as i64)
        .bind(r.common.unilateral_claim_delay)
        .bind(r.common.unilateral_refund_delay)
        .bind(r.common.unilateral_refund_without_receiver_delay)
        .bind(&r.common.network)
        .bind(&created_at)
        .bind(r.common.source_token.as_str())
        .bind(r.common.target_token.as_str())
        .bind(&r.htlc_address_evm)
        .bind(&r.htlc_address_arkade)
        .bind(&r.user_address_evm)
        .bind(&r.user_address_arkade)
        .bind(&r.ln_invoice)
        .bind(r.sats_receive)
        .bind(&r.bitcoin_htlc_fund_txid)
        .bind(&r.bitcoin_htlc_claim_txid)
        .bind(&r.evm_htlc_claim_txid)
        .bind(&r.evm_htlc_fund_txid)
        .bind(&r.create_swap_tx)
        .bind(&r.approve_tx)
        .bind(&r.gelato_forwarder_address)
        .bind(&r.gelato_user_nonce)
        .bind(&r.gelato_user_deadline)
        .bind(&r.source_token_address)
        .bind(r.source_amount)
        .bind(r.target_amount as i64)
        .bind(hex::encode(params.secret_key.secret_bytes()))
        .bind(hex::encode(params.public_key.serialize()))
        .bind(hex::encode(params.preimage))
        .bind(hex::encode(params.preimage_hash))
        .bind(hex::encode(params.user_id.serialize()))
        .bind(params.key_index as i64)
        .execute(&*self.pool)
        .await
        .map_err(|e| crate::Error::Storage(format!("Failed to store EvmToBtc swap: {}", e)))?;

        Ok(())
    }

    async fn store_btc_to_arkade(
        &self,
        swap_id: &str,
        r: &BtcToArkadeSwapResponse,
        params: &SwapParams,
    ) -> Result<(), crate::Error> {
        let created_at = r
            .created_at
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default();

        sqlx::query(
            r#"
            INSERT OR REPLACE INTO btc_to_arkade_swaps (
                swap_id, status, btc_htlc_address, asset_amount, sats_receive, fee_sats,
                hash_lock, btc_refund_locktime, arkade_vhtlc_address, target_arkade_address,
                btc_fund_txid, btc_claim_txid, arkade_fund_txid, arkade_claim_txid, network,
                created_at, server_vhtlc_pk, arkade_server_pk, vhtlc_refund_locktime,
                unilateral_claim_delay, unilateral_refund_delay,
                unilateral_refund_without_receiver_delay, source_token, target_token,
                source_amount, target_amount, secret_key, public_key, preimage, preimage_hash,
                user_id, key_index
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
                ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32
            )
            "#,
        )
        .bind(swap_id)
        .bind(format!("{:?}", r.status))
        .bind(&r.btc_htlc_address)
        .bind(r.asset_amount)
        .bind(r.sats_receive)
        .bind(r.fee_sats)
        .bind(&r.hash_lock)
        .bind(r.btc_refund_locktime)
        .bind(&r.arkade_vhtlc_address)
        .bind(&r.target_arkade_address)
        .bind(&r.btc_fund_txid)
        .bind(&r.btc_claim_txid)
        .bind(&r.arkade_fund_txid)
        .bind(&r.arkade_claim_txid)
        .bind(&r.network)
        .bind(&created_at)
        .bind(&r.server_vhtlc_pk)
        .bind(&r.arkade_server_pk)
        .bind(r.vhtlc_refund_locktime)
        .bind(r.unilateral_claim_delay)
        .bind(r.unilateral_refund_delay)
        .bind(r.unilateral_refund_without_receiver_delay)
        .bind(r.source_token.as_str())
        .bind(r.target_token.as_str())
        .bind(r.source_amount as i64)
        .bind(r.target_amount as i64)
        .bind(hex::encode(params.secret_key.secret_bytes()))
        .bind(hex::encode(params.public_key.serialize()))
        .bind(hex::encode(params.preimage))
        .bind(hex::encode(params.preimage_hash))
        .bind(hex::encode(params.user_id.serialize()))
        .bind(params.key_index as i64)
        .execute(&*self.pool)
        .await
        .map_err(|e| crate::Error::Storage(format!("Failed to store BtcToArkade swap: {}", e)))?;

        Ok(())
    }

    async fn store_onchain_to_evm(
        &self,
        swap_id: &str,
        r: &OnchainToEvmSwapResponse,
        params: &SwapParams,
    ) -> Result<(), crate::Error> {
        let created_at = r
            .created_at
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default();

        sqlx::query(
            r#"
            INSERT OR REPLACE INTO onchain_to_evm_swaps (
                swap_id, status, btc_htlc_address, fee_sats, btc_server_pk,
                evm_hash_lock, btc_hash_lock, btc_refund_locktime, btc_fund_txid, btc_claim_txid,
                evm_fund_txid, evm_claim_txid, network, created_at, chain, client_evm_address,
                evm_htlc_address, server_evm_address, evm_refund_locktime, source_token,
                target_token, secret_key, public_key, preimage, preimage_hash, user_id,
                key_index, source_amount, target_amount
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
                ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29
            )
            "#,
        )
        .bind(swap_id)
        .bind(format!("{:?}", r.status))
        .bind(&r.btc_htlc_address)
        .bind(r.fee_sats)
        .bind(&r.btc_server_pk)
        .bind(&r.evm_hash_lock)
        .bind(&r.btc_hash_lock)
        .bind(r.btc_refund_locktime)
        .bind(&r.btc_fund_txid)
        .bind(&r.btc_claim_txid)
        .bind(&r.evm_fund_txid)
        .bind(&r.evm_claim_txid)
        .bind(&r.network)
        .bind(&created_at)
        .bind(&r.chain)
        .bind(&r.client_evm_address)
        .bind(&r.evm_htlc_address)
        .bind(&r.server_evm_address)
        .bind(r.evm_refund_locktime)
        .bind(r.source_token.as_str())
        .bind(r.target_token.as_str())
        .bind(hex::encode(params.secret_key.secret_bytes()))
        .bind(hex::encode(params.public_key.serialize()))
        .bind(hex::encode(params.preimage))
        .bind(hex::encode(params.preimage_hash))
        .bind(hex::encode(params.user_id.serialize()))
        .bind(params.key_index as i64)
        .bind(r.source_amount as i64)
        .bind(r.target_amount)
        .execute(&*self.pool)
        .await
        .map_err(|e| crate::Error::Storage(format!("Failed to store OnchainToEvm swap: {}", e)))?;

        Ok(())
    }

    async fn store_arkade_to_evm(
        &self,
        swap_id: &str,
        r: &ArkadeToEvmSwapResponse,
        params: &SwapParams,
    ) -> Result<(), crate::Error> {
        let created_at = r
            .created_at
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default();

        sqlx::query(
            r#"
            INSERT OR REPLACE INTO arkade_to_evm_swaps (
                swap_id, status, fee_sats, hash_lock, source_token, target_token,
                created_at, chain, evm_chain_id, target_token_address, target_token_symbol,
                target_token_decimals, btc_expected_sats, evm_expected_sats, target_token_amount,
                btc_vhtlc_address, btc_fund_txid, btc_claim_txid, evm_htlc_address,
                evm_coordinator_address, client_evm_address, server_evm_address, evm_fund_txid,
                evm_claim_txid, evm_refund_locktime, sender_pk, receiver_pk, arkade_server_pk,
                vhtlc_refund_locktime, unilateral_claim_delay, unilateral_refund_delay,
                unilateral_refund_without_receiver_delay, network,
                secret_key, public_key, preimage, preimage_hash, user_id, key_index
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
                ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30, ?31, ?32, ?33,
                ?34, ?35, ?36, ?37, ?38, ?39
            )
            "#,
        )
        .bind(swap_id)
        .bind(format!("{:?}", r.status))
        .bind(r.fee_sats)
        .bind(&r.hash_lock)
        .bind(r.source_token.as_str())
        .bind(r.target_token.as_str())
        .bind(&created_at)
        .bind(&r.chain)
        .bind(r.evm_chain_id)
        .bind(&r.target_token_address)
        .bind(&r.target_token_symbol)
        .bind(r.target_token_decimals)
        .bind(r.btc_expected_sats)
        .bind(r.evm_expected_sats)
        .bind(r.target_token_amount)
        .bind(&r.btc_vhtlc_address)
        .bind(&r.btc_fund_txid)
        .bind(&r.btc_claim_txid)
        .bind(&r.evm_htlc_address)
        .bind(&r.evm_coordinator_address)
        .bind(&r.client_evm_address)
        .bind(&r.server_evm_address)
        .bind(&r.evm_fund_txid)
        .bind(&r.evm_claim_txid)
        .bind(r.evm_refund_locktime)
        .bind(&r.sender_pk)
        .bind(&r.receiver_pk)
        .bind(&r.arkade_server_pk)
        .bind(r.vhtlc_refund_locktime)
        .bind(r.unilateral_claim_delay)
        .bind(r.unilateral_refund_delay)
        .bind(r.unilateral_refund_without_receiver_delay)
        .bind(&r.network)
        .bind(hex::encode(params.secret_key.secret_bytes()))
        .bind(hex::encode(params.public_key.serialize()))
        .bind(hex::encode(params.preimage))
        .bind(hex::encode(params.preimage_hash))
        .bind(hex::encode(params.user_id.serialize()))
        .bind(params.key_index as i64)
        .execute(&*self.pool)
        .await
        .map_err(|e| crate::Error::Storage(format!("Failed to store ArkadeToEvm swap: {}", e)))?;

        Ok(())
    }

    async fn store_vtxo_swap(
        &self,
        swap_id: &str,
        response: &VtxoSwapResponse,
        params: &SwapParams,
    ) -> Result<(), crate::Error> {
        let created_at = response
            .created_at
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_default();

        sqlx::query(
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
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17,
                ?18, ?19, ?20, ?21, ?22, ?23, ?24, ?25, ?26, ?27
            )
            "#,
        )
        .bind(swap_id)
        .bind(format!("{:?}", response.status))
        .bind(&created_at)
        .bind(&response.client_vhtlc_address)
        .bind(response.client_fund_amount_sats)
        .bind(&response.client_pk)
        .bind(response.client_locktime as i64)
        .bind(response.client_unilateral_claim_delay)
        .bind(response.client_unilateral_refund_delay)
        .bind(response.client_unilateral_refund_without_receiver_delay)
        .bind(&response.server_vhtlc_address)
        .bind(response.server_fund_amount_sats)
        .bind(&response.server_pk)
        .bind(response.server_locktime as i64)
        .bind(response.server_unilateral_claim_delay)
        .bind(response.server_unilateral_refund_delay)
        .bind(response.server_unilateral_refund_without_receiver_delay)
        .bind(&response.arkade_server_pk)
        .bind(&response.preimage_hash)
        .bind(response.fee_sats)
        .bind(&response.network)
        .bind(hex::encode(params.secret_key.secret_bytes()))
        .bind(hex::encode(params.public_key.serialize()))
        .bind(hex::encode(params.preimage))
        .bind(hex::encode(params.preimage_hash))
        .bind(hex::encode(params.user_id.serialize()))
        .bind(params.key_index as i64)
        .execute(&*self.pool)
        .await
        .map_err(|e| crate::Error::Storage(format!("Failed to store VTXO swap: {}", e)))?;

        Ok(())
    }

    // =========================================================================
    // Helper functions for loading different swap types
    // =========================================================================

    fn parse_swap_params(row: &sqlx::sqlite::SqliteRow) -> Result<SwapParams, crate::Error> {
        use bitcoin::secp256k1::{PublicKey, SecretKey};

        let secret_key_hex: String = row.get("secret_key");
        let public_key_hex: String = row.get("public_key");
        let preimage_hex: String = row.get("preimage");
        let preimage_hash_hex: String = row.get("preimage_hash");
        let user_id_hex: String = row.get("user_id");
        let key_index: i64 = row.get("key_index");

        let secret_key_bytes =
            hex::decode(&secret_key_hex).map_err(|e| crate::Error::Storage(e.to_string()))?;
        let public_key_bytes =
            hex::decode(&public_key_hex).map_err(|e| crate::Error::Storage(e.to_string()))?;
        let preimage_bytes =
            hex::decode(&preimage_hex).map_err(|e| crate::Error::Storage(e.to_string()))?;
        let preimage_hash_bytes =
            hex::decode(&preimage_hash_hex).map_err(|e| crate::Error::Storage(e.to_string()))?;
        let user_id_bytes =
            hex::decode(&user_id_hex).map_err(|e| crate::Error::Storage(e.to_string()))?;

        let secret_key = SecretKey::from_slice(&secret_key_bytes)
            .map_err(|e| crate::Error::Storage(e.to_string()))?;
        let public_key = PublicKey::from_slice(&public_key_bytes)
            .map_err(|e| crate::Error::Storage(e.to_string()))?;
        let user_id = PublicKey::from_slice(&user_id_bytes)
            .map_err(|e| crate::Error::Storage(e.to_string()))?;

        let mut preimage = [0u8; 32];
        preimage.copy_from_slice(&preimage_bytes);
        let mut preimage_hash = [0u8; 32];
        preimage_hash.copy_from_slice(&preimage_hash_bytes);

        Ok(SwapParams {
            secret_key,
            public_key,
            preimage,
            preimage_hash,
            user_id,
            key_index: key_index as u32,
        })
    }

    fn parse_swap_params_vtxo(row: &sqlx::sqlite::SqliteRow) -> Result<SwapParams, crate::Error> {
        use bitcoin::secp256k1::{PublicKey, SecretKey};

        let secret_key_hex: String = row.get("secret_key");
        let public_key_hex: String = row.get("public_key");
        let preimage_hex: String = row.get("preimage");
        let preimage_hash_hex: String = row.get("preimage_hash_params");
        let user_id_hex: String = row.get("user_id");
        let key_index: i64 = row.get("key_index");

        let secret_key_bytes =
            hex::decode(&secret_key_hex).map_err(|e| crate::Error::Storage(e.to_string()))?;
        let public_key_bytes =
            hex::decode(&public_key_hex).map_err(|e| crate::Error::Storage(e.to_string()))?;
        let preimage_bytes =
            hex::decode(&preimage_hex).map_err(|e| crate::Error::Storage(e.to_string()))?;
        let preimage_hash_bytes =
            hex::decode(&preimage_hash_hex).map_err(|e| crate::Error::Storage(e.to_string()))?;
        let user_id_bytes =
            hex::decode(&user_id_hex).map_err(|e| crate::Error::Storage(e.to_string()))?;

        let secret_key = SecretKey::from_slice(&secret_key_bytes)
            .map_err(|e| crate::Error::Storage(e.to_string()))?;
        let public_key = PublicKey::from_slice(&public_key_bytes)
            .map_err(|e| crate::Error::Storage(e.to_string()))?;
        let user_id = PublicKey::from_slice(&user_id_bytes)
            .map_err(|e| crate::Error::Storage(e.to_string()))?;

        let mut preimage = [0u8; 32];
        preimage.copy_from_slice(&preimage_bytes);
        let mut preimage_hash = [0u8; 32];
        preimage_hash.copy_from_slice(&preimage_hash_bytes);

        Ok(SwapParams {
            secret_key,
            public_key,
            preimage,
            preimage_hash,
            user_id,
            key_index: key_index as u32,
        })
    }

    #[allow(deprecated)] // sats_receive is deprecated but needed for backward compatibility
    async fn load_btc_to_evm(
        &self,
        swap_id: &str,
    ) -> Result<ExtendedSwapStorageData, crate::Error> {
        let row = sqlx::query("SELECT * FROM btc_to_evm_swaps WHERE swap_id = ?1")
            .bind(swap_id)
            .fetch_one(&*self.pool)
            .await
            .map_err(|e| crate::Error::Storage(format!("Failed to load BtcToEvm: {}", e)))?;

        let swap_params = Self::parse_swap_params(&row)?;

        let status_str: String = row.get("status");
        let created_at_str: String = row.get("created_at");
        let source_token_str: String = row.get("source_token");
        let target_token_str: String = row.get("target_token");

        let common = SwapCommonFields {
            id: Uuid::parse_str(swap_id).unwrap(),
            status: parse_swap_status(&status_str),
            hash_lock: row.get("hash_lock"),
            fee_sats: row.get("fee_sats"),
            asset_amount: row.get("asset_amount"),
            sender_pk: row.get("sender_pk"),
            receiver_pk: row.get("receiver_pk"),
            server_pk: row.get("server_pk"),
            evm_refund_locktime: row.get::<i64, _>("evm_refund_locktime") as u32,
            vhtlc_refund_locktime: row.get::<i64, _>("vhtlc_refund_locktime") as u32,
            unilateral_claim_delay: row.get("unilateral_claim_delay"),
            unilateral_refund_delay: row.get("unilateral_refund_delay"),
            unilateral_refund_without_receiver_delay: row
                .get("unilateral_refund_without_receiver_delay"),
            network: row.get("network"),
            created_at: OffsetDateTime::parse(
                &created_at_str,
                &time::format_description::well_known::Rfc3339,
            )
            .unwrap_or_else(|_| OffsetDateTime::now_utc()),
            source_token: parse_token_id(&source_token_str),
            target_token: parse_token_id(&target_token_str),
        };

        let response = BtcToEvmSwapResponse {
            common,
            htlc_address_evm: row.get("htlc_address_evm"),
            htlc_address_arkade: row.get("htlc_address_arkade"),
            user_address_evm: row.get("user_address_evm"),
            ln_invoice: row.get("ln_invoice"),
            sats_receive: row.get("sats_receive"),
            bitcoin_htlc_claim_txid: row.get("bitcoin_htlc_claim_txid"),
            bitcoin_htlc_fund_txid: row.get("bitcoin_htlc_fund_txid"),
            evm_htlc_claim_txid: row.get("evm_htlc_claim_txid"),
            evm_htlc_fund_txid: row.get("evm_htlc_fund_txid"),
            target_amount: row.get("target_amount"),
            source_amount: row.get::<Option<i64>, _>("source_amount").map(|v| v as u64),
        };

        Ok(ExtendedSwapStorageData {
            response: GetSwapResponse::BtcToEvm(response),
            swap_params,
        })
    }

    #[allow(deprecated)] // sats_receive is deprecated but needed for backward compatibility
    async fn load_evm_to_btc(
        &self,
        swap_id: &str,
    ) -> Result<ExtendedSwapStorageData, crate::Error> {
        let row = sqlx::query("SELECT * FROM evm_to_btc_swaps WHERE swap_id = ?1")
            .bind(swap_id)
            .fetch_one(&*self.pool)
            .await
            .map_err(|e| crate::Error::Storage(format!("Failed to load EvmToBtc: {}", e)))?;

        let swap_params = Self::parse_swap_params(&row)?;

        let status_str: String = row.get("status");
        let created_at_str: String = row.get("created_at");
        let source_token_str: String = row.get("source_token");
        let target_token_str: String = row.get("target_token");

        let common = SwapCommonFields {
            id: Uuid::parse_str(swap_id).unwrap(),
            status: parse_swap_status(&status_str),
            hash_lock: row.get("hash_lock"),
            fee_sats: row.get("fee_sats"),
            asset_amount: row.get("asset_amount"),
            sender_pk: row.get("sender_pk"),
            receiver_pk: row.get("receiver_pk"),
            server_pk: row.get("server_pk"),
            evm_refund_locktime: row.get::<i64, _>("evm_refund_locktime") as u32,
            vhtlc_refund_locktime: row.get::<i64, _>("vhtlc_refund_locktime") as u32,
            unilateral_claim_delay: row.get("unilateral_claim_delay"),
            unilateral_refund_delay: row.get("unilateral_refund_delay"),
            unilateral_refund_without_receiver_delay: row
                .get("unilateral_refund_without_receiver_delay"),
            network: row.get("network"),
            created_at: OffsetDateTime::parse(
                &created_at_str,
                &time::format_description::well_known::Rfc3339,
            )
            .unwrap_or_else(|_| OffsetDateTime::now_utc()),
            source_token: parse_token_id(&source_token_str),
            target_token: parse_token_id(&target_token_str),
        };

        let response = EvmToBtcSwapResponse {
            common,
            htlc_address_evm: row.get("htlc_address_evm"),
            htlc_address_arkade: row.get("htlc_address_arkade"),
            user_address_evm: row.get("user_address_evm"),
            user_address_arkade: row.get("user_address_arkade"),
            ln_invoice: row.get("ln_invoice"),
            sats_receive: row.get("sats_receive"),
            bitcoin_htlc_fund_txid: row.get("bitcoin_htlc_fund_txid"),
            bitcoin_htlc_claim_txid: row.get("bitcoin_htlc_claim_txid"),
            evm_htlc_claim_txid: row.get("evm_htlc_claim_txid"),
            evm_htlc_fund_txid: row.get("evm_htlc_fund_txid"),
            create_swap_tx: row.get("create_swap_tx"),
            approve_tx: row.get("approve_tx"),
            gelato_forwarder_address: row.get("gelato_forwarder_address"),
            gelato_user_nonce: row.get("gelato_user_nonce"),
            gelato_user_deadline: row.get("gelato_user_deadline"),
            source_token_address: row.get("source_token_address"),
            source_amount: row.get("source_amount"),
            target_amount: row.get::<i64, _>("target_amount") as u64,
        };

        Ok(ExtendedSwapStorageData {
            response: GetSwapResponse::EvmToBtc(response),
            swap_params,
        })
    }

    async fn load_btc_to_arkade(
        &self,
        swap_id: &str,
    ) -> Result<ExtendedSwapStorageData, crate::Error> {
        let row = sqlx::query("SELECT * FROM btc_to_arkade_swaps WHERE swap_id = ?1")
            .bind(swap_id)
            .fetch_one(&*self.pool)
            .await
            .map_err(|e| crate::Error::Storage(format!("Failed to load BtcToArkade: {}", e)))?;

        let swap_params = Self::parse_swap_params(&row)?;

        let status_str: String = row.get("status");
        let created_at_str: String = row.get("created_at");
        let source_token_str: String = row.get("source_token");
        let target_token_str: String = row.get("target_token");

        let response = BtcToArkadeSwapResponse {
            id: Uuid::parse_str(swap_id).unwrap(),
            status: parse_swap_status(&status_str),
            btc_htlc_address: row.get("btc_htlc_address"),
            asset_amount: row.get("asset_amount"),
            sats_receive: row.get("sats_receive"),
            fee_sats: row.get("fee_sats"),
            hash_lock: row.get("hash_lock"),
            btc_refund_locktime: row.get("btc_refund_locktime"),
            arkade_vhtlc_address: row.get("arkade_vhtlc_address"),
            target_arkade_address: row.get("target_arkade_address"),
            btc_fund_txid: row.get("btc_fund_txid"),
            btc_claim_txid: row.get("btc_claim_txid"),
            arkade_fund_txid: row.get("arkade_fund_txid"),
            arkade_claim_txid: row.get("arkade_claim_txid"),
            network: row.get("network"),
            created_at: OffsetDateTime::parse(
                &created_at_str,
                &time::format_description::well_known::Rfc3339,
            )
            .unwrap_or_else(|_| OffsetDateTime::now_utc()),
            server_vhtlc_pk: row.get("server_vhtlc_pk"),
            arkade_server_pk: row.get("arkade_server_pk"),
            vhtlc_refund_locktime: row.get("vhtlc_refund_locktime"),
            unilateral_claim_delay: row.get("unilateral_claim_delay"),
            unilateral_refund_delay: row.get("unilateral_refund_delay"),
            unilateral_refund_without_receiver_delay: row
                .get("unilateral_refund_without_receiver_delay"),
            source_token: parse_token_id(&source_token_str),
            target_token: parse_token_id(&target_token_str),
            source_amount: row.get::<i64, _>("source_amount") as u64,
            target_amount: row.get::<i64, _>("target_amount") as u64,
        };

        Ok(ExtendedSwapStorageData {
            response: GetSwapResponse::BtcToArkade(response),
            swap_params,
        })
    }

    async fn load_onchain_to_evm(
        &self,
        swap_id: &str,
    ) -> Result<ExtendedSwapStorageData, crate::Error> {
        let row = sqlx::query("SELECT * FROM onchain_to_evm_swaps WHERE swap_id = ?1")
            .bind(swap_id)
            .fetch_one(&*self.pool)
            .await
            .map_err(|e| crate::Error::Storage(format!("Failed to load OnchainToEvm: {}", e)))?;

        let swap_params = Self::parse_swap_params(&row)?;

        let status_str: String = row.get("status");
        let created_at_str: String = row.get("created_at");
        let source_token_str: String = row.get("source_token");
        let target_token_str: String = row.get("target_token");

        let response = OnchainToEvmSwapResponse {
            id: Uuid::parse_str(swap_id).unwrap(),
            status: parse_swap_status(&status_str),
            btc_htlc_address: row.get("btc_htlc_address"),
            fee_sats: row.get("fee_sats"),
            btc_server_pk: row.get("btc_server_pk"),
            evm_hash_lock: row.get("evm_hash_lock"),
            btc_hash_lock: row.get("btc_hash_lock"),
            btc_refund_locktime: row.get("btc_refund_locktime"),
            btc_fund_txid: row.get("btc_fund_txid"),
            btc_claim_txid: row.get("btc_claim_txid"),
            evm_fund_txid: row.get("evm_fund_txid"),
            evm_claim_txid: row.get("evm_claim_txid"),
            network: row.get("network"),
            created_at: OffsetDateTime::parse(
                &created_at_str,
                &time::format_description::well_known::Rfc3339,
            )
            .unwrap_or_else(|_| OffsetDateTime::now_utc()),
            chain: row.get("chain"),
            client_evm_address: row.get("client_evm_address"),
            evm_htlc_address: row.get("evm_htlc_address"),
            server_evm_address: row.get("server_evm_address"),
            evm_refund_locktime: row.get("evm_refund_locktime"),
            source_token: parse_token_id(&source_token_str),
            target_token: parse_token_id(&target_token_str),
            target_amount: row.get("target_amount"),
            source_amount: row.get::<i64, _>("source_amount") as u64,
        };

        Ok(ExtendedSwapStorageData {
            response: GetSwapResponse::OnchainToEvm(response),
            swap_params,
        })
    }

    async fn load_arkade_to_evm(
        &self,
        swap_id: &str,
    ) -> Result<ExtendedSwapStorageData, crate::Error> {
        let row = sqlx::query("SELECT * FROM arkade_to_evm_swaps WHERE swap_id = ?1")
            .bind(swap_id)
            .fetch_one(&*self.pool)
            .await
            .map_err(|e| crate::Error::Storage(format!("Failed to load ArkadeToEvm: {}", e)))?;

        let swap_params = Self::parse_swap_params(&row)?;

        let status_str: String = row.get("status");
        let created_at_str: String = row.get("created_at");
        let source_token_str: String = row.get("source_token");
        let target_token_str: String = row.get("target_token");

        let response = ArkadeToEvmSwapResponse {
            id: Uuid::parse_str(swap_id).unwrap(),
            status: parse_swap_status(&status_str),
            fee_sats: row.get("fee_sats"),
            hash_lock: row.get("hash_lock"),
            source_token: parse_token_id(&source_token_str),
            target_token: parse_token_id(&target_token_str),
            created_at: OffsetDateTime::parse(
                &created_at_str,
                &time::format_description::well_known::Rfc3339,
            )
            .unwrap_or_else(|_| OffsetDateTime::now_utc()),
            chain: row.get("chain"),
            evm_chain_id: row.get("evm_chain_id"),
            target_token_address: row.get("target_token_address"),
            target_token_symbol: row.get("target_token_symbol"),
            target_token_decimals: row.get("target_token_decimals"),
            btc_expected_sats: row.get("btc_expected_sats"),
            evm_expected_sats: row.get("evm_expected_sats"),
            target_token_amount: row.get("target_token_amount"),
            btc_vhtlc_address: row.get("btc_vhtlc_address"),
            btc_fund_txid: row.get("btc_fund_txid"),
            btc_claim_txid: row.get("btc_claim_txid"),
            evm_htlc_address: row.get("evm_htlc_address"),
            evm_coordinator_address: row.get("evm_coordinator_address"),
            client_evm_address: row.get("client_evm_address"),
            server_evm_address: row.get("server_evm_address"),
            evm_fund_txid: row.get("evm_fund_txid"),
            evm_claim_txid: row.get("evm_claim_txid"),
            evm_refund_locktime: row.get("evm_refund_locktime"),
            sender_pk: row.get("sender_pk"),
            receiver_pk: row.get("receiver_pk"),
            arkade_server_pk: row.get("arkade_server_pk"),
            vhtlc_refund_locktime: row.get("vhtlc_refund_locktime"),
            unilateral_claim_delay: row.get("unilateral_claim_delay"),
            unilateral_refund_delay: row.get("unilateral_refund_delay"),
            unilateral_refund_without_receiver_delay: row
                .get("unilateral_refund_without_receiver_delay"),
            network: row.get("network"),
        };

        Ok(ExtendedSwapStorageData {
            response: GetSwapResponse::ArkadeToEvm(response),
            swap_params,
        })
    }

    async fn load_vtxo_swap(
        &self,
        swap_id: &str,
    ) -> Result<ExtendedVtxoSwapStorageData, crate::Error> {
        let row = sqlx::query("SELECT * FROM vtxo_swaps WHERE swap_id = ?1")
            .bind(swap_id)
            .fetch_one(&*self.pool)
            .await
            .map_err(|e| crate::Error::Storage(format!("Failed to load VTXO swap: {}", e)))?;

        let swap_params = Self::parse_swap_params_vtxo(&row)?;

        let status_str: String = row.get("status");
        let created_at_str: String = row.get("created_at");

        let response = VtxoSwapResponse {
            id: Uuid::parse_str(swap_id).unwrap(),
            status: parse_vtxo_swap_status(&status_str),
            created_at: OffsetDateTime::parse(
                &created_at_str,
                &time::format_description::well_known::Rfc3339,
            )
            .unwrap_or_else(|_| OffsetDateTime::now_utc()),
            client_vhtlc_address: row.get("client_vhtlc_address"),
            client_fund_amount_sats: row.get("client_fund_amount_sats"),
            client_pk: row.get("client_pk"),
            client_locktime: row.get::<i64, _>("client_locktime") as u64,
            client_unilateral_claim_delay: row.get("client_unilateral_claim_delay"),
            client_unilateral_refund_delay: row.get("client_unilateral_refund_delay"),
            client_unilateral_refund_without_receiver_delay: row
                .get("client_unilateral_refund_without_receiver_delay"),
            server_vhtlc_address: row.get("server_vhtlc_address"),
            server_fund_amount_sats: row.get("server_fund_amount_sats"),
            server_pk: row.get("server_pk"),
            server_locktime: row.get::<i64, _>("server_locktime") as u64,
            server_unilateral_claim_delay: row.get("server_unilateral_claim_delay"),
            server_unilateral_refund_delay: row.get("server_unilateral_refund_delay"),
            server_unilateral_refund_without_receiver_delay: row
                .get("server_unilateral_refund_without_receiver_delay"),
            arkade_server_pk: row.get("arkade_server_pk"),
            preimage_hash: row.get("preimage_hash_response"),
            fee_sats: row.get("fee_sats"),
            network: row.get("network"),
        };

        Ok(ExtendedVtxoSwapStorageData {
            response,
            swap_params,
        })
    }
}

// =========================================================================
// WalletStorage implementation
// =========================================================================

impl WalletStorage for SqliteStorage {
    fn get_mnemonic(&self) -> StorageFuture<'_, Option<String>> {
        Box::pin(async move {
            let row = sqlx::query("SELECT mnemonic FROM wallet WHERE id = 'default'")
                .fetch_optional(&*self.pool)
                .await
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            Ok(row.and_then(|r| r.get("mnemonic")))
        })
    }

    fn set_mnemonic(&self, mnemonic: &str) -> StorageFuture<'_, ()> {
        let mnemonic = mnemonic.to_string();
        Box::pin(async move {
            sqlx::query("UPDATE wallet SET mnemonic = ?1 WHERE id = 'default'")
                .bind(&mnemonic)
                .execute(&*self.pool)
                .await
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
            Ok(())
        })
    }

    fn get_key_index(&self) -> StorageFuture<'_, u32> {
        Box::pin(async move {
            let row = sqlx::query("SELECT key_index FROM wallet WHERE id = 'default'")
                .fetch_one(&*self.pool)
                .await
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            Ok(row.get::<i64, _>("key_index") as u32)
        })
    }

    fn set_key_index(&self, index: u32) -> StorageFuture<'_, ()> {
        Box::pin(async move {
            sqlx::query("UPDATE wallet SET key_index = ?1 WHERE id = 'default'")
                .bind(index as i64)
                .execute(&*self.pool)
                .await
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;
            Ok(())
        })
    }
}

// =========================================================================
// SwapStorage implementation
// =========================================================================

impl SwapStorage for SqliteStorage {
    fn get(&self, swap_id: &str) -> StorageFuture<'_, Option<ExtendedSwapStorageData>> {
        let swap_id = swap_id.to_string();
        Box::pin(async move {
            // Look up swap type from registry
            let row = sqlx::query("SELECT swap_type FROM swap_registry WHERE swap_id = ?1")
                .bind(&swap_id)
                .fetch_optional(&*self.pool)
                .await
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            let Some(row) = row else {
                return Ok(None);
            };

            let swap_type_str: String = row.get("swap_type");
            let swap_type = SwapType::from_str(&swap_type_str);

            match swap_type {
                Some(SwapType::BtcToEvm) => Ok(Some(self.load_btc_to_evm(&swap_id).await?)),
                Some(SwapType::EvmToBtc) => Ok(Some(self.load_evm_to_btc(&swap_id).await?)),
                Some(SwapType::BtcToArkade) => Ok(Some(self.load_btc_to_arkade(&swap_id).await?)),
                Some(SwapType::OnchainToEvm) => Ok(Some(self.load_onchain_to_evm(&swap_id).await?)),
                Some(SwapType::ArkadeToEvm) => Ok(Some(self.load_arkade_to_evm(&swap_id).await?)),
                None => Ok(None),
            }
        })
    }

    fn store(&self, swap_id: &str, data: &ExtendedSwapStorageData) -> StorageFuture<'_, ()> {
        let swap_id = swap_id.to_string();
        let data = data.clone();
        Box::pin(async move {
            let swap_type = match &data.response {
                GetSwapResponse::BtcToEvm(_) => SwapType::BtcToEvm,
                GetSwapResponse::EvmToBtc(_) => SwapType::EvmToBtc,
                GetSwapResponse::BtcToArkade(_) => SwapType::BtcToArkade,
                GetSwapResponse::OnchainToEvm(_) => SwapType::OnchainToEvm,
                GetSwapResponse::ArkadeToEvm(_) => SwapType::ArkadeToEvm,
            };

            // Update registry
            sqlx::query(
                "INSERT OR REPLACE INTO swap_registry (swap_id, swap_type) VALUES (?1, ?2)",
            )
            .bind(&swap_id)
            .bind(swap_type.as_str())
            .execute(&*self.pool)
            .await
            .map_err(|e| crate::Error::Storage(format!("Failed to update registry: {}", e)))?;

            // Store in appropriate table
            match &data.response {
                GetSwapResponse::BtcToEvm(r) => {
                    self.store_btc_to_evm(&swap_id, r, &data.swap_params).await
                }
                GetSwapResponse::EvmToBtc(r) => {
                    self.store_evm_to_btc(&swap_id, r, &data.swap_params).await
                }
                GetSwapResponse::BtcToArkade(r) => {
                    self.store_btc_to_arkade(&swap_id, r, &data.swap_params)
                        .await
                }
                GetSwapResponse::OnchainToEvm(r) => {
                    self.store_onchain_to_evm(&swap_id, r, &data.swap_params)
                        .await
                }
                GetSwapResponse::ArkadeToEvm(r) => {
                    self.store_arkade_to_evm(&swap_id, r, &data.swap_params)
                        .await
                }
            }
        })
    }

    fn delete(&self, swap_id: &str) -> StorageFuture<'_, ()> {
        let swap_id = swap_id.to_string();
        Box::pin(async move {
            // Look up swap type first
            let row = sqlx::query("SELECT swap_type FROM swap_registry WHERE swap_id = ?1")
                .bind(&swap_id)
                .fetch_optional(&*self.pool)
                .await
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            if let Some(row) = row {
                let swap_type_str: String = row.get("swap_type");
                let table = match swap_type_str.as_str() {
                    "BtcToEvm" => "btc_to_evm_swaps",
                    "EvmToBtc" => "evm_to_btc_swaps",
                    "BtcToArkade" => "btc_to_arkade_swaps",
                    "OnchainToEvm" => "onchain_to_evm_swaps",
                    "ArkadeToEvm" => "arkade_to_evm_swaps",
                    _ => return Ok(()),
                };

                sqlx::query(&format!("DELETE FROM {} WHERE swap_id = ?1", table))
                    .bind(&swap_id)
                    .execute(&*self.pool)
                    .await
                    .map_err(|e| crate::Error::Storage(format!("Failed to delete swap: {}", e)))?;
            }

            // Delete from registry
            sqlx::query("DELETE FROM swap_registry WHERE swap_id = ?1")
                .bind(&swap_id)
                .execute(&*self.pool)
                .await
                .map_err(|e| {
                    crate::Error::Storage(format!("Failed to delete from registry: {}", e))
                })?;

            Ok(())
        })
    }

    fn list(&self) -> StorageFuture<'_, Vec<String>> {
        Box::pin(async move {
            let rows = sqlx::query("SELECT swap_id FROM swap_registry")
                .fetch_all(&*self.pool)
                .await
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            Ok(rows.iter().map(|r| r.get("swap_id")).collect())
        })
    }

    fn get_all(&self) -> StorageFuture<'_, Vec<ExtendedSwapStorageData>> {
        Box::pin(async move {
            let mut swaps = Vec::new();

            // Get all BtcToEvm swaps
            let rows = sqlx::query("SELECT swap_id FROM btc_to_evm_swaps")
                .fetch_all(&*self.pool)
                .await
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            for row in rows {
                let swap_id: String = row.get("swap_id");
                if let Ok(data) = self.load_btc_to_evm(&swap_id).await {
                    swaps.push(data);
                }
            }

            // Get all EvmToBtc swaps
            let rows = sqlx::query("SELECT swap_id FROM evm_to_btc_swaps")
                .fetch_all(&*self.pool)
                .await
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            for row in rows {
                let swap_id: String = row.get("swap_id");
                if let Ok(data) = self.load_evm_to_btc(&swap_id).await {
                    swaps.push(data);
                }
            }

            // Get all BtcToArkade swaps
            let rows = sqlx::query("SELECT swap_id FROM btc_to_arkade_swaps")
                .fetch_all(&*self.pool)
                .await
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            for row in rows {
                let swap_id: String = row.get("swap_id");
                if let Ok(data) = self.load_btc_to_arkade(&swap_id).await {
                    swaps.push(data);
                }
            }

            // Get all OnchainToEvm swaps
            let rows = sqlx::query("SELECT swap_id FROM onchain_to_evm_swaps")
                .fetch_all(&*self.pool)
                .await
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            for row in rows {
                let swap_id: String = row.get("swap_id");
                if let Ok(data) = self.load_onchain_to_evm(&swap_id).await {
                    swaps.push(data);
                }
            }

            // Get all ArkadeToEvm swaps
            let rows = sqlx::query("SELECT swap_id FROM arkade_to_evm_swaps")
                .fetch_all(&*self.pool)
                .await
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            for row in rows {
                let swap_id: String = row.get("swap_id");
                if let Ok(data) = self.load_arkade_to_evm(&swap_id).await {
                    swaps.push(data);
                }
            }

            Ok(swaps)
        })
    }
}

// =========================================================================
// VtxoSwapStorage implementation
// =========================================================================

impl VtxoSwapStorage for SqliteStorage {
    fn get(&self, swap_id: &str) -> StorageFuture<'_, Option<ExtendedVtxoSwapStorageData>> {
        let swap_id = swap_id.to_string();
        Box::pin(async move {
            match self.load_vtxo_swap(&swap_id).await {
                Ok(data) => Ok(Some(data)),
                Err(_) => Ok(None),
            }
        })
    }

    fn store(&self, swap_id: &str, data: &ExtendedVtxoSwapStorageData) -> StorageFuture<'_, ()> {
        let swap_id = swap_id.to_string();
        let data = data.clone();
        Box::pin(async move {
            self.store_vtxo_swap(&swap_id, &data.response, &data.swap_params)
                .await
        })
    }

    fn delete(&self, swap_id: &str) -> StorageFuture<'_, ()> {
        let swap_id = swap_id.to_string();
        Box::pin(async move {
            sqlx::query("DELETE FROM vtxo_swaps WHERE swap_id = ?1")
                .bind(&swap_id)
                .execute(&*self.pool)
                .await
                .map_err(|e| crate::Error::Storage(format!("Failed to delete VTXO swap: {}", e)))?;
            Ok(())
        })
    }

    fn list(&self) -> StorageFuture<'_, Vec<String>> {
        Box::pin(async move {
            let rows = sqlx::query("SELECT swap_id FROM vtxo_swaps")
                .fetch_all(&*self.pool)
                .await
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            Ok(rows.iter().map(|r| r.get("swap_id")).collect())
        })
    }

    fn get_all(&self) -> StorageFuture<'_, Vec<ExtendedVtxoSwapStorageData>> {
        Box::pin(async move {
            let rows = sqlx::query("SELECT swap_id FROM vtxo_swaps")
                .fetch_all(&*self.pool)
                .await
                .map_err(|e| crate::Error::Storage(format!("SQLite error: {}", e)))?;

            let mut swaps = Vec::new();
            for row in rows {
                let swap_id: String = row.get("swap_id");
                if let Ok(data) = self.load_vtxo_swap(&swap_id).await {
                    swaps.push(data);
                }
            }

            Ok(swaps)
        })
    }
}

// =========================================================================
// Tests
// =========================================================================
#[allow(deprecated)]
#[cfg(test)]
mod tests {
    use super::*;
    use bitcoin::secp256k1::{PublicKey, Secp256k1, SecretKey};

    // =========================================================================
    // Test Helper - Database Setup
    // =========================================================================
    //
    // By default, tests use an in-memory SQLite database. To use a file-based
    // database instead (useful for debugging or inspecting test data), set the
    // `TEST_SQLITE_DB_PATH` environment variable:
    //
    // ```sh
    // # Run tests with a file-based database
    // TEST_SQLITE_DB_PATH=/tmp/lendaswap-test.db cargo test -p lendaswap-core --features sqlite
    //
    // # Run a specific test with a file-based database
    // TEST_SQLITE_DB_PATH=./test.db cargo test -p lendaswap-core --features sqlite -- test_wallet_storage
    // ```
    //
    // =========================================================================

    /// Environment variable name for specifying a file-based test database path.
    const TEST_DB_PATH_ENV: &str = "TEST_SQLITE_DB_PATH";

    /// Creates a test storage instance.
    /// If `TEST_SQLITE_DB_PATH` is set, uses a file-based database.
    /// Otherwise, uses an in-memory database.
    async fn create_test_storage() -> SqliteStorage {
        match std::env::var(TEST_DB_PATH_ENV) {
            Ok(path) => {
                if let Some(parent) = std::path::Path::new(&path).parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                SqliteStorage::open(&path)
                    .await
                    .unwrap_or_else(|e| panic!("Failed to open test database at {}: {}", path, e))
            }
            Err(_) => SqliteStorage::in_memory()
                .await
                .expect("Failed to create in-memory test database"),
        }
    }

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

    fn create_test_btc_to_evm_swap() -> (ExtendedSwapStorageData, String) {
        let swap_id = Uuid::new_v4();
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

        (data, swap_id.to_string())
    }

    fn create_test_evm_to_btc_swap() -> (ExtendedSwapStorageData, String) {
        let swap_id = Uuid::new_v4();
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

        (data, swap_id.to_string())
    }

    fn create_test_btc_to_arkade_swap() -> (ExtendedSwapStorageData, String) {
        let swap_id = Uuid::new_v4();
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

        (data, swap_id.to_string())
    }

    fn create_test_onchain_to_evm_swap() -> (ExtendedSwapStorageData, String) {
        let swap_id = Uuid::new_v4();
        let swap_params = create_test_swap_params(5);

        let response = OnchainToEvmSwapResponse {
            id: swap_id,
            status: SwapStatus::Pending,
            btc_htlc_address: "bc1phtlc...".to_string(),
            fee_sats: 1500,
            btc_server_pk: "02serverpk".to_string(),
            evm_hash_lock: "0xdeadbeefcafebabe".to_string(),
            btc_hash_lock: "abcd1234".to_string(),
            btc_refund_locktime: 1700000000,
            btc_fund_txid: None,
            btc_claim_txid: None,
            evm_fund_txid: None,
            evm_claim_txid: None,
            network: "bitcoin".to_string(),
            created_at: OffsetDateTime::now_utc(),
            chain: "Polygon".to_string(),
            client_evm_address: "0xclient".to_string(),
            evm_htlc_address: "0xhtlc".to_string(),
            server_evm_address: "0xserver".to_string(),
            evm_refund_locktime: 1699999000,
            source_token: TokenId::BtcOnchain,
            target_token: TokenId::Coin("wbtc_pol".to_string()),
            target_amount: 0.001,
            source_amount: 100000,
        };

        let data = ExtendedSwapStorageData {
            response: GetSwapResponse::OnchainToEvm(response),
            swap_params,
        };

        (data, swap_id.to_string())
    }

    fn create_test_vtxo_swap() -> (ExtendedVtxoSwapStorageData, String) {
        let swap_id = Uuid::new_v4();
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

        (data, swap_id.to_string())
    }

    // =========================================================================
    // Wallet Storage Tests
    // =========================================================================

    #[tokio::test]
    async fn test_wallet_storage() {
        let storage = SqliteStorage::in_memory().await.unwrap();

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
        let storage = SqliteStorage::in_memory().await.unwrap();

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
        let storage = create_test_storage().await;
        let (data, swap_id) = create_test_btc_to_evm_swap();

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

        // LIST should not contain our swap
        let ids = SwapStorage::list(&storage).await.unwrap();
        assert!(!ids.contains(&swap_id));
    }

    // =========================================================================
    // SwapStorage CRUD Tests - EvmToBtc
    // =========================================================================

    #[tokio::test]
    async fn test_evm_to_btc_swap_crud() {
        let storage = create_test_storage().await;
        let (data, swap_id) = create_test_evm_to_btc_swap();

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
        let storage = create_test_storage().await;
        let (data, swap_id) = create_test_btc_to_arkade_swap();

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
    // SwapStorage CRUD Tests - OnchainToEvm
    // =========================================================================

    #[tokio::test]
    async fn test_onchain_to_evm_swap_crud() {
        let storage = create_test_storage().await;
        let (data, swap_id) = create_test_onchain_to_evm_swap();

        // CREATE
        SwapStorage::store(&storage, &swap_id, &data).await.unwrap();

        // READ
        let retrieved = SwapStorage::get(&storage, &swap_id).await.unwrap();
        assert!(retrieved.is_some());
        let retrieved = retrieved.unwrap();
        if let GetSwapResponse::OnchainToEvm(ref r) = retrieved.response {
            assert_eq!(r.id.to_string(), swap_id);
            assert_eq!(r.btc_htlc_address, "bc1phtlc...");
            assert_eq!(r.source_amount, 100000);
            assert_eq!(r.chain, "Polygon");
            assert_eq!(r.client_evm_address, "0xclient");
            assert_eq!(r.source_token, TokenId::BtcOnchain);
        } else {
            panic!("Expected OnchainToEvm response");
        }

        // LIST
        let ids = SwapStorage::list(&storage).await.unwrap();
        assert!(ids.contains(&swap_id));

        // UPDATE (change status and add txids)
        let mut updated_data = data.clone();
        if let GetSwapResponse::OnchainToEvm(ref mut r) = updated_data.response {
            r.status = SwapStatus::ClientFunded;
            r.btc_fund_txid = Some("btctxid123".to_string());
        }
        SwapStorage::store(&storage, &swap_id, &updated_data)
            .await
            .unwrap();

        // Verify update
        let retrieved = SwapStorage::get(&storage, &swap_id).await.unwrap().unwrap();
        if let GetSwapResponse::OnchainToEvm(ref r) = retrieved.response {
            assert_eq!(r.status, SwapStatus::ClientFunded);
            assert_eq!(r.btc_fund_txid, Some("btctxid123".to_string()));
        } else {
            panic!("Expected OnchainToEvm response");
        }

        // UPDATE to ServerFunded with EVM txid
        let mut server_funded_data = updated_data.clone();
        if let GetSwapResponse::OnchainToEvm(ref mut r) = server_funded_data.response {
            r.status = SwapStatus::ServerFunded;
            r.evm_fund_txid = Some("0xevmfundtx".to_string());
        }
        SwapStorage::store(&storage, &swap_id, &server_funded_data)
            .await
            .unwrap();

        let retrieved = SwapStorage::get(&storage, &swap_id).await.unwrap().unwrap();
        if let GetSwapResponse::OnchainToEvm(ref r) = retrieved.response {
            assert_eq!(r.status, SwapStatus::ServerFunded);
            assert_eq!(r.evm_fund_txid, Some("0xevmfundtx".to_string()));
            // Verify previous update is preserved
            assert_eq!(r.btc_fund_txid, Some("btctxid123".to_string()));
        } else {
            panic!("Expected OnchainToEvm response");
        }

        // DELETE
        SwapStorage::delete(&storage, &swap_id).await.unwrap();
        let deleted = SwapStorage::get(&storage, &swap_id).await.unwrap();
        assert!(deleted.is_none());

        // LIST should not contain our swap
        let ids = SwapStorage::list(&storage).await.unwrap();
        assert!(!ids.contains(&swap_id));
    }

    // =========================================================================
    // SwapStorage - Multiple Swaps and get_all
    // =========================================================================

    #[tokio::test]
    async fn test_swap_storage_multiple_swaps_get_all() {
        let storage = create_test_storage().await;

        let (btc_to_evm, id1) = create_test_btc_to_evm_swap();
        let (evm_to_btc, id2) = create_test_evm_to_btc_swap();
        let (btc_to_arkade, id3) = create_test_btc_to_arkade_swap();
        let (onchain_to_evm, id4) = create_test_onchain_to_evm_swap();

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
        SwapStorage::store(&storage, &id4, &onchain_to_evm)
            .await
            .unwrap();

        // Verify list contains all our swaps
        let ids = SwapStorage::list(&storage).await.unwrap();
        assert!(ids.contains(&id1));
        assert!(ids.contains(&id2));
        assert!(ids.contains(&id3));
        assert!(ids.contains(&id4));

        // Verify get_all returns our swaps
        let all_swaps = SwapStorage::get_all(&storage).await.unwrap();

        // Verify each of our swaps is present by ID
        let swap_ids: Vec<String> = all_swaps
            .iter()
            .map(|s| match &s.response {
                GetSwapResponse::BtcToEvm(r) => r.common.id.to_string(),
                GetSwapResponse::EvmToBtc(r) => r.common.id.to_string(),
                GetSwapResponse::BtcToArkade(r) => r.id.to_string(),
                GetSwapResponse::OnchainToEvm(r) => r.id.to_string(),
            })
            .collect();
        assert!(swap_ids.contains(&id1), "Missing BtcToEvm swap");
        assert!(swap_ids.contains(&id2), "Missing EvmToBtc swap");
        assert!(swap_ids.contains(&id3), "Missing BtcToArkade swap");
        assert!(swap_ids.contains(&id4), "Missing OnchainToEvm swap");

        // Delete one and verify
        SwapStorage::delete(&storage, &id1).await.unwrap();
        let ids = SwapStorage::list(&storage).await.unwrap();
        assert!(!ids.contains(&id1));
        assert!(ids.contains(&id2));

        // Delete remaining and verify none of our swaps are present
        SwapStorage::delete(&storage, &id2).await.unwrap();
        SwapStorage::delete(&storage, &id3).await.unwrap();
        SwapStorage::delete(&storage, &id4).await.unwrap();
        let ids = SwapStorage::list(&storage).await.unwrap();
        assert!(!ids.contains(&id1));
        assert!(!ids.contains(&id2));
        assert!(!ids.contains(&id3));
        assert!(!ids.contains(&id4));
    }

    // =========================================================================
    // VtxoSwapStorage CRUD Tests
    // =========================================================================

    #[tokio::test]
    async fn test_vtxo_swap_crud() {
        let storage = create_test_storage().await;
        let (data, swap_id) = create_test_vtxo_swap();

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
        let storage = create_test_storage().await;

        let (data1, id1) = create_test_vtxo_swap();
        let (data2, id2) = create_test_vtxo_swap();

        VtxoSwapStorage::store(&storage, &id1, &data1)
            .await
            .unwrap();
        VtxoSwapStorage::store(&storage, &id2, &data2)
            .await
            .unwrap();

        let all_swaps = VtxoSwapStorage::get_all(&storage).await.unwrap();
        let swap_ids: Vec<String> = all_swaps
            .iter()
            .map(|s| s.response.id.to_string())
            .collect();
        assert!(swap_ids.contains(&id1));
        assert!(swap_ids.contains(&id2));

        // Cleanup
        VtxoSwapStorage::delete(&storage, &id1).await.unwrap();
        VtxoSwapStorage::delete(&storage, &id2).await.unwrap();

        let ids = VtxoSwapStorage::list(&storage).await.unwrap();
        assert!(!ids.contains(&id1));
        assert!(!ids.contains(&id2));
    }

    // =========================================================================
    // Edge Cases
    // =========================================================================

    #[tokio::test]
    async fn test_get_nonexistent_swap() {
        let storage = create_test_storage().await;
        let result = SwapStorage::get(&storage, "nonexistent-id").await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_delete_nonexistent_swap() {
        let storage = create_test_storage().await;
        // Should not error when deleting non-existent swap
        SwapStorage::delete(&storage, "nonexistent-id")
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn test_get_nonexistent_vtxo_swap() {
        let storage = create_test_storage().await;
        let result = VtxoSwapStorage::get(&storage, "nonexistent-id")
            .await
            .unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_swap_params_roundtrip() {
        let storage = create_test_storage().await;
        let (data, swap_id) = create_test_btc_to_evm_swap();

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
