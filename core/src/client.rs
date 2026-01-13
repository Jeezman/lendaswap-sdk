use crate::api::{
    AssetPair, BtcToArkadeSwapRequest, BtcToArkadeSwapResponse, BtcToEvmSwapResponse,
    CreateVtxoSwapRequest, EstimateVtxoSwapResponse, EvmChain, EvmToArkadeSwapRequest,
    EvmToBtcSwapResponse, EvmToLightningSwapRequest, GetSwapResponse, QuoteRequest, QuoteResponse,
    SwapRequest, TokenId, TokenInfo, Version, VtxoSwapResponse,
};
use crate::esplora::EsploraClient;
use crate::onchain_htlc::{
    build_htlc_scripts, build_refund_transaction, compute_hash_lock, htlc_to_taproot_address,
};
use crate::storage::{SwapStorage, VtxoSwapStorage, WalletStorage};
use crate::types::SwapData;
use crate::{ApiClient, Error, Network, SwapParams, VhtlcAmounts, Wallet, vhtlc, vtxo_swap};
use ark_rs::core::ArkAddress;
use bitcoin::Address;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};
use std::str::FromStr;

/// Extended swap data that combines the API response with client-side swap parameters.
///
/// This is the data structure stored for each swap, containing both the server response
/// and the cryptographic parameters derived by the client.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ExtendedSwapStorageData {
    /// The swap response from the API.
    pub response: GetSwapResponse,
    /// Client-side swap parameters (keys, preimage, etc.).
    /// Sometimes not relevant, e.g. for evm-to-lightning swaps.
    pub swap_params: SwapParams,
}

/// Extended VTXO swap data that combines the API response with client-side swap parameters.
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ExtendedVtxoSwapStorageData {
    /// The VTXO swap response from the API.
    pub response: VtxoSwapResponse,
    /// Client-side swap parameters (keys, preimage, etc.).
    pub swap_params: SwapParams,
}

/// The main client for interacting with Lendaswap.
///
/// The client is parameterized by two storage backends:
/// - `S`: Typed storage for wallet data (mnemonic, key index)
/// - `SS`: Typed storage for swap data
/// - `VSS`: Typed storage for vtxo swap data
pub struct Client<S: WalletStorage, SS: SwapStorage, VSS: VtxoSwapStorage> {
    api_client: ApiClient,
    wallet: Wallet<S>,
    swap_storage: SS,
    vtxo_swap_storage: VSS,
    arkade_url: String,
    esplora_url: String,
}

impl<S: WalletStorage, SS: SwapStorage, VSS: VtxoSwapStorage> Client<S, SS, VSS> {
    /// Create a new client with separate wallet and swap storage.
    ///
    /// # Arguments
    /// * `url` - The Lendaswap API URL
    /// * `wallet_storage` - Storage for wallet data (mnemonic, key index)
    /// * `swap_storage` - Storage for swap data
    /// * `network` - The Bitcoin network to use
    /// * `arkade_url` - The Arkade server URL
    /// * `esplora_url` - The Esplora API URL for on-chain Bitcoin operations
    pub fn new(
        url: impl Into<String>,
        wallet_storage: S,
        swap_storage: SS,
        vtxo_swap_storage: VSS,
        network: Network,
        arkade_url: String,
        esplora_url: String,
    ) -> Self {
        let api_client = ApiClient::new(url);
        let wallet = Wallet::new(wallet_storage, network);

        Self {
            api_client,
            wallet,
            swap_storage,
            vtxo_swap_storage,
            arkade_url,
            esplora_url,
        }
    }

    /// Get a reference to the swap storage.
    pub fn swap_storage(&self) -> &SS {
        &self.swap_storage
    }

    pub async fn init(&self, mnemonic: Option<String>) -> crate::Result<()> {
        if let Some(mnemonic) = mnemonic {
            self.wallet.import_mnemonic(mnemonic.as_str()).await?;
        } else {
            self.wallet.generate_or_get_mnemonic().await?;
        }
        Ok(())
    }

    pub fn api_client(&self) -> &ApiClient {
        &self.api_client
    }

    pub fn wallet(&self) -> &Wallet<S> {
        &self.wallet
    }

    pub async fn create_arkade_to_evm_swap(
        &self,
        target_address: String,
        target_amount: Decimal,
        target_token: TokenId,
        target_chain: EvmChain,
        referral_code: Option<String>,
    ) -> crate::Result<BtcToEvmSwapResponse> {
        let swap_params = self.wallet.derive_swap_params().await?;

        let request = SwapRequest {
            target_address,
            target_amount,
            target_token,
            hash_lock: format!("0x{}", hex::encode(swap_params.preimage_hash)),
            refund_pk: hex::encode(swap_params.public_key.serialize()),
            user_id: hex::encode(swap_params.user_id.serialize()),
            referral_code,
        };

        let response = self
            .api_client
            .create_arkade_to_evm_swap(&request, target_chain)
            .await?;

        let swap_id = response.common.id.to_string();
        let swap_data = ExtendedSwapStorageData {
            response: GetSwapResponse::BtcToEvm(response.clone()),
            swap_params,
        };

        self.swap_storage.store(&swap_id, &swap_data).await?;

        Ok(response)
    }

    pub async fn create_evm_to_arkade_swap(
        &self,
        target_address: String,
        user_address: String,
        source_amount: Decimal,
        source_token: TokenId,
        source_chain: EvmChain,
        referral_code: Option<String>,
    ) -> crate::Result<EvmToBtcSwapResponse> {
        let swap_params = self.wallet.derive_swap_params().await?;

        let request = EvmToArkadeSwapRequest {
            target_address,
            source_amount,
            source_token,
            hash_lock: format!("0x{}", hex::encode(swap_params.preimage_hash)),
            receiver_pk: hex::encode(swap_params.public_key.serialize()),
            user_address,
            user_id: hex::encode(swap_params.user_id.serialize()),
            referral_code,
        };

        let response = self
            .api_client
            .create_evm_to_arkade_swap(&request, source_chain)
            .await?;
        let swap_id = response.common.id.to_string();
        let swap_data = ExtendedSwapStorageData {
            response: GetSwapResponse::EvmToBtc(response.clone()),
            swap_params,
        };

        self.swap_storage.store(&swap_id, &swap_data).await?;

        Ok(response)
    }

    pub async fn create_evm_to_lightning_swap(
        &self,
        bolt11_invoice: String,
        user_address: String,
        source_token: TokenId,
        source_chain: EvmChain,
        referral_code: Option<String>,
    ) -> crate::Result<EvmToBtcSwapResponse> {
        let swap_params = self.wallet.derive_swap_params().await?;

        let request = EvmToLightningSwapRequest {
            bolt11_invoice,
            source_token,
            user_address,
            user_id: hex::encode(swap_params.user_id.serialize()),
            referral_code,
        };

        let response = self
            .api_client
            .create_evm_to_lightning_swap(&request, source_chain)
            .await?;
        let swap_id = response.common.id.to_string();
        let swap_data = ExtendedSwapStorageData {
            response: GetSwapResponse::EvmToBtc(response.clone()),
            swap_params,
        };

        self.swap_storage.store(&swap_id, &swap_data).await?;

        Ok(response)
    }

    /// Create an on-chain Bitcoin to Arkade swap.
    ///
    /// User sends on-chain BTC to a P2WSH HTLC address, and receives Arkade VTXOs.
    pub async fn create_btc_to_arkade_swap(
        &self,
        target_arkade_address: String,
        sats_receive: i64,
        referral_code: Option<String>,
    ) -> crate::Result<BtcToArkadeSwapResponse> {
        let swap_params = self.wallet.derive_swap_params().await?;

        // For BTC-to-Arkade swaps, we use HASH160 (matching Bitcoin's OP_HASH160 and Arkade VHTLCs).
        let hash_lock = compute_hash_lock(&swap_params.preimage);

        let request = BtcToArkadeSwapRequest {
            target_arkade_address,
            sats_receive,
            claim_pk: hex::encode(swap_params.public_key.serialize()),
            refund_pk: hex::encode(swap_params.public_key.serialize()),
            // No 0x prefix for btc_to_arkade swaps; HASH160 = 20 bytes = 40 hex chars
            hash_lock: hex::encode(hash_lock),
            user_id: hex::encode(swap_params.user_id.serialize()),
            referral_code,
        };

        let response = self.api_client.create_btc_to_arkade_swap(&request).await?;
        let swap_id = response.id.to_string();
        let swap_data = ExtendedSwapStorageData {
            response: GetSwapResponse::BtcToArkade(response.clone()),
            swap_params,
        };

        self.swap_storage.store(&swap_id, &swap_data).await?;

        Ok(response)
    }

    pub async fn get_asset_pairs(&self) -> crate::Result<Vec<AssetPair>> {
        let asset_pairs = self.api_client.get_asset_pairs().await?;
        Ok(asset_pairs)
    }

    pub async fn get_tokens(&self) -> crate::Result<Vec<TokenInfo>> {
        let tokens = self.api_client.get_tokens().await?;
        Ok(tokens)
    }

    /// Get swap details by ID.
    ///
    /// This fetches the latest swap status from the API and updates the local storage.
    pub async fn get_swap(&self, id: &str) -> crate::Result<ExtendedSwapStorageData> {
        let maybe_data = self.swap_storage.get(id).await?;

        match maybe_data {
            None => Err(Error::SwapNotFound(format!("Swap id not found {id}"))),
            Some(known) => {
                let swap_response = self.api_client.get_swap(id).await?;
                let new_extended_swap_data = ExtendedSwapStorageData {
                    response: swap_response,
                    swap_params: known.swap_params,
                };

                self.swap_storage.store(id, &new_extended_swap_data).await?;
                Ok(new_extended_swap_data)
            }
        }
    }

    pub async fn get_quote(&self, request: &QuoteRequest) -> crate::Result<QuoteResponse> {
        let response = self.api_client.get_quote(request).await?;
        Ok(response)
    }

    pub async fn claim_gelato(
        &self,
        swap_id: &str,
        maybe_secret: Option<String>,
    ) -> crate::Result<()> {
        if let Some(secret) = maybe_secret {
            self.api_client.claim_gelato(swap_id, &secret).await?;
            return Ok(());
        }

        let swap_data = self.load_swap_data_from_storage(swap_id).await?;
        let preimage = swap_data.swap_params.preimage;
        let preimage = hex::encode(preimage);
        self.api_client.claim_gelato(swap_id, &preimage).await
    }

    pub async fn claim_vhtlc(&self, swap_id: &str) -> crate::Result<String> {
        let swap_data = self.load_swap_data_from_storage(swap_id).await?;
        if let GetSwapResponse::EvmToBtc(data) = &swap_data.response {
            match &data.user_address_arkade {
                None => Err(Error::Vhtlc(
                    "Cannot refund if no arkade address was provided".to_string(),
                )),
                Some(arkade_address) => {
                    let address = ArkAddress::from_str(arkade_address)
                        .map_err(|e| Error::Parse(format!("Invalid ark address {e})")))?;

                    let common_swap_data = swap_data
                        .response
                        .common()
                        .ok_or(Error::Other("Missing swap common fields".to_string()))?;

                    let txid = vhtlc::claim(
                        &self.arkade_url,
                        address,
                        SwapData {
                            key_index: swap_data.swap_params.key_index,
                            lendaswap_pk: data.common.receiver_pk.clone(),
                            arkade_server_pk: data.common.server_pk.clone(),
                            refund_locktime: common_swap_data.vhtlc_refund_locktime,
                            unilateral_claim_delay: common_swap_data.unilateral_claim_delay,
                            unilateral_refund_delay: common_swap_data.unilateral_refund_delay,
                            unilateral_refund_without_receiver_delay: common_swap_data
                                .unilateral_refund_without_receiver_delay,
                            network: common_swap_data.network.parse()?,
                            vhtlc_address: data.htlc_address_arkade.clone(),
                        },
                        swap_data.swap_params,
                        self.wallet.network(),
                    )
                    .await?;

                    Ok(txid.to_string())
                }
            }
        } else {
            Err(Error::Vhtlc("Swap was not a Evm to Btc swap".to_string()))
        }
    }

    /// Get the [`VhtlcAmounts`] for a BTC-EVM swap.
    ///
    /// This only applies to swaps where the client funds the Arkade VHTLC.
    pub async fn amounts_for_swap(&self, swap_id: &str) -> crate::Result<VhtlcAmounts> {
        let swap_data = self.load_swap_data_from_storage(swap_id).await?;
        if let GetSwapResponse::BtcToEvm(data) = &swap_data.response {
            let common_swap_data = swap_data
                .response
                .common()
                .ok_or(Error::Other("Missing swap common fields".to_string()))?;
            let amounts = vhtlc::amounts(
                &self.arkade_url,
                SwapData {
                    key_index: swap_data.swap_params.key_index,
                    lendaswap_pk: data.common.receiver_pk.clone(),
                    arkade_server_pk: data.common.server_pk.clone(),
                    refund_locktime: common_swap_data.vhtlc_refund_locktime,
                    unilateral_claim_delay: common_swap_data.unilateral_claim_delay,
                    unilateral_refund_delay: common_swap_data.unilateral_refund_delay,
                    unilateral_refund_without_receiver_delay: common_swap_data
                        .unilateral_refund_without_receiver_delay,
                    network: common_swap_data.network.parse()?,
                    vhtlc_address: data.htlc_address_arkade.clone(),
                },
            )
            .await?;

            Ok(amounts)
        } else {
            Err(Error::Vhtlc("Swap was not a Btc to Evm swap".to_string()))
        }
    }

    /// Refund the VHTLC of a BTC-EVM swap.
    ///
    /// This only applies to swaps where the client funds the Arkade VHTLC directly with Arkade. It
    /// does not apply to swaps funded with Lightning, since the user's Lightning wallet is
    /// responsible for refunding the Lightning HTLC.
    pub async fn refund_vhtlc(&self, swap_id: &str, refund_address: &str) -> crate::Result<String> {
        let swap_data = self.load_swap_data_from_storage(swap_id).await?;
        if let GetSwapResponse::BtcToEvm(data) = &swap_data.response {
            let refund_address = ArkAddress::from_str(refund_address)
                .map_err(|e| Error::Parse(format!("Invalid refund ark address {e})")))?;

            let common_swap_data = swap_data
                .response
                .common()
                .ok_or(Error::Other("Missing swap common fields".to_string()))?;
            let txid = vhtlc::refund(
                &self.arkade_url,
                refund_address,
                SwapData {
                    key_index: swap_data.swap_params.key_index,
                    lendaswap_pk: data.common.receiver_pk.clone(),
                    arkade_server_pk: data.common.server_pk.clone(),
                    refund_locktime: common_swap_data.vhtlc_refund_locktime,
                    unilateral_claim_delay: common_swap_data.unilateral_claim_delay,
                    unilateral_refund_delay: common_swap_data.unilateral_refund_delay,
                    unilateral_refund_without_receiver_delay: common_swap_data
                        .unilateral_refund_without_receiver_delay,
                    network: common_swap_data.network.parse()?,
                    vhtlc_address: data.htlc_address_arkade.clone(),
                },
                swap_data.swap_params,
                self.wallet.network(),
            )
            .await?;

            Ok(txid.to_string())
        } else {
            Err(Error::Vhtlc("Swap was not a Btc to Evm swap".to_string()))
        }
    }

    /// Claim the Arkade VHTLC for a BTC-to-Arkade swap.
    ///
    /// In BTC-to-Arkade swaps, the server funds the Arkade VHTLC after the user
    /// sends on-chain BTC. The user claims the VHTLC by revealing the preimage.
    pub async fn claim_btc_to_arkade_vhtlc(&self, swap_id: &str) -> crate::Result<String> {
        let swap_data = self.load_swap_data_from_storage(swap_id).await?;
        if let GetSwapResponse::BtcToArkade(data) = &swap_data.response {
            let claim_address = ArkAddress::decode(&data.target_arkade_address)
                .map_err(|e| Error::Parse(format!("Invalid target arkade address {e})")))?;

            // For BTC-to-Arkade: server is sender (funder), user is receiver (claimer)
            let txid = vhtlc::claim(
                &self.arkade_url,
                claim_address,
                SwapData {
                    key_index: swap_data.swap_params.key_index,
                    // Server is the sender (funder) of the VHTLC
                    lendaswap_pk: data.server_vhtlc_pk.clone(),
                    arkade_server_pk: data.arkade_server_pk.clone(),
                    refund_locktime: data.vhtlc_refund_locktime as u32,
                    unilateral_claim_delay: data.unilateral_claim_delay,
                    unilateral_refund_delay: data.unilateral_refund_delay,
                    unilateral_refund_without_receiver_delay: data
                        .unilateral_refund_without_receiver_delay,
                    network: data.network.parse()?,
                    vhtlc_address: data.arkade_vhtlc_address.clone(),
                },
                swap_data.swap_params,
                self.wallet.network(),
            )
            .await?;

            Ok(txid.to_string())
        } else {
            Err(Error::Vhtlc(
                "Swap was not a BTC to Arkade swap".to_string(),
            ))
        }
    }

    /// Refund from the on-chain Bitcoin HTLC after timeout.
    ///
    /// This spends from the Taproot HTLC back to the user's Bitcoin address.
    /// The refund is only possible after the locktime has expired.
    ///
    /// # Arguments
    /// * `swap_id` - The swap ID
    /// * `refund_address` - The Bitcoin address to receive the refunded funds
    pub async fn refund_onchain_htlc(
        &self,
        swap_id: &str,
        refund_address: &str,
    ) -> crate::Result<String> {
        let swap_data = self.load_swap_data_from_storage(swap_id).await?;

        let data = match &swap_data.response {
            GetSwapResponse::BtcToArkade(data) => data,
            _ => {
                return Err(Error::Vhtlc(
                    "Swap was not a BTC to Arkade swap".to_string(),
                ));
            }
        };

        let server_claim_pk = bitcoin::secp256k1::PublicKey::from_str(&data.server_vhtlc_pk)
            .map_err(|e| Error::Parse(format!("Invalid server public key: {e}")))?;
        let (server_claim_pk, _parity) = server_claim_pk.x_only_public_key();

        // Get the user's refund public key from swap params (convert to x-only for Taproot).
        let (user_refund_pk, _parity) = swap_data.swap_params.public_key.x_only_public_key();

        // Parse the hash lock (20-byte HASH160).
        let hash_lock: [u8; 20] = hex::decode(&data.hash_lock)
            .map_err(|e| Error::Parse(format!("Invalid hash lock hex: {e}")))?
            .try_into()
            .map_err(|_| Error::Parse("Hash lock must be 20 bytes".to_string()))?;

        // Rebuild the HTLC scripts.
        let htlc_scripts = build_htlc_scripts(
            &hash_lock,
            &server_claim_pk,
            &user_refund_pk,
            data.btc_refund_locktime as u32,
        );

        // Derive the HTLC address and verify it matches.
        let bitcoin_network = self.wallet.network().to_bitcoin_network();
        let htlc_address = htlc_to_taproot_address(&htlc_scripts, bitcoin_network);

        if htlc_address.to_string() != data.btc_htlc_address {
            return Err(Error::Bitcoin(format!(
                "HTLC address mismatch: derived {} but expected {} for bitcoin network {}",
                htlc_address, data.btc_htlc_address, bitcoin_network
            )));
        }

        // Parse the refund destination address.
        let destination = Address::from_str(refund_address)
            .map_err(|e| Error::Parse(format!("Invalid refund address: {e}")))?
            .require_network(bitcoin_network)
            .map_err(|e| Error::Parse(format!("Address network mismatch: {e}")))?;

        // Create esplora client and find the UTXO.
        let esplora = EsploraClient::new(&self.esplora_url)?;

        let (outpoint, amount) = esplora.find_utxo(&htlc_address).await?.ok_or_else(|| {
            Error::UtxoNotFound(format!(
                "No unspent UTXO found at HTLC address {}",
                data.btc_htlc_address
            ))
        })?;

        log::info!(
            "Found UTXO {}:{} with {} sats at HTLC address",
            outpoint.txid,
            outpoint.vout,
            amount.to_sat()
        );

        // Get fee estimate (target 6 blocks).
        let fee_rate = esplora.get_fee_estimate(6).await?;
        log::info!("Using fee rate: {} sat/vB", fee_rate);

        // Get the user's secret key for signing.
        let user_sk = swap_data.swap_params.secret_key;

        // Build the refund transaction.
        let refund_tx = build_refund_transaction(
            outpoint,
            amount,
            &htlc_scripts,
            &user_sk,
            &destination,
            fee_rate,
            data.btc_refund_locktime as u32,
        )?;

        log::info!(
            "Built refund transaction with {} inputs, {} outputs",
            refund_tx.input.len(),
            refund_tx.output.len()
        );

        // Broadcast the transaction.
        let txid = esplora.broadcast_tx(&refund_tx).await?;

        log::info!("Broadcast refund transaction: {}", txid);

        Ok(txid.to_string())
    }

    /// Load swap data from storage without fetching from the API.
    pub async fn load_swap_data_from_storage(
        &self,
        swap_id: &str,
    ) -> crate::Result<ExtendedSwapStorageData> {
        self.swap_storage
            .get(swap_id)
            .await?
            .ok_or_else(|| Error::SwapNotFound(format!("Swap id not found {swap_id}")))
    }

    /// Load swap data from storage without fetching from the API.
    pub async fn list_all(&self) -> crate::Result<Vec<ExtendedSwapStorageData>> {
        let swaps = self.swap_storage.get_all().await?;

        Ok(swaps)
    }

    pub async fn get_version(&self) -> crate::Result<Version> {
        let version = self.api_client.get_version().await?;
        Ok(version)
    }

    pub async fn recover_swaps(&self) -> crate::Result<Vec<ExtendedSwapStorageData>> {
        self.clear_swap_storage().await?;

        let xpub = self
            .wallet
            .get_user_id_xpub()
            .await
            .map_err(|e| Error::Other(format!("Could not retrieve user xpub {e:#}")))?
            .ok_or(Error::NoMnemonic)?;
        let recovered = self.api_client.recover_swaps(xpub.as_str()).await?;

        for recovered_swap in recovered.swaps {
            let swap_params = self
                .wallet
                .derive_swap_params_at_index(recovered_swap.index)
                .await?;
            let swap_id = recovered_swap.swap.id();
            let data = ExtendedSwapStorageData {
                response: recovered_swap.swap,
                swap_params,
            };

            self.swap_storage.store(swap_id.as_str(), &data).await?;
        }

        self.wallet.set_key_index(recovered.highest_index).await?;

        let all_swaps = self.swap_storage.get_all().await?;
        Ok(all_swaps)
    }

    pub async fn get_mnemonic(&self) -> crate::Result<String> {
        let mnemonic = self
            .wallet
            .get_mnemonic()
            .await
            .map_err(|e| Error::Other(format!("Could not read mnemonic {e:#}")))?
            .ok_or(Error::NoMnemonic)?;
        Ok(mnemonic)
    }

    pub async fn get_user_id_xpub(&self) -> crate::Result<String> {
        let xpub = self
            .wallet
            .get_user_id_xpub()
            .await?
            .ok_or(Error::NoMnemonic)?;
        Ok(xpub)
    }

    pub async fn clear_swap_storage(&self) -> crate::Result<()> {
        let swap_ids = self.swap_storage.list().await?;
        for id in swap_ids {
            self.swap_storage.delete(&id).await?;
        }
        Ok(())
    }
    pub async fn delete_swap(&self, id: String) -> crate::Result<()> {
        self.swap_storage.delete(&id).await?;
        Ok(())
    }

    // =========================================================================
    // VTXO Swap Methods
    // =========================================================================

    /// Estimate the fee for a VTXO swap.
    ///
    /// # Arguments
    /// * `vtxos` - List of VTXO outpoints to refresh ("txid:vout" format)
    pub async fn estimate_vtxo_swap(
        &self,
        vtxos: Vec<String>,
    ) -> crate::Result<EstimateVtxoSwapResponse> {
        let response = self.api_client.estimate_vtxo_swap(vtxos).await?;
        Ok(response)
    }

    /// Create a VTXO swap for refreshing VTXOs.
    ///
    /// This creates a swap where the client will fund their VHTLC first,
    /// then the server funds their VHTLC, and the client claims the server's
    /// VHTLC to complete the swap.
    ///
    /// # Arguments
    /// * `vtxos` - List of VTXO outpoints to refresh ("txid:vout" format)
    pub async fn create_vtxo_swap(
        &self,
        vtxos: Vec<String>,
    ) -> crate::Result<(VtxoSwapResponse, SwapParams)> {
        let swap_params = self.wallet.derive_swap_params().await?;

        let request = CreateVtxoSwapRequest {
            vtxos,
            preimage_hash: hex::encode(swap_params.preimage_hash),
            client_pk: hex::encode(swap_params.public_key.serialize()),
            user_id: hex::encode(swap_params.user_id.serialize()),
        };

        let response = self.api_client.create_vtxo_swap(&request).await?;

        let swap_id = response.id.to_string();

        self.vtxo_swap_storage
            .store(
                &swap_id,
                &ExtendedVtxoSwapStorageData {
                    response: response.clone(),
                    swap_params: swap_params.clone(),
                },
            )
            .await?;

        log::info!("Created VTXO swap {}", swap_id);

        Ok((response, swap_params))
    }

    /// Get VTXO swap details by ID.
    pub async fn get_vtxo_swap(&self, id: &str) -> crate::Result<ExtendedVtxoSwapStorageData> {
        let maybe_data = self.vtxo_swap_storage.get(id).await?;
        match maybe_data {
            None => Err(crate::Error::SwapNotFound(format!(
                "Swap id not found {id}"
            ))),
            Some(known) => {
                let response = self.api_client.get_vtxo_swap(id).await?;

                let new_extended = ExtendedVtxoSwapStorageData {
                    response,
                    swap_params: known.swap_params,
                };

                self.vtxo_swap_storage
                    .store(&new_extended.response.id.to_string(), &new_extended)
                    .await?;
                Ok(new_extended)
            }
        }
    }

    /// Claim the server's VHTLC in a VTXO swap.
    ///
    /// This should be called after the server has funded their VHTLC.
    /// The client reveals the preimage to claim the fresh VTXOs.
    ///
    /// # Arguments
    /// * `swap` - The VTXO swap response
    /// * `swap_params` - The client's swap parameters (containing preimage)
    /// * `claim_address` - The Arkade address to receive the claimed funds
    pub async fn claim_vtxo_swap(
        &self,
        swap: &VtxoSwapResponse,
        swap_params: SwapParams,
        claim_address: &str,
    ) -> crate::Result<String> {
        let claim_ark_address = ArkAddress::from_str(claim_address)
            .map_err(|e| Error::Parse(format!("Invalid claim ark address: {}", e)))?;

        let txid = vtxo_swap::claim_server_vhtlc(
            &self.arkade_url,
            claim_ark_address,
            swap,
            swap_params,
            self.wallet.network(),
        )
        .await?;

        Ok(txid.to_string())
    }

    /// Refund the client's VHTLC in a VTXO swap.
    ///
    /// This can be called if the swap fails (e.g., server doesn't fund)
    /// and the client's locktime has expired.
    ///
    /// # Arguments
    /// * `swap` - The VTXO swap response
    /// * `swap_params` - The client's swap parameters
    /// * `refund_address` - The Arkade address to receive the refunded funds
    pub async fn refund_vtxo_swap(
        &self,
        swap_id: &String,
        refund_address: &str,
    ) -> crate::Result<String> {
        let refund_ark_address = ArkAddress::from_str(refund_address)
            .map_err(|e| Error::Parse(format!("Invalid refund ark address: {}", e)))?;

        let swap =
            self.vtxo_swap_storage.get(swap_id).await?.ok_or_else(|| {
                crate::Error::SwapNotFound(format!("Swap id not found {swap_id}"))
            })?;

        let txid = vtxo_swap::refund_client_vhtlc(
            &self.arkade_url,
            refund_ark_address,
            &swap.response,
            swap.swap_params,
            self.wallet.network(),
        )
        .await?;

        Ok(txid.to_string())
    }

    /// Load all vtxo swap data from storage without fetching from the API.
    pub async fn list_all_vtxo_swaps(&self) -> crate::Result<Vec<ExtendedVtxoSwapStorageData>> {
        let swaps = self.vtxo_swap_storage.get_all().await?;

        Ok(swaps)
    }
}
