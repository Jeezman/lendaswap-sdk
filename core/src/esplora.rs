//! Esplora client wrapper for on-chain Bitcoin operations.
//!
//! This module provides a minimal wrapper for Esplora API calls using reqwest:
//! - Finding UTXOs at an address
//! - Getting fee estimates
//! - Broadcasting transactions
//!
//! Uses reqwest directly for WASM compatibility instead of esplora-client.

use crate::Error;
use crate::Result;
use bitcoin::Address;
use bitcoin::Amount;
use bitcoin::Network;
use bitcoin::OutPoint;
use bitcoin::Transaction;
use bitcoin::Txid;
use bitcoin::consensus::encode;
use log::debug;
use serde::Deserialize;
use std::collections::HashMap;
use std::str::FromStr;

/// Esplora API response for a transaction output.
#[derive(Debug, Deserialize)]
struct EsploraTxOut {
    scriptpubkey: String,
    value: u64,
}

/// Esplora API response for transaction status.
#[derive(Debug, Deserialize)]
#[expect(unused)]
struct EsploraTxStatus {
    confirmed: bool,
    block_time: Option<u64>,
}

/// Esplora API response for a transaction.
#[derive(Debug, Deserialize)]
struct EsploraTx {
    txid: String,
    vout: Vec<EsploraTxOut>,
    #[serde(rename = "status")]
    _status: EsploraTxStatus,
}

/// Esplora API response for output status.
#[derive(Debug, Deserialize)]
struct EsploraOutspend {
    spent: bool,
}

/// Esplora client for on-chain Bitcoin operations.
#[derive(Clone)]
pub struct EsploraClient {
    base_url: String,
    client: reqwest::Client,
}

impl EsploraClient {
    /// Create a new Esplora client.
    ///
    /// # Arguments
    /// * `url` - The Esplora API URL (e.g., "https://mempool.space/api")
    pub fn new(url: &str) -> Result<Self> {
        let client = reqwest::Client::new();
        Ok(Self {
            base_url: url.trim_end_matches('/').to_string(),
            client,
        })
    }

    /// Find the first unspent UTXO at an address.
    ///
    /// Returns the outpoint and amount if found.
    pub async fn find_utxo(
        &self,
        address: &Address<bitcoin::address::NetworkChecked>,
    ) -> Result<Option<(OutPoint, Amount)>> {
        let script_pubkey = address.script_pubkey();
        let script_hex = hex::encode(script_pubkey.as_bytes());

        // Fetch transactions for this address
        let url = format!("{}/address/{}/txs", self.base_url, address);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::Esplora(format!("Failed to fetch transactions: {e}")))?;

        if !response.status().is_success() {
            return Err(Error::Esplora(format!(
                "Esplora API error: {}",
                response.status()
            )));
        }

        let txs: Vec<EsploraTx> = response
            .json()
            .await
            .map_err(|e| Error::Esplora(format!("Failed to parse transactions: {e}")))?;

        // Find outputs that pay to our script
        for tx in txs {
            let txid = Txid::from_str(&tx.txid)
                .map_err(|e| Error::Esplora(format!("Invalid txid: {e}")))?;

            for (vout, output) in tx.vout.iter().enumerate() {
                if output.scriptpubkey != script_hex {
                    continue;
                }

                let outpoint = OutPoint {
                    txid,
                    vout: vout as u32,
                };

                // Check if this output is spent
                let outspend_url = format!("{}/tx/{}/outspend/{}", self.base_url, tx.txid, vout);
                let outspend_response = self
                    .client
                    .get(&outspend_url)
                    .send()
                    .await
                    .map_err(|e| Error::Esplora(format!("Failed to get outspend: {e}")))?;

                if outspend_response.status().is_success() {
                    let outspend: EsploraOutspend = outspend_response
                        .json()
                        .await
                        .map_err(|e| Error::Esplora(format!("Failed to parse outspend: {e}")))?;

                    if !outspend.spent {
                        debug!("Found unspent UTXO: {}:{}", txid, vout);
                        return Ok(Some((outpoint, Amount::from_sat(output.value))));
                    } else {
                        debug!("UTXO {}:{} is already spent", txid, vout);
                    }
                }
            }
        }

        Ok(None)
    }

    /// Get fee estimate in sat/vB for a target number of blocks.
    pub async fn get_fee_estimate(&self, target_blocks: u16) -> Result<f64> {
        let url = format!("{}/fee-estimates", self.base_url);
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|e| Error::Esplora(format!("Failed to get fee estimates: {e}")))?;

        if !response.status().is_success() {
            return Err(Error::Esplora(format!(
                "Esplora API error: {}",
                response.status()
            )));
        }

        let estimates: HashMap<String, f64> = response
            .json()
            .await
            .map_err(|e| Error::Esplora(format!("Failed to parse fee estimates: {e}")))?;

        // Find the closest target
        let target_str = target_blocks.to_string();
        let fee_rate = estimates
            .get(&target_str)
            .or_else(|| {
                // Find closest available target
                estimates
                    .keys()
                    .filter_map(|k| k.parse::<u16>().ok())
                    .filter(|&k| k >= target_blocks)
                    .min()
                    .and_then(|k| estimates.get(&k.to_string()))
            })
            .copied()
            .unwrap_or(1.0); // Default to 1 sat/vB if no estimate available

        debug!(
            "Fee estimate for {} blocks: {} sat/vB",
            target_blocks, fee_rate
        );

        Ok(fee_rate)
    }

    /// Broadcast a transaction to the network.
    pub async fn broadcast_tx(&self, tx: &Transaction) -> Result<Txid> {
        let txid = tx.compute_txid();
        let tx_hex = hex::encode(encode::serialize(tx));

        let url = format!("{}/tx", self.base_url);
        let response = self
            .client
            .post(&url)
            .header("Content-Type", "text/plain")
            .body(tx_hex)
            .send()
            .await
            .map_err(|e| Error::Esplora(format!("Failed to broadcast transaction: {e}")))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_default();
            return Err(Error::Esplora(format!(
                "Failed to broadcast transaction: {}",
                error_text
            )));
        }

        log::info!("Broadcast transaction: {}", txid);

        Ok(txid)
    }

    /// Get the network this client is connected to.
    ///
    /// This is a helper to convert from our Network enum to bitcoin::Network.
    pub fn network_to_bitcoin(network: crate::Network) -> Network {
        match network {
            crate::Network::Bitcoin => Network::Bitcoin,
            crate::Network::Testnet => Network::Testnet,
            crate::Network::Regtest => Network::Regtest,
            crate::Network::Mutinynet => Network::Signet, // Mutinynet uses signet
        }
    }
}
