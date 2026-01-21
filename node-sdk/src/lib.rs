//! Native Node.js bindings for Lendaswap Client SDK with SQLite storage.
//!
//! This crate provides Node.js bindings via napi-rs, enabling the use of
//! SQLite storage for server-side and CLI applications.

use lendaswap_core::api as core_api;
use lendaswap_core::{Client as CoreClient, Network, SqliteStorage};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use rust_decimal::Decimal;
use rust_decimal::prelude::FromPrimitive;
use std::sync::Arc;
use tokio::sync::Mutex;

/// SQLite storage handle for Node.js.
#[napi]
pub struct SqliteStorageHandle {
    storage: Arc<SqliteStorage>,
}

#[napi]
impl SqliteStorageHandle {
    /// Open or create a SQLite database at the given path.
    #[napi(factory)]
    pub fn open(path: String) -> Result<Self> {
        let storage = SqliteStorage::open(&path)
            .map_err(|e| Error::from_reason(format!("Failed to open SQLite database: {}", e)))?;
        Ok(Self {
            storage: Arc::new(storage),
        })
    }

    /// Create an in-memory SQLite database (useful for testing).
    #[napi(factory)]
    pub fn in_memory() -> Result<Self> {
        let storage = SqliteStorage::in_memory().map_err(|e| {
            Error::from_reason(format!("Failed to create in-memory database: {}", e))
        })?;
        Ok(Self {
            storage: Arc::new(storage),
        })
    }
}

// ============================================================================
// Enums
// ============================================================================

/// Swap status enum with all possible states.
#[napi(string_enum)]
pub enum SwapStatus {
    /// Initial state - waiting for client to fund
    Pending,
    /// Client's funding transaction seen but not confirmed
    ClientFundingSeen,
    /// Client has funded BTC
    ClientFunded,
    /// Client refunded before server created HTLC
    ClientRefunded,
    /// Server has locked funds in HTLC
    ServerFunded,
    /// Client is claiming by revealing the secret
    ClientRedeeming,
    /// Client has claimed by revealing the secret
    ClientRedeemed,
    /// Server has redeemed using the revealed secret (swap complete)
    ServerRedeemed,
    /// Client funded, server funded, but HTLC timed out
    ClientFundedServerRefunded,
    /// Error state: client refunded while server still has funds locked
    ClientRefundedServerFunded,
    /// Both parties refunded after error state
    ClientRefundedServerRefunded,
    /// Swap expired before client funded
    Expired,
    /// Client funded with wrong parameters
    ClientInvalidFunded,
    /// Client funded too late (after timeout)
    ClientFundedTooLate,
    /// Critical error: client redeemed and refunded (took all money)
    ClientRedeemedAndClientRefunded,
}

impl From<core_api::SwapStatus> for SwapStatus {
    fn from(s: core_api::SwapStatus) -> Self {
        match s {
            core_api::SwapStatus::Pending => SwapStatus::Pending,
            core_api::SwapStatus::ClientFundingSeen => SwapStatus::ClientFundingSeen,
            core_api::SwapStatus::ClientFunded => SwapStatus::ClientFunded,
            core_api::SwapStatus::ClientRefunded => SwapStatus::ClientRefunded,
            core_api::SwapStatus::ServerFunded => SwapStatus::ServerFunded,
            core_api::SwapStatus::ClientRedeeming => SwapStatus::ClientRedeeming,
            core_api::SwapStatus::ClientRedeemed => SwapStatus::ClientRedeemed,
            core_api::SwapStatus::ServerRedeemed => SwapStatus::ServerRedeemed,
            core_api::SwapStatus::ClientFundedServerRefunded => {
                SwapStatus::ClientFundedServerRefunded
            }
            core_api::SwapStatus::ClientRefundedServerFunded => {
                SwapStatus::ClientRefundedServerFunded
            }
            core_api::SwapStatus::ClientRefundedServerRefunded => {
                SwapStatus::ClientRefundedServerRefunded
            }
            core_api::SwapStatus::Expired => SwapStatus::Expired,
            core_api::SwapStatus::ClientInvalidFunded => SwapStatus::ClientInvalidFunded,
            core_api::SwapStatus::ClientFundedTooLate => SwapStatus::ClientFundedTooLate,
            core_api::SwapStatus::ClientRedeemedAndClientRefunded => {
                SwapStatus::ClientRedeemedAndClientRefunded
            }
        }
    }
}

// ============================================================================
// Response Types
// ============================================================================

/// Quote response from the API.
#[napi(object)]
pub struct QuoteResponse {
    pub exchange_rate: String,
    pub network_fee: i64,
    pub protocol_fee: i64,
    pub protocol_fee_rate: f64,
    pub min_amount: i64,
    pub max_amount: i64,
}

impl From<core_api::QuoteResponse> for QuoteResponse {
    fn from(r: core_api::QuoteResponse) -> Self {
        QuoteResponse {
            exchange_rate: r.exchange_rate,
            network_fee: r.network_fee as i64,
            protocol_fee: r.protocol_fee as i64,
            protocol_fee_rate: r.protocol_fee_rate,
            min_amount: r.min_amount as i64,
            max_amount: r.max_amount as i64,
        }
    }
}

/// Token information.
#[napi(object)]
pub struct TokenInfo {
    pub token_id: String,
    pub symbol: String,
    pub chain: String,
    pub name: String,
    pub decimals: u8,
}

impl From<core_api::TokenInfo> for TokenInfo {
    fn from(t: core_api::TokenInfo) -> Self {
        TokenInfo {
            token_id: t.token_id.to_string(),
            symbol: t.symbol,
            chain: format!("{:?}", t.chain).to_lowercase(),
            name: t.name,
            decimals: t.decimals,
        }
    }
}

/// Asset pair information.
#[napi(object)]
pub struct AssetPair {
    pub source: TokenInfo,
    pub target: TokenInfo,
}

impl From<core_api::AssetPair> for AssetPair {
    fn from(p: core_api::AssetPair) -> Self {
        AssetPair {
            source: p.source.into(),
            target: p.target.into(),
        }
    }
}

/// BTC to EVM swap response.
#[napi(object)]
pub struct BtcToEvmSwapResponse {
    pub id: String,
    pub status: SwapStatus,
    pub hash_lock: String,
    pub fee_sats: i64,
    pub asset_amount: f64,
    pub htlc_address_evm: String,
    pub htlc_address_arkade: String,
    pub user_address_evm: String,
    pub ln_invoice: String,
    pub sats_receive: i64,
    pub source_token: String,
    pub target_token: String,
    pub network: String,
    pub created_at: String,
    /// Bitcoin HTLC claim transaction ID
    pub bitcoin_htlc_claim_txid: Option<String>,
    /// Bitcoin HTLC fund transaction ID
    pub bitcoin_htlc_fund_txid: Option<String>,
    /// EVM HTLC claim transaction ID
    pub evm_htlc_claim_txid: Option<String>,
    /// EVM HTLC fund transaction ID
    pub evm_htlc_fund_txid: Option<String>,
}

impl From<core_api::BtcToEvmSwapResponse> for BtcToEvmSwapResponse {
    fn from(r: core_api::BtcToEvmSwapResponse) -> Self {
        BtcToEvmSwapResponse {
            id: r.common.id.to_string(),
            status: r.common.status.into(),
            hash_lock: r.common.hash_lock,
            fee_sats: r.common.fee_sats,
            asset_amount: r.common.asset_amount,
            htlc_address_evm: r.htlc_address_evm,
            htlc_address_arkade: r.htlc_address_arkade,
            user_address_evm: r.user_address_evm,
            ln_invoice: r.ln_invoice,
            sats_receive: r.sats_receive,
            source_token: r.common.source_token.to_string(),
            target_token: r.common.target_token.to_string(),
            network: r.common.network.to_string(),
            created_at: r
                .common
                .created_at
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default(),
            bitcoin_htlc_claim_txid: r.bitcoin_htlc_claim_txid,
            bitcoin_htlc_fund_txid: r.bitcoin_htlc_fund_txid,
            evm_htlc_claim_txid: r.evm_htlc_claim_txid,
            evm_htlc_fund_txid: r.evm_htlc_fund_txid,
        }
    }
}

/// EVM to BTC swap response.
#[napi(object)]
pub struct EvmToBtcSwapResponse {
    pub id: String,
    pub status: SwapStatus,
    pub hash_lock: String,
    pub fee_sats: i64,
    pub asset_amount: f64,
    pub htlc_address_evm: String,
    pub htlc_address_arkade: String,
    pub user_address_evm: String,
    pub ln_invoice: String,
    pub sats_receive: i64,
    pub source_token: String,
    pub target_token: String,
    pub network: String,
    pub created_at: String,
    pub source_token_address: String,
    pub bitcoin_htlc_fund_txid: Option<String>,
    /// Bitcoin HTLC claim transaction ID
    pub bitcoin_htlc_claim_txid: Option<String>,
    /// EVM HTLC claim transaction ID
    pub evm_htlc_claim_txid: Option<String>,
    /// EVM HTLC fund transaction ID
    pub evm_htlc_fund_txid: Option<String>,
}

impl From<core_api::EvmToBtcSwapResponse> for EvmToBtcSwapResponse {
    fn from(r: core_api::EvmToBtcSwapResponse) -> Self {
        EvmToBtcSwapResponse {
            id: r.common.id.to_string(),
            status: r.common.status.into(),
            hash_lock: r.common.hash_lock,
            fee_sats: r.common.fee_sats,
            asset_amount: r.common.asset_amount,
            htlc_address_evm: r.htlc_address_evm,
            htlc_address_arkade: r.htlc_address_arkade,
            user_address_evm: r.user_address_evm,
            ln_invoice: r.ln_invoice,
            sats_receive: r.sats_receive,
            source_token: r.common.source_token.to_string(),
            target_token: r.common.target_token.to_string(),
            network: r.common.network.to_string(),
            created_at: r
                .common
                .created_at
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default(),
            source_token_address: r.source_token_address,
            bitcoin_htlc_fund_txid: r.bitcoin_htlc_fund_txid,
            bitcoin_htlc_claim_txid: r.bitcoin_htlc_claim_txid,
            evm_htlc_claim_txid: r.evm_htlc_claim_txid,
            evm_htlc_fund_txid: r.evm_htlc_fund_txid,
        }
    }
}

/// BTC to Arkade swap response.
#[napi(object)]
pub struct BtcToArkadeSwapResponse {
    pub id: String,
    pub status: SwapStatus,
    pub btc_htlc_address: String,
    pub asset_amount: i64,
    pub sats_receive: i64,
    pub fee_sats: i64,
    pub hash_lock: String,
    pub arkade_vhtlc_address: String,
    pub target_arkade_address: String,
    pub network: String,
    pub created_at: String,
    pub source_token: String,
    pub target_token: String,
    pub btc_fund_txid: Option<String>,
    /// On-chain BTC claim transaction ID.
    pub btc_claim_txid: Option<String>,
    /// Arkade VHTLC funding transaction ID.
    pub arkade_fund_txid: Option<String>,
    /// Arkade VHTLC claim transaction ID.
    pub arkade_claim_txid: Option<String>,
}

impl From<core_api::BtcToArkadeSwapResponse> for BtcToArkadeSwapResponse {
    fn from(r: core_api::BtcToArkadeSwapResponse) -> Self {
        BtcToArkadeSwapResponse {
            id: r.id.to_string(),
            status: r.status.into(),
            btc_htlc_address: r.btc_htlc_address,
            asset_amount: r.asset_amount,
            sats_receive: r.sats_receive,
            fee_sats: r.fee_sats,
            hash_lock: r.hash_lock,
            arkade_vhtlc_address: r.arkade_vhtlc_address,
            target_arkade_address: r.target_arkade_address,
            network: r.network,
            created_at: r
                .created_at
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default(),
            source_token: r.source_token.to_string(),
            target_token: r.target_token.to_string(),
            btc_fund_txid: r.btc_fund_txid,
            btc_claim_txid: r.btc_claim_txid,
            arkade_fund_txid: r.arkade_fund_txid,
            arkade_claim_txid: r.arkade_claim_txid,
        }
    }
}

/// On-chain BTC to EVM swap response.
#[napi(object)]
pub struct OnchainToEvmSwapResponse {
    pub id: String,
    pub status: SwapStatus,
    pub btc_htlc_address: String,
    pub fee_sats: i64,
    pub btc_server_pk: String,
    pub evm_hash_lock: String,
    pub btc_hash_lock: String,
    pub btc_refund_locktime: i64,
    pub btc_fund_txid: Option<String>,
    pub btc_claim_txid: Option<String>,
    pub evm_fund_txid: Option<String>,
    pub evm_claim_txid: Option<String>,
    pub network: String,
    pub created_at: String,
    pub chain: String,
    pub client_evm_address: String,
    pub evm_htlc_address: String,
    pub server_evm_address: String,
    pub evm_refund_locktime: i64,
    pub source_token: String,
    pub target_token: String,
    /// How much the user will receive of the target asset
    pub target_amount: f64,
    /// Amount user must send in satoshis
    pub source_amount: i64,
}

impl From<core_api::OnchainToEvmSwapResponse> for OnchainToEvmSwapResponse {
    fn from(r: core_api::OnchainToEvmSwapResponse) -> Self {
        OnchainToEvmSwapResponse {
            id: r.id.to_string(),
            status: r.status.into(),
            btc_htlc_address: r.btc_htlc_address,
            fee_sats: r.fee_sats,
            btc_server_pk: r.btc_server_pk,
            evm_hash_lock: r.evm_hash_lock,
            btc_hash_lock: r.btc_hash_lock,
            btc_refund_locktime: r.btc_refund_locktime,
            btc_fund_txid: r.btc_fund_txid,
            btc_claim_txid: r.btc_claim_txid,
            evm_fund_txid: r.evm_fund_txid,
            evm_claim_txid: r.evm_claim_txid,
            network: r.network,
            created_at: r
                .created_at
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default(),
            chain: r.chain,
            client_evm_address: r.client_evm_address,
            evm_htlc_address: r.evm_htlc_address,
            server_evm_address: r.server_evm_address,
            evm_refund_locktime: r.evm_refund_locktime,
            source_token: r.source_token.to_string(),
            target_token: r.target_token.to_string(),
            source_amount: r.source_amount as i64,
            target_amount: r.target_amount,
        }
    }
}

/// Version information.
#[napi(object)]
pub struct Version {
    pub tag: String,
    pub commit_hash: String,
}

impl From<core_api::Version> for Version {
    fn from(v: core_api::Version) -> Self {
        Version {
            tag: v.tag,
            commit_hash: v.commit_hash,
        }
    }
}

/// Extended swap storage data.
#[napi(object)]
pub struct ExtendedSwapStorageData {
    pub swap_type: String,
    pub btc_to_evm_response: Option<BtcToEvmSwapResponse>,
    pub evm_to_btc_response: Option<EvmToBtcSwapResponse>,
    pub btc_to_arkade_response: Option<BtcToArkadeSwapResponse>,
    pub onchain_to_evm_response: Option<OnchainToEvmSwapResponse>,
}

impl From<lendaswap_core::ExtendedSwapStorageData> for ExtendedSwapStorageData {
    fn from(data: lendaswap_core::ExtendedSwapStorageData) -> Self {
        match data.response {
            core_api::GetSwapResponse::BtcToEvm(r) => ExtendedSwapStorageData {
                swap_type: "BtcToEvm".to_string(),
                btc_to_evm_response: Some(r.into()),
                evm_to_btc_response: None,
                btc_to_arkade_response: None,
                onchain_to_evm_response: None,
            },
            core_api::GetSwapResponse::EvmToBtc(r) => ExtendedSwapStorageData {
                swap_type: "EvmToBtc".to_string(),
                btc_to_evm_response: None,
                evm_to_btc_response: Some(r.into()),
                btc_to_arkade_response: None,
                onchain_to_evm_response: None,
            },
            core_api::GetSwapResponse::BtcToArkade(r) => ExtendedSwapStorageData {
                swap_type: "BtcToArkade".to_string(),
                btc_to_evm_response: None,
                evm_to_btc_response: None,
                btc_to_arkade_response: Some(r.into()),
                onchain_to_evm_response: None,
            },
            core_api::GetSwapResponse::OnchainToEvm(r) => ExtendedSwapStorageData {
                swap_type: "OnchainToEvm".to_string(),
                btc_to_evm_response: None,
                evm_to_btc_response: None,
                btc_to_arkade_response: None,
                onchain_to_evm_response: Some(r.into()),
            },
        }
    }
}

// ============================================================================
// Client
// ============================================================================

/// Lendaswap client for Node.js with SQLite storage.
#[napi]
pub struct Client {
    inner: Arc<Mutex<CoreClient<SqliteStorage, SqliteStorage, SqliteStorage>>>,
}

#[napi]
impl Client {
    /// Create a new client with SQLite storage.
    #[napi(constructor)]
    pub fn new(
        storage: &SqliteStorageHandle,
        url: String,
        network: String,
        arkade_url: String,
        esplora_url: String,
    ) -> Result<Self> {
        let network: Network = network
            .parse()
            .map_err(|e: lendaswap_core::Error| Error::from_reason(format!("{}", e)))?;

        let wallet_storage = (*storage.storage).clone();
        let swap_storage = (*storage.storage).clone();
        let vtxo_swap_storage = (*storage.storage).clone();

        let inner = CoreClient::new(
            url,
            wallet_storage,
            swap_storage,
            vtxo_swap_storage,
            network,
            arkade_url,
            esplora_url,
        );

        Ok(Self {
            inner: Arc::new(Mutex::new(inner)),
        })
    }

    /// Initialize the client (generates or loads mnemonic).
    #[napi]
    pub async fn init(&self, mnemonic: Option<String>) -> Result<()> {
        let client = self.inner.lock().await;
        client
            .init(mnemonic)
            .await
            .map_err(|e| Error::from_reason(format!("{}", e)))
    }

    /// Get the current mnemonic.
    #[napi]
    pub async fn get_mnemonic(&self) -> Result<String> {
        let client = self.inner.lock().await;
        client
            .get_mnemonic()
            .await
            .map_err(|e| Error::from_reason(format!("{}", e)))
    }

    /// Get the user ID xpub.
    #[napi]
    pub async fn get_user_id_xpub(&self) -> Result<String> {
        let client = self.inner.lock().await;
        client
            .get_user_id_xpub()
            .await
            .map_err(|e| Error::from_reason(format!("{}", e)))
    }

    /// Get the API version.
    #[napi]
    pub async fn get_version(&self) -> Result<Version> {
        let client = self.inner.lock().await;
        let version = client
            .get_version()
            .await
            .map_err(|e| Error::from_reason(format!("{}", e)))?;
        Ok(version.into())
    }

    /// Get asset pairs.
    #[napi]
    pub async fn get_asset_pairs(&self) -> Result<Vec<AssetPair>> {
        let client = self.inner.lock().await;
        let pairs = client
            .get_asset_pairs()
            .await
            .map_err(|e| Error::from_reason(format!("{}", e)))?;
        Ok(pairs.into_iter().map(|p| p.into()).collect())
    }

    /// Get tokens.
    #[napi]
    pub async fn get_tokens(&self) -> Result<Vec<TokenInfo>> {
        let client = self.inner.lock().await;
        let tokens = client
            .get_tokens()
            .await
            .map_err(|e| Error::from_reason(format!("{}", e)))?;
        Ok(tokens.into_iter().map(|t| t.into()).collect())
    }

    /// Get a quote.
    #[napi]
    pub async fn get_quote(
        &self,
        from: String,
        to: String,
        base_amount: i64,
    ) -> Result<QuoteResponse> {
        let from_token = parse_token_id(&from);
        let to_token = parse_token_id(&to);

        let request = core_api::QuoteRequest {
            from: from_token,
            to: to_token,
            base_amount: base_amount as u64,
        };

        let client = self.inner.lock().await;
        let quote = client
            .get_quote(&request)
            .await
            .map_err(|e| Error::from_reason(format!("{}", e)))?;
        Ok(quote.into())
    }

    /// Create an Arkade to EVM swap.
    #[napi]
    pub async fn create_arkade_to_evm_swap(
        &self,
        target_address: String,
        source_amount: Option<i64>,
        target_amount: Option<f64>,
        target_token: String,
        target_chain: String,
        referral_code: Option<String>,
    ) -> Result<BtcToEvmSwapResponse> {
        let target_token = parse_token_id(&target_token);

        let target_amount = target_amount.and_then(Decimal::from_f64);

        let target_chain: core_api::EvmChain = target_chain
            .parse()
            .map_err(|e: String| Error::from_reason(e))?;

        let client = self.inner.lock().await;
        let swap = client
            .create_arkade_to_evm_swap(
                target_address,
                source_amount.map(|s| s as u64),
                target_amount,
                target_token,
                target_chain,
                referral_code,
            )
            .await
            .map_err(|e| Error::from_reason(format!("{:#}", e)))?;

        Ok(swap.into())
    }

    /// Create a Lightning to EVM swap.
    #[napi]
    pub async fn create_lightning_to_evm_swap(
        &self,
        target_address: String,
        source_amount: Option<i64>,
        target_amount: Option<f64>,
        target_token: String,
        target_chain: String,
        referral_code: Option<String>,
    ) -> Result<BtcToEvmSwapResponse> {
        let target_token = parse_token_id(&target_token);

        let target_amount = target_amount.and_then(Decimal::from_f64);

        let target_chain: core_api::EvmChain = target_chain
            .parse()
            .map_err(|e: String| Error::from_reason(e))?;

        let client = self.inner.lock().await;
        let swap = client
            .create_lightning_to_evm_swap(
                target_address,
                source_amount.map(|s| s as u64),
                target_amount,
                target_token,
                target_chain,
                referral_code,
            )
            .await
            .map_err(|e| Error::from_reason(format!("{:#}", e)))?;

        Ok(swap.into())
    }

    /// Create an EVM to Arkade swap.
    #[napi]
    pub async fn create_evm_to_arkade_swap(
        &self,
        target_address: String,
        user_address: String,
        source_amount: f64,
        source_token: String,
        source_chain: String,
        referral_code: Option<String>,
    ) -> Result<EvmToBtcSwapResponse> {
        let source_token = parse_token_id(&source_token);

        let source_amount = Decimal::from_f64(source_amount)
            .ok_or_else(|| Error::from_reason("Could not parse source amount"))?;

        let source_chain: core_api::EvmChain = source_chain
            .parse()
            .map_err(|e: String| Error::from_reason(e))?;

        let client = self.inner.lock().await;
        let swap = client
            .create_evm_to_arkade_swap(
                target_address,
                user_address,
                source_amount,
                source_token,
                source_chain,
                referral_code,
            )
            .await
            .map_err(|e| Error::from_reason(format!("{:#}", e)))?;

        Ok(swap.into())
    }

    /// Create an EVM to Lightning swap.
    #[napi]
    pub async fn create_evm_to_lightning_swap(
        &self,
        bolt11_invoice: String,
        user_address: String,
        source_token: String,
        source_chain: String,
        referral_code: Option<String>,
    ) -> Result<EvmToBtcSwapResponse> {
        let source_token = parse_token_id(&source_token);

        let source_chain: core_api::EvmChain = source_chain
            .parse()
            .map_err(|e: String| Error::from_reason(e))?;

        let client = self.inner.lock().await;
        let swap = client
            .create_evm_to_lightning_swap(
                bolt11_invoice,
                user_address,
                source_token,
                source_chain,
                referral_code,
            )
            .await
            .map_err(|e| Error::from_reason(format!("{:#}", e)))?;

        Ok(swap.into())
    }

    /// Create an on-chain Bitcoin to Arkade swap.
    #[napi]
    pub async fn create_bitcoin_to_arkade_swap(
        &self,
        target_arkade_address: String,
        sats_receive: i64,
        referral_code: Option<String>,
    ) -> Result<BtcToArkadeSwapResponse> {
        let client = self.inner.lock().await;
        let swap = client
            .create_btc_to_arkade_swap(target_arkade_address, sats_receive, referral_code)
            .await
            .map_err(|e| Error::from_reason(format!("{:#}", e)))?;

        Ok(swap.into())
    }

    /// Create an on-chain Bitcoin to EVM swap.
    ///
    /// User sends on-chain BTC to a Taproot HTLC address, and receives tokens
    /// on the target EVM chain (e.g., USDC on Polygon).
    #[napi]
    pub async fn create_onchain_to_evm_swap(
        &self,
        target_address: String,
        source_amount: i64,
        target_token: String,
        target_chain: String,
        referral_code: Option<String>,
    ) -> Result<OnchainToEvmSwapResponse> {
        let target_token = parse_token_id(&target_token);

        let target_chain: core_api::EvmChain = target_chain
            .parse()
            .map_err(|e: String| Error::from_reason(e))?;

        let client = self.inner.lock().await;
        let swap = client
            .create_onchain_to_evm_swap(
                target_address,
                source_amount as u64,
                target_token,
                target_chain,
                referral_code,
            )
            .await
            .map_err(|e| Error::from_reason(format!("{:#}", e)))?;

        Ok(swap.into())
    }

    /// Get swap by ID.
    #[napi]
    pub async fn get_swap(&self, id: String) -> Result<ExtendedSwapStorageData> {
        let client = self.inner.lock().await;
        let swap = client
            .get_swap(&id)
            .await
            .map_err(|e| Error::from_reason(format!("{:#}", e)))?;
        Ok(swap.into())
    }

    /// List all swaps.
    #[napi]
    pub async fn list_all(&self) -> Result<Vec<ExtendedSwapStorageData>> {
        let client = self.inner.lock().await;
        let swaps = client
            .list_all()
            .await
            .map_err(|e| Error::from_reason(format!("{:#}", e)))?;
        Ok(swaps.into_iter().map(|s| s.into()).collect())
    }

    /// Claim via Gelato relay.
    #[napi]
    pub async fn claim_gelato(&self, swap_id: String, secret: Option<String>) -> Result<()> {
        let client = self.inner.lock().await;
        client
            .claim_gelato(&swap_id, secret)
            .await
            .map_err(|e| Error::from_reason(format!("{:#}", e)))
    }

    /// Claim VHTLC.
    #[napi]
    pub async fn claim_vhtlc(&self, swap_id: String) -> Result<String> {
        let client = self.inner.lock().await;
        client
            .claim_vhtlc(&swap_id)
            .await
            .map_err(|e| Error::from_reason(format!("{:#}", e)))
    }

    /// Refund VHTLC.
    #[napi]
    pub async fn refund_vhtlc(&self, swap_id: String, refund_address: String) -> Result<String> {
        let client = self.inner.lock().await;
        client
            .refund_vhtlc(&swap_id, &refund_address)
            .await
            .map_err(|e| Error::from_reason(format!("{:#}", e)))
    }

    /// Claim BTC to Arkade VHTLC.
    #[napi]
    pub async fn claim_btc_to_arkade_vhtlc(&self, swap_id: String) -> Result<String> {
        let client = self.inner.lock().await;
        client
            .claim_btc_to_arkade_vhtlc(&swap_id)
            .await
            .map_err(|e| Error::from_reason(format!("{:#}", e)))
    }

    /// Refund on-chain HTLC.
    #[napi]
    pub async fn refund_onchain_htlc(
        &self,
        swap_id: String,
        refund_address: String,
    ) -> Result<String> {
        let client = self.inner.lock().await;
        client
            .refund_onchain_htlc(&swap_id, &refund_address)
            .await
            .map_err(|e| Error::from_reason(format!("{:#}", e)))
    }

    /// Recover swaps.
    #[napi]
    pub async fn recover_swaps(&self) -> Result<Vec<ExtendedSwapStorageData>> {
        let client = self.inner.lock().await;
        let swaps = client
            .recover_swaps()
            .await
            .map_err(|e| Error::from_reason(format!("{:#}", e)))?;
        Ok(swaps.into_iter().map(|s| s.into()).collect())
    }

    /// Clear swap storage.
    #[napi]
    pub async fn clear_swap_storage(&self) -> Result<()> {
        let client = self.inner.lock().await;
        client
            .clear_swap_storage()
            .await
            .map_err(|e| Error::from_reason(format!("{:#}", e)))
    }

    /// Delete a specific swap.
    #[napi]
    pub async fn delete_swap(&self, id: String) -> Result<()> {
        let client = self.inner.lock().await;
        client
            .delete_swap(id)
            .await
            .map_err(|e| Error::from_reason(format!("{:#}", e)))
    }
}

/// Parse a token ID string into the core TokenId type.
fn parse_token_id(s: &str) -> core_api::TokenId {
    match s {
        "btc_lightning" => core_api::TokenId::BtcLightning,
        "btc_arkade" => core_api::TokenId::BtcArkade,
        "btc_onchain" => core_api::TokenId::BtcOnchain,
        other => core_api::TokenId::Coin(other.to_string()),
    }
}

/// Client builder for Node.js.
#[napi]
pub struct ClientBuilder {
    storage: Option<Arc<SqliteStorage>>,
    url: Option<String>,
    network: Option<String>,
    arkade_url: Option<String>,
    esplora_url: Option<String>,
}

#[napi]
impl ClientBuilder {
    /// Create a new client builder.
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            storage: None,
            url: None,
            network: None,
            arkade_url: None,
            esplora_url: None,
        }
    }

    /// Set the SQLite storage.
    #[napi]
    pub fn storage(&mut self, storage: &SqliteStorageHandle) -> &Self {
        self.storage = Some(storage.storage.clone());
        self
    }

    /// Set the API URL.
    #[napi]
    pub fn url(&mut self, url: String) -> &Self {
        self.url = Some(url);
        self
    }

    /// Set the Bitcoin network.
    #[napi]
    pub fn network(&mut self, network: String) -> &Self {
        self.network = Some(network);
        self
    }

    /// Set the Arkade URL.
    #[napi]
    pub fn arkade_url(&mut self, url: String) -> &Self {
        self.arkade_url = Some(url);
        self
    }

    /// Set the Esplora URL.
    #[napi]
    pub fn esplora_url(&mut self, url: String) -> &Self {
        self.esplora_url = Some(url);
        self
    }

    /// Build the client.
    #[napi]
    pub fn build(&self) -> Result<Client> {
        let storage = self
            .storage
            .as_ref()
            .ok_or_else(|| Error::from_reason("storage is required"))?;
        let url = self
            .url
            .as_ref()
            .ok_or_else(|| Error::from_reason("url is required"))?;
        let network = self
            .network
            .as_ref()
            .ok_or_else(|| Error::from_reason("network is required"))?;
        let arkade_url = self
            .arkade_url
            .as_ref()
            .ok_or_else(|| Error::from_reason("arkadeUrl is required"))?;
        let esplora_url = self
            .esplora_url
            .as_ref()
            .ok_or_else(|| Error::from_reason("esploraUrl is required"))?;

        let network: Network = network
            .parse()
            .map_err(|e: lendaswap_core::Error| Error::from_reason(format!("{}", e)))?;

        let wallet_storage = (**storage).clone();
        let swap_storage = (**storage).clone();
        let vtxo_swap_storage = (**storage).clone();

        let inner = CoreClient::new(
            url.clone(),
            wallet_storage,
            swap_storage,
            vtxo_swap_storage,
            network,
            arkade_url.clone(),
            esplora_url.clone(),
        );

        Ok(Client {
            inner: Arc::new(Mutex::new(inner)),
        })
    }
}

impl Default for ClientBuilder {
    fn default() -> Self {
        Self::new()
    }
}
