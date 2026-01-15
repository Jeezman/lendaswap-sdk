use crate::JsSwapStorageAdapter;
use crate::JsSwapStorageProvider;
use crate::JsVtxoSwapStorageAdapter;
use crate::JsVtxoSwapStorageProvider;
use crate::JsWalletStorageAdapter;
use crate::JsWalletStorageProvider;
use crate::TokenId;
use crate::Version;
use crate::js_types::SwapParams;
use crate::to_js_value;
use lendaswap_core;
use lendaswap_core::api as core_api;
use rust_decimal::Decimal;
use rust_decimal::prelude::FromPrimitive;
use wasm_bindgen::JsValue;
use wasm_bindgen::prelude::wasm_bindgen;

/// Chain type for token information.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy)]
pub enum Chain {
    Arkade,
    Lightning,
    Bitcoin,
    Polygon,
    Ethereum,
}

/// Bitcoin network type.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Network {
    Bitcoin,
    Testnet,
    Regtest,
    Mutinynet,
}

impl From<&str> for Network {
    fn from(s: &str) -> Self {
        match s {
            "bitcoin" => Network::Bitcoin,
            "testnet" => Network::Testnet,
            "regtest" => Network::Regtest,
            "mutinynet" => Network::Mutinynet,
            _ => Network::Bitcoin, // default fallback
        }
    }
}

/// Swap status for BTC/EVM swaps.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SwapStatus {
    Pending,
    ClientFundingSeen,
    ClientFunded,
    ClientRefunded,
    ServerFunded,
    ClientRedeeming,
    ClientRedeemed,
    ServerRedeemed,
    ClientFundedServerRefunded,
    ClientRefundedServerFunded,
    ClientRefundedServerRefunded,
    Expired,
    ClientInvalidFunded,
    ClientFundedTooLate,
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

/// Returns a human-readable string representation of the swap status.
#[wasm_bindgen(js_name = "swapStatusToString")]
pub fn swap_status_to_string(status: SwapStatus) -> String {
    match status {
        SwapStatus::Pending => "Pending".to_string(),
        SwapStatus::ClientFundingSeen => "Client Funding Seen".to_string(),
        SwapStatus::ClientFunded => "Client Funded".to_string(),
        SwapStatus::ClientRefunded => "Client Refunded".to_string(),
        SwapStatus::ServerFunded => "Server Funded".to_string(),
        SwapStatus::ClientRedeeming => "Client Redeeming".to_string(),
        SwapStatus::ClientRedeemed => "Client Redeemed".to_string(),
        SwapStatus::ServerRedeemed => "Server Redeemed".to_string(),
        SwapStatus::ClientFundedServerRefunded => "Client Funded, Server Refunded".to_string(),
        SwapStatus::ClientRefundedServerFunded => "Client Refunded, Server Funded".to_string(),
        SwapStatus::ClientRefundedServerRefunded => "Client Refunded, Server Refunded".to_string(),
        SwapStatus::Expired => "Expired".to_string(),
        SwapStatus::ClientInvalidFunded => "Client Invalid Funded".to_string(),
        SwapStatus::ClientFundedTooLate => "Client Funded Too Late".to_string(),
        SwapStatus::ClientRedeemedAndClientRefunded => "Client Redeemed and Refunded".to_string(),
    }
}

impl From<core_api::Chain> for Chain {
    fn from(c: core_api::Chain) -> Self {
        match c {
            core_api::Chain::Arkade => Chain::Arkade,
            core_api::Chain::Lightning => Chain::Lightning,
            core_api::Chain::Bitcoin => Chain::Bitcoin,
            core_api::Chain::Polygon => Chain::Polygon,
            core_api::Chain::Ethereum => Chain::Ethereum,
        }
    }
}

/// Token information.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct TokenInfo {
    pub token_id: TokenId,
    pub symbol: String,
    pub chain: Chain,
    pub name: String,
    pub decimals: u8,
}

impl From<core_api::TokenInfo> for TokenInfo {
    fn from(t: core_api::TokenInfo) -> Self {
        TokenInfo {
            token_id: TokenId(t.token_id),
            symbol: t.symbol,
            chain: t.chain.into(),
            name: t.name,
            decimals: t.decimals,
        }
    }
}
/// Token information.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct AssetPair {
    pub source: TokenInfo,
    pub target: TokenInfo,
}

impl From<core_api::AssetPair> for AssetPair {
    fn from(t: core_api::AssetPair) -> Self {
        AssetPair {
            source: t.source.into(),
            target: t.target.into(),
        }
    }
}

/// Quote response from the API.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct QuoteResponse {
    #[wasm_bindgen(js_name = "exchangeRate")]
    pub exchange_rate: String,
    #[wasm_bindgen(js_name = "networkFee")]
    pub network_fee: u64,
    #[wasm_bindgen(js_name = "protocolFee")]
    pub protocol_fee: u64,
    #[wasm_bindgen(js_name = "protocolFeeRate")]
    pub protocol_fee_rate: f64,
    #[wasm_bindgen(js_name = "minAmount")]
    pub min_amount: u64,
    #[wasm_bindgen(js_name = "maxAmount")]
    pub max_amount: u64,
}

impl From<core_api::QuoteResponse> for QuoteResponse {
    fn from(r: core_api::QuoteResponse) -> Self {
        QuoteResponse {
            exchange_rate: r.exchange_rate,
            network_fee: r.network_fee,
            protocol_fee: r.protocol_fee,
            protocol_fee_rate: r.protocol_fee_rate,
            min_amount: r.min_amount,
            max_amount: r.max_amount,
        }
    }
}

/// Estimate response for a VTXO swap.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct EstimateVtxoSwapResponse {
    /// Total fee in satoshis
    pub fee_sats: i64,
    /// Total input amount in satoshis
    pub total_input_sats: i64,
    /// Amount user will receive (total_input_sats - fee_sats)
    pub output_sats: i64,
    /// Number of VTXOs being refreshed
    pub vtxo_count: u32,
    /// Expected expiry timestamp (Unix) of the resulting VTXOs
    pub expected_vtxo_expiry: i64,
}

impl From<core_api::EstimateVtxoSwapResponse> for EstimateVtxoSwapResponse {
    fn from(r: core_api::EstimateVtxoSwapResponse) -> Self {
        EstimateVtxoSwapResponse {
            fee_sats: r.fee_sats,
            total_input_sats: r.total_input_sats,
            output_sats: r.output_sats,
            vtxo_count: r.vtxo_count as u32,
            expected_vtxo_expiry: r.expected_vtxo_expiry,
        }
    }
}

/// Response from creating/getting a VTXO swap.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct VtxoSwapResponse {
    /// Swap ID
    pub id: String,
    /// Swap status
    pub status: String,
    /// Creation timestamp (RFC3339)
    pub created_at: String,
    // Client VHTLC params
    /// Client's VHTLC address
    pub client_vhtlc_address: String,
    /// Amount client should fund in satoshis
    pub client_fund_amount_sats: i64,
    /// Client's public key
    pub client_pk: String,
    /// Client VHTLC locktime (Unix timestamp)
    pub client_locktime: u64,
    /// Client claim delay in seconds
    pub client_unilateral_claim_delay: i64,
    /// Client refund delay in seconds
    pub client_unilateral_refund_delay: i64,
    /// Client refund without receiver delay in seconds
    pub client_unilateral_refund_without_receiver_delay: i64,

    // Server VHTLC params
    /// Server's VHTLC address
    pub server_vhtlc_address: String,
    /// Amount server will fund in satoshis
    pub server_fund_amount_sats: i64,
    /// Server's public key
    pub server_pk: String,
    /// Server VHTLC locktime (Unix timestamp)
    pub server_locktime: u64,
    /// Server claim delay in seconds
    pub server_unilateral_claim_delay: i64,
    /// Server refund delay in seconds
    pub server_unilateral_refund_delay: i64,
    /// Server refund without receiver delay in seconds
    pub server_unilateral_refund_without_receiver_delay: i64,

    // Common params
    /// Arkade server's public key
    pub arkade_server_pk: String,
    /// The preimage hash (SHA256)
    pub preimage_hash: String,
    /// Fee in satoshis
    pub fee_sats: i64,
    /// Bitcoin network
    pub network: String,
}

impl From<core_api::VtxoSwapResponse> for VtxoSwapResponse {
    fn from(r: core_api::VtxoSwapResponse) -> Self {
        VtxoSwapResponse {
            id: r.id.to_string(),
            status: format!("{:?}", r.status).to_lowercase(),
            created_at: r
                .created_at
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default(),
            client_vhtlc_address: r.client_vhtlc_address,
            client_fund_amount_sats: r.client_fund_amount_sats,
            client_pk: r.client_pk,
            client_locktime: r.client_locktime,
            client_unilateral_claim_delay: r.client_unilateral_claim_delay,
            client_unilateral_refund_delay: r.client_unilateral_refund_delay,
            client_unilateral_refund_without_receiver_delay: r
                .client_unilateral_refund_without_receiver_delay,
            server_vhtlc_address: r.server_vhtlc_address,
            server_fund_amount_sats: r.server_fund_amount_sats,
            server_pk: r.server_pk,
            server_locktime: r.server_locktime,
            server_unilateral_claim_delay: r.server_unilateral_claim_delay,
            server_unilateral_refund_delay: r.server_unilateral_refund_delay,
            server_unilateral_refund_without_receiver_delay: r
                .server_unilateral_refund_without_receiver_delay,
            arkade_server_pk: r.arkade_server_pk,
            preimage_hash: r.preimage_hash,
            fee_sats: r.fee_sats,
            network: r.network,
        }
    }
}

/// BTC to EVM swap response.
/// Fields from SwapCommonFields are flattened.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct BtcToEvmSwapResponse {
    // Common fields (flattened)
    pub id: String,
    pub status: SwapStatus,
    pub hash_lock: String,
    pub fee_sats: i64,
    pub asset_amount: f64,
    pub sender_pk: String,
    pub receiver_pk: String,
    pub server_pk: String,
    pub refund_locktime: u32,
    pub unilateral_claim_delay: i64,
    pub unilateral_refund_delay: i64,
    pub unilateral_refund_without_receiver_delay: i64,
    pub network: Network,
    pub created_at: String,
    // BTC to EVM specific fields
    pub htlc_address_evm: String,
    pub htlc_address_arkade: String,
    pub user_address_evm: String,
    pub ln_invoice: String,
    pub sats_receive: i64,
    pub source_token: TokenId,
    pub target_token: TokenId,
    pub bitcoin_htlc_claim_txid: Option<String>,
    pub bitcoin_htlc_fund_txid: Option<String>,
    pub evm_htlc_claim_txid: Option<String>,
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
            sender_pk: r.common.sender_pk,
            receiver_pk: r.common.receiver_pk,
            server_pk: r.common.server_pk,
            refund_locktime: r.common.vhtlc_refund_locktime,
            unilateral_claim_delay: r.common.unilateral_claim_delay,
            unilateral_refund_delay: r.common.unilateral_refund_delay,
            unilateral_refund_without_receiver_delay: r
                .common
                .unilateral_refund_without_receiver_delay,
            network: r.common.network.as_str().into(),
            created_at: r
                .common
                .created_at
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default(),
            htlc_address_evm: r.htlc_address_evm,
            htlc_address_arkade: r.htlc_address_arkade,
            user_address_evm: r.user_address_evm,
            ln_invoice: r.ln_invoice,
            sats_receive: r.sats_receive,
            source_token: TokenId(r.common.source_token),
            target_token: TokenId(r.common.target_token),
            bitcoin_htlc_claim_txid: r.bitcoin_htlc_claim_txid,
            bitcoin_htlc_fund_txid: r.bitcoin_htlc_fund_txid,
            evm_htlc_claim_txid: r.evm_htlc_claim_txid,
            evm_htlc_fund_txid: r.evm_htlc_fund_txid,
        }
    }
}

/// EVM to BTC swap response.
/// Fields from SwapCommonFields are flattened.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct EvmToBtcSwapResponse {
    // Common fields (flattened)
    pub id: String,
    pub status: SwapStatus,
    pub hash_lock: String,
    pub fee_sats: i64,
    pub asset_amount: f64,
    pub sender_pk: String,
    pub receiver_pk: String,
    pub server_pk: String,
    pub refund_locktime: u32,
    pub unilateral_claim_delay: i64,
    pub unilateral_refund_delay: i64,
    pub unilateral_refund_without_receiver_delay: i64,
    pub network: Network,
    pub created_at: String,
    // EVM to BTC specific fields
    pub htlc_address_evm: String,
    pub htlc_address_arkade: String,
    pub user_address_evm: String,
    pub user_address_arkade: Option<String>,
    pub ln_invoice: String,
    pub source_token: TokenId,
    pub target_token: TokenId,
    pub sats_receive: i64,
    pub bitcoin_htlc_fund_txid: Option<String>,
    pub bitcoin_htlc_claim_txid: Option<String>,
    pub evm_htlc_claim_txid: Option<String>,
    pub evm_htlc_fund_txid: Option<String>,
    pub create_swap_tx: Option<String>,
    pub approve_tx: Option<String>,
    pub gelato_forwarder_address: Option<String>,
    pub gelato_user_nonce: Option<String>,
    pub gelato_user_deadline: Option<String>,
    pub source_token_address: String,
}

impl From<core_api::EvmToBtcSwapResponse> for EvmToBtcSwapResponse {
    fn from(r: core_api::EvmToBtcSwapResponse) -> Self {
        EvmToBtcSwapResponse {
            id: r.common.id.to_string(),
            status: r.common.status.into(),
            hash_lock: r.common.hash_lock,
            fee_sats: r.common.fee_sats,
            asset_amount: r.common.asset_amount,
            sender_pk: r.common.sender_pk,
            receiver_pk: r.common.receiver_pk,
            server_pk: r.common.server_pk,
            refund_locktime: r.common.vhtlc_refund_locktime,
            unilateral_claim_delay: r.common.unilateral_claim_delay,
            unilateral_refund_delay: r.common.unilateral_refund_delay,
            unilateral_refund_without_receiver_delay: r
                .common
                .unilateral_refund_without_receiver_delay,
            network: r.common.network.as_str().into(),
            created_at: r
                .common
                .created_at
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default(),
            htlc_address_evm: r.htlc_address_evm,
            htlc_address_arkade: r.htlc_address_arkade,
            user_address_evm: r.user_address_evm,
            user_address_arkade: r.user_address_arkade,
            ln_invoice: r.ln_invoice,
            source_token: TokenId(r.common.source_token),
            target_token: TokenId(r.common.target_token),
            sats_receive: r.sats_receive,
            bitcoin_htlc_fund_txid: r.bitcoin_htlc_fund_txid,
            bitcoin_htlc_claim_txid: r.bitcoin_htlc_claim_txid,
            evm_htlc_claim_txid: r.evm_htlc_claim_txid,
            evm_htlc_fund_txid: r.evm_htlc_fund_txid,
            create_swap_tx: r.create_swap_tx,
            approve_tx: r.approve_tx,
            gelato_forwarder_address: r.gelato_forwarder_address,
            gelato_user_nonce: r.gelato_user_nonce,
            gelato_user_deadline: r.gelato_user_deadline,
            source_token_address: r.source_token_address,
        }
    }
}

// BTC to EVM swap response.
/// Fields from SwapCommonFields are flattened.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct BtcToArkadeSwapResponse {
    // Common fields (flattened)
    pub id: String,
    pub status: SwapStatus,
    pub btc_htlc_address: String,
    pub asset_amount: i64,
    pub sats_receive: i64,
    pub fee_sats: i64,
    pub hash_lock: String,
    pub btc_refund_locktime: i64,
    pub arkade_vhtlc_address: String,
    pub target_arkade_address: String,
    pub btc_fund_txid: Option<String>,
    pub btc_claim_txid: Option<String>,
    pub arkade_fund_txid: Option<String>,
    pub arkade_claim_txid: Option<String>,
    pub network: String,
    pub created_at: String,
    pub server_vhtlc_pk: String,
    pub arkade_server_pk: String,
    pub vhtlc_refund_locktime: i64,
    pub unilateral_claim_delay: i64,
    pub unilateral_refund_delay: i64,
    pub unilateral_refund_without_receiver_delay: i64,
    pub source_token: TokenId,
    pub target_token: TokenId,
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
            btc_refund_locktime: r.btc_refund_locktime,
            arkade_vhtlc_address: r.arkade_vhtlc_address,
            target_arkade_address: r.target_arkade_address,
            btc_fund_txid: r.btc_fund_txid,
            btc_claim_txid: r.btc_claim_txid,
            arkade_fund_txid: r.arkade_fund_txid,
            arkade_claim_txid: r.arkade_claim_txid,
            network: r.network,
            created_at: r
                .created_at
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_default(),
            server_vhtlc_pk: r.server_vhtlc_pk,
            arkade_server_pk: r.arkade_server_pk,
            vhtlc_refund_locktime: r.vhtlc_refund_locktime,
            unilateral_claim_delay: r.unilateral_claim_delay,
            unilateral_refund_delay: r.unilateral_refund_delay,
            unilateral_refund_without_receiver_delay: r.unilateral_refund_without_receiver_delay,
            source_token: TokenId(r.source_token),
            target_token: TokenId(r.target_token),
        }
    }
}

impl TryFrom<&VtxoSwapResponse> for core_api::VtxoSwapResponse {
    type Error = String;

    fn try_from(r: &VtxoSwapResponse) -> Result<Self, Self::Error> {
        use core_api::VtxoSwapStatus;
        use time::OffsetDateTime;
        use uuid::Uuid;

        let id = Uuid::parse_str(&r.id).map_err(|e| format!("Invalid UUID: {}", e))?;

        let status = match r.status.as_str() {
            "pending" => VtxoSwapStatus::Pending,
            "clientfunded" => VtxoSwapStatus::ClientFunded,
            "serverfunded" => VtxoSwapStatus::ServerFunded,
            "clientredeemed" => VtxoSwapStatus::ClientRedeemed,
            "serverredeemed" => VtxoSwapStatus::ServerRedeemed,
            "clientrefunded" => VtxoSwapStatus::ClientRefunded,
            "clientfundedserverrefunded" => VtxoSwapStatus::ClientFundedServerRefunded,
            "expired" => VtxoSwapStatus::Expired,
            other => return Err(format!("Unknown status: {}", other)),
        };

        let created_at = OffsetDateTime::parse(
            &r.created_at,
            &time::format_description::well_known::Rfc3339,
        )
        .map_err(|e| format!("Invalid timestamp: {}", e))?;

        Ok(core_api::VtxoSwapResponse {
            id,
            status,
            created_at,
            client_vhtlc_address: r.client_vhtlc_address.clone(),
            client_fund_amount_sats: r.client_fund_amount_sats,
            client_pk: r.client_pk.clone(),
            client_locktime: r.client_locktime,
            client_unilateral_claim_delay: r.client_unilateral_claim_delay,
            client_unilateral_refund_delay: r.client_unilateral_refund_delay,
            client_unilateral_refund_without_receiver_delay: r
                .client_unilateral_refund_without_receiver_delay,
            server_vhtlc_address: r.server_vhtlc_address.clone(),
            server_fund_amount_sats: r.server_fund_amount_sats,
            server_pk: r.server_pk.clone(),
            server_locktime: r.server_locktime,
            server_unilateral_claim_delay: r.server_unilateral_claim_delay,
            server_unilateral_refund_delay: r.server_unilateral_refund_delay,
            server_unilateral_refund_without_receiver_delay: r
                .server_unilateral_refund_without_receiver_delay,
            arkade_server_pk: r.arkade_server_pk.clone(),
            preimage_hash: r.preimage_hash.clone(),
            fee_sats: r.fee_sats,
            network: r.network.clone(),
        })
    }
}

/// Result from creating a VTXO swap.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct CreateVtxoSwapResult {
    /// The swap response
    pub response: VtxoSwapResponse,
    /// The swap parameters (needed for claim/refund)
    pub swap_params: SwapParams,
}

/// Extended VTXO swap data that combines the API response with client-side swap parameters.
/// This is the data structure stored for each VTXO swap.
#[wasm_bindgen(getter_with_clone)]
#[derive(Debug, Clone)]
pub struct ExtendedVtxoSwapStorageData {
    /// The VTXO swap response from the API
    pub response: VtxoSwapResponse,
    /// The client-side swap parameters (keys, preimage, etc.)
    pub swap_params: SwapParams,
}

impl From<lendaswap_core::ExtendedVtxoSwapStorageData> for ExtendedVtxoSwapStorageData {
    fn from(data: lendaswap_core::ExtendedVtxoSwapStorageData) -> Self {
        ExtendedVtxoSwapStorageData {
            response: data.response.into(),
            swap_params: data.swap_params.into(),
        }
    }
}

/// Extended swap storage data that combines the API response with client-side swap parameters.
/// This is the data structure stored for each swap.
///
/// Note: The `response` field contains a `GetSwapResponse` enum which cannot be directly
/// exposed via wasm-bindgen. It is serialized to a plain JS object via serde.
#[wasm_bindgen]
#[derive(Debug, Clone)]
pub struct ExtendedSwapStorageData {
    response: lendaswap_core::api::GetSwapResponse,
    swap_params: lendaswap_core::SwapParams,
}

/// Swap type discriminator.
#[wasm_bindgen]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SwapType {
    BtcToEvm,
    EvmToBtc,
    BtcToArkade,
}

#[wasm_bindgen]
impl ExtendedSwapStorageData {
    /// Get the swap type.
    #[wasm_bindgen(js_name = "swapType", getter)]
    pub fn swap_type(&self) -> SwapType {
        match &self.response {
            core_api::GetSwapResponse::BtcToEvm(_) => SwapType::BtcToEvm,
            core_api::GetSwapResponse::EvmToBtc(_) => SwapType::EvmToBtc,
            core_api::GetSwapResponse::BtcToArkade(_) => SwapType::BtcToArkade,
        }
    }

    /// Get the BTC to EVM swap response, if this is a BTC to EVM swap.
    /// Returns undefined if this is an EVM to BTC swap.
    #[wasm_bindgen(js_name = "btcToEvmResponse", getter)]
    pub fn btc_to_evm_response(&self) -> Option<BtcToEvmSwapResponse> {
        match &self.response {
            core_api::GetSwapResponse::BtcToEvm(r) => Some(r.clone().into()),
            core_api::GetSwapResponse::EvmToBtc(_) => None,
            core_api::GetSwapResponse::BtcToArkade(_) => None,
        }
    }

    /// Get the EVM to BTC swap response, if this is an EVM to BTC swap.
    /// Returns undefined if this is a BTC to EVM swap.
    #[wasm_bindgen(js_name = "evmToBtcResponse", getter)]
    pub fn evm_to_btc_response(&self) -> Option<EvmToBtcSwapResponse> {
        match &self.response {
            core_api::GetSwapResponse::BtcToEvm(_) => None,
            core_api::GetSwapResponse::EvmToBtc(r) => Some(r.clone().into()),
            core_api::GetSwapResponse::BtcToArkade(_) => None,
        }
    }

    /// Get the Onchain to Arkade swap response, if this is an Onchian to Arkade swap.
    /// Returns undefined if not.
    #[wasm_bindgen(js_name = "btcToArkadeResponse", getter)]
    pub fn btc_to_arkade_response(&self) -> Option<BtcToArkadeSwapResponse> {
        match &self.response {
            core_api::GetSwapResponse::BtcToEvm(_) => None,
            core_api::GetSwapResponse::EvmToBtc(_) => None,
            core_api::GetSwapResponse::BtcToArkade(r) => Some(r.clone().into()),
        }
    }

    /// Get the swap parameters.
    #[wasm_bindgen(js_name = "swapParams", getter)]
    pub fn swap_params(&self) -> SwapParams {
        self.swap_params.clone().into()
    }
}

impl From<lendaswap_core::ExtendedSwapStorageData> for ExtendedSwapStorageData {
    fn from(data: lendaswap_core::ExtendedSwapStorageData) -> Self {
        ExtendedSwapStorageData {
            response: data.response,
            swap_params: data.swap_params,
        }
    }
}

/// Lendaswap client.
#[wasm_bindgen]
pub struct Client {
    inner: lendaswap_core::Client<
        JsWalletStorageAdapter,
        JsSwapStorageAdapter,
        JsVtxoSwapStorageAdapter,
    >,
}

#[wasm_bindgen]
impl Client {
    /// Create a new client with separate wallet, swap, and VTXO swap storage.
    ///
    /// # Arguments
    /// * `base_url` - The Lendaswap API URL
    /// * `wallet_storage` - Storage provider for wallet data (mnemonic, key index)
    /// * `swap_storage` - Storage provider for swap data
    /// * `vtxo_swap_storage` - Storage provider for VTXO swap data
    /// * `network` - The Bitcoin network ("bitcoin" or "testnet")
    /// * `arkade_url` - The Arkade server URL
    /// * `esplora_url` - The Esplora API URL for on-chain Bitcoin operations
    #[wasm_bindgen(constructor)]
    pub fn new(
        base_url: String,
        wallet_storage: JsWalletStorageProvider,
        swap_storage: JsSwapStorageProvider,
        vtxo_swap_storage: JsVtxoSwapStorageProvider,
        network: String,
        arkade_url: String,
        esplora_url: String,
    ) -> Result<Client, JsValue> {
        let network = network
            .parse()
            .map_err(|e: lendaswap_core::Error| JsValue::from_str(&format!("{}", e)))?;
        let wallet_adapter = JsWalletStorageAdapter::new(wallet_storage);
        let swap_adapter = JsSwapStorageAdapter::new(swap_storage);
        let vtxo_swap_adapter = JsVtxoSwapStorageAdapter::new(vtxo_swap_storage);

        Ok(Client {
            inner: lendaswap_core::Client::new(
                base_url,
                wallet_adapter,
                swap_adapter,
                vtxo_swap_adapter,
                network,
                arkade_url,
                esplora_url,
            ),
        })
    }

    #[wasm_bindgen(js_name = "init")]
    pub async fn init(&self, mnemonic: Option<String>) -> Result<(), JsValue> {
        self.inner
            .init(mnemonic)
            .await
            .map_err(|e: lendaswap_core::Error| JsValue::from_str(&format!("{}", e)))?;
        Ok(())
    }

    /// Create an Arkade to EVM swap.
    #[wasm_bindgen(js_name = "createArkadeToEvmSwap")]
    pub async fn create_arkade_to_evm_swap(
        &self,
        target_address: String,
        source_amount: Option<u64>,
        target_amount: Option<f64>,
        target_token: String,
        target_chain: String,
        referral_code: Option<String>,
    ) -> Result<BtcToEvmSwapResponse, JsValue> {
        let target_token = match target_token.as_str() {
            "btc_lightning" => core_api::TokenId::BtcLightning,
            "btc_arkade" => core_api::TokenId::BtcArkade,
            // All other tokens use the Coin variant
            other => core_api::TokenId::Coin(other.to_string()),
        };

        let target_amount = match target_amount {
            Some(target_amount) => {
                let t = Decimal::from_f64(target_amount)
                    .ok_or_else(|| JsValue::from_str("Could not parse target amount"))?;
                Some(t)
            }
            None => None,
        };

        let target_chain: core_api::EvmChain = target_chain
            .parse()
            .map_err(|e: String| JsValue::from_str(&e))?;

        let swap = self
            .inner
            .create_arkade_to_evm_swap(
                target_address,
                source_amount,
                target_amount,
                target_token,
                target_chain,
                referral_code,
            )
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(swap.into())
    }

    /// Create a Lightning to EVM swap.
    #[wasm_bindgen(js_name = "createLightningToEvmSwap")]
    pub async fn create_lightning_to_evm_swap(
        &self,
        target_address: String,
        source_amount: Option<u64>,
        target_amount: Option<f64>,
        target_token: String,
        target_chain: String,
        referral_code: Option<String>,
    ) -> Result<BtcToEvmSwapResponse, JsValue> {
        let target_token = match target_token.as_str() {
            "btc_lightning" => core_api::TokenId::BtcLightning,
            "btc_arkade" => core_api::TokenId::BtcArkade,
            // All other tokens use the Coin variant
            other => core_api::TokenId::Coin(other.to_string()),
        };

        let target_amount = match target_amount {
            Some(target_amount) => {
                let t = Decimal::from_f64(target_amount)
                    .ok_or_else(|| JsValue::from_str("Could not parse target amount"))?;
                Some(t)
            }
            None => None,
        };

        let target_chain: core_api::EvmChain = target_chain
            .parse()
            .map_err(|e: String| JsValue::from_str(&e))?;

        let swap = self
            .inner
            .create_lightning_to_evm_swap(
                target_address,
                source_amount,
                target_amount,
                target_token,
                target_chain,
                referral_code,
            )
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(swap.into())
    }

    /// Create an EVM to Arkade swap.
    #[wasm_bindgen(js_name = "createEvmToArkadeSwap")]
    pub async fn create_evm_to_arkade_swap(
        &self,
        target_address: String,
        user_address: String,
        source_amount: f64,
        source_token: String,
        source_chain: String,
        referral_code: Option<String>,
    ) -> Result<EvmToBtcSwapResponse, JsValue> {
        let source_token = match source_token.as_str() {
            "btc_lightning" => core_api::TokenId::BtcLightning,
            "btc_arkade" => core_api::TokenId::BtcArkade,
            // All other tokens use the Coin variant
            other => core_api::TokenId::Coin(other.to_string()),
        };

        let source_amount = Decimal::from_f64(source_amount)
            .ok_or_else(|| JsValue::from_str("Could not parse target amount"))?;

        let source_chain: core_api::EvmChain = source_chain
            .parse()
            .map_err(|e: String| JsValue::from_str(&e))?;

        let swap = self
            .inner
            .create_evm_to_arkade_swap(
                target_address,
                user_address,
                source_amount,
                source_token,
                source_chain,
                referral_code,
            )
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(swap.into())
    }

    /// Create an EVM to Lightning swap.
    #[wasm_bindgen(js_name = "createEvmToLightningSwap")]
    pub async fn create_evm_to_lightning_swap(
        &self,
        bolt11_invoice: String,
        user_address: String,
        source_token: String,
        source_chain: String,
        referral_code: Option<String>,
    ) -> Result<EvmToBtcSwapResponse, JsValue> {
        let source_token = match source_token.as_str() {
            "btc_lightning" => core_api::TokenId::BtcLightning,
            "btc_arkade" => core_api::TokenId::BtcArkade,
            // All other tokens use the Coin variant
            other => core_api::TokenId::Coin(other.to_string()),
        };

        let source_chain: core_api::EvmChain = source_chain
            .parse()
            .map_err(|e: String| JsValue::from_str(&e))?;

        let swap = self
            .inner
            .create_evm_to_lightning_swap(
                bolt11_invoice,
                user_address,
                source_token,
                source_chain,
                referral_code,
            )
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(swap.into())
    }

    #[wasm_bindgen(js_name = "getAssetPairs")]
    pub async fn get_asset_pairs(&self) -> Result<Vec<AssetPair>, JsValue> {
        let pairs = self
            .inner
            .get_asset_pairs()
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        let pairs: Vec<AssetPair> = pairs.into_iter().map(|t| t.into()).collect();

        Ok(pairs)
    }

    #[wasm_bindgen(js_name = "getTokens")]
    pub async fn get_tokens(&self) -> Result<Vec<TokenInfo>, JsValue> {
        let tokens = self
            .inner
            .get_tokens()
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        let tokens: Vec<TokenInfo> = tokens.into_iter().map(|t| t.into()).collect();
        Ok(tokens)
    }

    /// Get a quote.
    #[wasm_bindgen(js_name = "getQuote")]
    pub async fn get_quote(
        &self,
        from: String,
        to: String,
        base_amount: u64,
    ) -> Result<QuoteResponse, JsValue> {
        let from_token = TokenId::from_string(&from)?.0;
        let to_token = TokenId::from_string(&to)?.0;

        let request = core_api::QuoteRequest {
            from: from_token,
            to: to_token,
            base_amount,
        };

        self.inner
            .get_quote(&request)
            .await
            .map(Into::into)
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))
    }

    /// Get swap by ID.
    #[wasm_bindgen(js_name = "getSwap")]
    pub async fn get_swap(&self, id: String) -> Result<ExtendedSwapStorageData, JsValue> {
        let swap = self
            .inner
            .get_swap(&id)
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(swap.into())
    }

    /// Get all swaps.
    #[wasm_bindgen(js_name = "listAll")]
    pub async fn list_all(&self) -> Result<Vec<ExtendedSwapStorageData>, JsValue> {
        let swaps = self
            .inner
            .list_all()
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(swaps.into_iter().map(|s| s.into()).collect())
    }

    #[wasm_bindgen(js_name = "claimGelato")]
    pub async fn claim_gelato(
        &self,
        swap_id: String,
        secret: Option<String>,
    ) -> Result<(), JsValue> {
        self.inner
            .claim_gelato(swap_id.as_str(), secret)
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(())
    }

    #[wasm_bindgen(js_name = "amountsForSwap")]
    pub async fn amounts_for_swap(&self, swap_id: String) -> Result<JsValue, JsValue> {
        let amounts = self
            .inner
            .amounts_for_swap(swap_id.as_str())
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        to_js_value(&amounts)
    }

    #[wasm_bindgen(js_name = "claimVhtlc")]
    pub async fn claim_vhtlc(&self, swap_id: String) -> Result<(), JsValue> {
        self.inner
            .claim_vhtlc(swap_id.as_str())
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(())
    }

    #[wasm_bindgen(js_name = "refundVhtlc")]
    pub async fn refund_vhtlc(
        &self,
        swap_id: String,
        refund_address: String,
    ) -> Result<String, JsValue> {
        let txid = self
            .inner
            .refund_vhtlc(swap_id.as_str(), refund_address.as_str())
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(txid)
    }

    /// Create an on-chain Bitcoin to Arkade swap.
    #[wasm_bindgen(js_name = "createBitcoinToArkadeSwap")]
    pub async fn create_bitcoin_to_arkade_swap(
        &self,
        target_arkade_address: String,
        sats_receive: i64,
        referral_code: Option<String>,
    ) -> Result<BtcToArkadeSwapResponse, JsValue> {
        let swap = self
            .inner
            .create_btc_to_arkade_swap(target_arkade_address, sats_receive, referral_code)
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(swap.into())
    }

    /// Claim the Arkade VHTLC for a BTC-to-Arkade swap.
    #[wasm_bindgen(js_name = "claimBtcToArkadeVhtlc")]
    pub async fn claim_btc_to_arkade_vhtlc(&self, swap_id: String) -> Result<String, JsValue> {
        let txid = self
            .inner
            .claim_btc_to_arkade_vhtlc(swap_id.as_str())
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(txid)
    }

    /// Refund from the on-chain Bitcoin HTLC after timeout.
    #[wasm_bindgen(js_name = "refundOnchainHtlc")]
    pub async fn refund_onchain_htlc(
        &self,
        swap_id: String,
        refund_address: String,
    ) -> Result<String, JsValue> {
        let txid = self
            .inner
            .refund_onchain_htlc(swap_id.as_str(), refund_address.as_str())
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(txid)
    }

    /// Get API version.
    #[wasm_bindgen(js_name = "getVersion")]
    pub async fn get_version(&self) -> Result<Version, JsValue> {
        self.inner
            .get_version()
            .await
            .map(Into::into)
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))
    }

    /// Recover swaps using xpub.
    #[wasm_bindgen(js_name = "recoverSwaps")]
    pub async fn recover_swaps(&self) -> Result<Vec<ExtendedSwapStorageData>, JsValue> {
        let swaps = self
            .inner
            .recover_swaps()
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(swaps.into_iter().map(|s| s.into()).collect())
    }

    /// Get mnemonic
    #[wasm_bindgen(js_name = "getMnemonic")]
    pub async fn get_mnemonic(&self) -> Result<String, JsValue> {
        let response = self
            .inner
            .get_mnemonic()
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(response)
    }

    /// Get userIdXpub
    #[wasm_bindgen(js_name = "getUserIdXpub")]
    pub async fn get_user_id_xpub(&self) -> Result<String, JsValue> {
        let response = self
            .inner
            .get_user_id_xpub()
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(response)
    }

    /// Deletes all stored swaps
    #[wasm_bindgen(js_name = "clearSwapStorage")]
    pub async fn clear_swap_storage(&self) -> Result<(), JsValue> {
        self.inner
            .clear_swap_storage()
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(())
    }

    /// Delete specific swap
    #[wasm_bindgen(js_name = "deleteSwap")]
    pub async fn delete_swap(&self, id: String) -> Result<(), JsValue> {
        self.inner
            .delete_swap(id)
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(())
    }

    /// Get the list of swap IDs that failed to deserialize during the last listAll() call.
    /// These are "corrupted" entries that couldn't be loaded.
    #[wasm_bindgen(js_name = "getCorruptedSwapIds")]
    pub fn get_corrupted_swap_ids(&self) -> Vec<String> {
        crate::storage_adapter::get_corrupted_swap_ids()
    }

    /// Delete all corrupted swap entries from storage.
    /// Returns the number of entries deleted.
    #[wasm_bindgen(js_name = "deleteCorruptedSwaps")]
    pub async fn delete_corrupted_swaps(&self) -> Result<u32, JsValue> {
        let ids = crate::storage_adapter::get_corrupted_swap_ids();
        let count = ids.len() as u32;

        for id in ids {
            self.inner
                .delete_swap(id)
                .await
                .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;
        }

        crate::storage_adapter::clear_corrupted_swap_ids();
        Ok(count)
    }

    // =========================================================================
    // VTXO Swap Methods
    // =========================================================================

    /// Estimate the fee for a VTXO swap.
    ///
    /// # Arguments
    /// * `vtxos` - List of VTXO outpoints to refresh ("txid:vout" format)
    #[wasm_bindgen(js_name = "estimateVtxoSwap")]
    pub async fn estimate_vtxo_swap(
        &self,
        vtxos: Vec<String>,
    ) -> Result<EstimateVtxoSwapResponse, JsValue> {
        let response = self
            .inner
            .estimate_vtxo_swap(vtxos)
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(response.into())
    }

    /// Create a VTXO swap for refreshing VTXOs.
    ///
    /// Returns the swap response and swap params.
    ///
    /// # Arguments
    /// * `vtxos` - List of VTXO outpoints to refresh ("txid:vout" format)
    #[wasm_bindgen(js_name = "createVtxoSwap")]
    pub async fn create_vtxo_swap(
        &self,
        vtxos: Vec<String>,
    ) -> Result<CreateVtxoSwapResult, JsValue> {
        let (response, swap_params) = self
            .inner
            .create_vtxo_swap(vtxos)
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(CreateVtxoSwapResult {
            response: response.into(),
            swap_params: swap_params.into(),
        })
    }

    /// Get VTXO swap details by ID.
    #[wasm_bindgen(js_name = "getVtxoSwap")]
    pub async fn get_vtxo_swap(&self, id: String) -> Result<ExtendedVtxoSwapStorageData, JsValue> {
        let response = self
            .inner
            .get_vtxo_swap(&id)
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(response.into())
    }

    /// Claim the server's VHTLC in a VTXO swap.
    ///
    /// # Arguments
    /// * `swap` - The VTXO swap response
    /// * `swap_params` - The client's swap parameters
    /// * `claim_address` - The Arkade address to receive the claimed funds
    #[wasm_bindgen(js_name = "claimVtxoSwap")]
    pub async fn claim_vtxo_swap(
        &self,
        swap: &VtxoSwapResponse,
        swap_params: &SwapParams,
        claim_address: String,
    ) -> Result<String, JsValue> {
        let core_swap: lendaswap_core::api::VtxoSwapResponse = swap
            .try_into()
            .map_err(|e: String| JsValue::from_str(&format!("Failed to convert swap: {}", e)))?;
        let core_params: lendaswap_core::SwapParams =
            swap_params.try_into().map_err(|e: String| {
                JsValue::from_str(&format!("Failed to convert swap_params: {}", e))
            })?;

        let txid = self
            .inner
            .claim_vtxo_swap(&core_swap, core_params, &claim_address)
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(txid)
    }

    /// Refund the client's VHTLC in a VTXO swap.
    ///
    /// # Arguments
    /// * `swap_id` - The swap ID
    /// * `refund_address` - The Arkade address to receive the refunded funds
    #[wasm_bindgen(js_name = "refundVtxoSwap")]
    pub async fn refund_vtxo_swap(
        &self,
        swap_id: String,
        refund_address: String,
    ) -> Result<String, JsValue> {
        let txid = self
            .inner
            .refund_vtxo_swap(&swap_id, &refund_address)
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(txid)
    }

    /// List all VTXO swaps from local storage.
    ///
    /// Returns all stored VTXO swaps without fetching from the API.
    #[wasm_bindgen(js_name = "listAllVtxoSwaps")]
    pub async fn list_all_vtxo_swaps(&self) -> Result<Vec<ExtendedVtxoSwapStorageData>, JsValue> {
        let swaps = self
            .inner
            .list_all_vtxo_swaps()
            .await
            .map_err(|e| JsValue::from_str(&format!("{:#}", e)))?;

        Ok(swaps.into_iter().map(|s| s.into()).collect())
    }
}
