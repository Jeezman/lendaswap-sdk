//! VHTLC (Virtual Hash Time-Locked Contract) operations.
//!
//! This module provides functionality for claiming and refunding VHTLCs
//! on the Arkade network.

use crate::SwapParams;
use crate::error::Error;
use crate::error::Result;
use crate::types::Network;
use crate::types::SwapData;
use crate::types::VhtlcAmounts;
use ark_rs::core::ArkAddress;
use ark_rs::core::VTXO_CONDITION_KEY;
use ark_rs::core::VtxoList;
use ark_rs::core::send::OffchainTransactions;
use ark_rs::core::send::VtxoInput;
use ark_rs::core::send::build_offchain_transactions;
use ark_rs::core::send::sign_ark_transaction;
use ark_rs::core::send::sign_checkpoint_transaction;
use ark_rs::core::server::GetVtxosRequest;
use ark_rs::core::server::parse_sequence_number;
use ark_rs::core::vhtlc::VhtlcOptions;
use ark_rs::core::vhtlc::VhtlcScript;
use bitcoin::Amount;
use bitcoin::PublicKey;
use bitcoin::Txid;
use bitcoin::VarInt;
use bitcoin::XOnlyPublicKey;
use bitcoin::absolute::LockTime;
use bitcoin::consensus::Encodable;
use bitcoin::hashes::Hash;
use bitcoin::key::Keypair;
use bitcoin::key::Secp256k1;
use bitcoin::psbt;
use bitcoin::secp256k1;
use bitcoin::secp256k1::schnorr;
use bitcoin::taproot::LeafVersion;
use std::str::FromStr;

/// Claim a VHTLC swap by providing the preimage.
///
/// This function reconstructs the VHTLC from stored parameters,
/// signs the claim transaction, and submits it to the Arkade server.
pub async fn claim(
    ark_server_url: &str,
    claim_ark_address: ArkAddress,
    swap_data: SwapData,
    swap_params: SwapParams,
    network: Network,
) -> Result<Txid> {
    let secp = Secp256k1::new();

    let bitcoin_network = network.to_bitcoin_network();

    let secret_key = swap_params.secret_key;
    let own_kp = Keypair::from_secret_key(&secp, &secret_key);
    let own_pk = own_kp.public_key();

    // Parse preimage
    let preimage = swap_params.preimage;

    // Hash the preimage for VHTLC construction (SHA256 -> RIPEMD160)
    let sha256_hash = bitcoin::hashes::sha256::Hash::hash(&preimage);
    let ripemd160_hash = bitcoin::hashes::ripemd160::Hash::hash(&sha256_hash.to_byte_array());

    // Parse public keys
    let lendaswap_pk = parse_public_key(&swap_data.lendaswap_pk)?;
    let arkade_server_pk = parse_public_key(&swap_data.arkade_server_pk)?;

    // Parse unilateral delays
    let unilateral_claim_delay = parse_sequence_number(swap_data.unilateral_claim_delay)
        .map_err(|e| Error::Vhtlc(format!("Invalid unilateral claim delay: {}", e)))?;
    let unilateral_refund_delay = parse_sequence_number(swap_data.unilateral_refund_delay)
        .map_err(|e| Error::Vhtlc(format!("Invalid unilateral refund delay: {}", e)))?;
    let unilateral_refund_without_receiver_delay =
        parse_sequence_number(swap_data.unilateral_refund_without_receiver_delay).map_err(|e| {
            Error::Vhtlc(format!(
                "Invalid unilateral refund without receiver delay: {}",
                e
            ))
        })?;

    // Log VHTLC parameters for debugging
    log::info!(
        "[CLIENT] VHTLC claim parameters: sender={}, receiver={}, server={}, preimage_hash={}, refund_locktime={}, unilateral_claim_delay={:?}, unilateral_refund_delay={:?}, unilateral_refund_without_receiver_delay={:?}, network={:?}",
        lendaswap_pk,
        own_pk,
        arkade_server_pk,
        ripemd160_hash,
        swap_data.refund_locktime,
        unilateral_claim_delay,
        unilateral_refund_delay,
        unilateral_refund_without_receiver_delay,
        bitcoin_network,
    );

    // Construct VHTLC
    let vhtlc = VhtlcScript::new(
        VhtlcOptions {
            sender: lendaswap_pk.into(),
            receiver: own_pk.into(),
            server: arkade_server_pk.into(),
            preimage_hash: ripemd160_hash,
            refund_locktime: swap_data.refund_locktime,
            unilateral_claim_delay,
            unilateral_refund_delay,
            unilateral_refund_without_receiver_delay,
        },
        bitcoin_network,
    )
    .map_err(|e| Error::Vhtlc(format!("Failed to construct VHTLC script: {}", e)))?;

    let vhtlc_address = vhtlc.address();

    // Log computed address for comparison
    log::info!(
        "[CLIENT] VHTLC computed address: {}, expected address: {}",
        vhtlc_address.encode(),
        swap_data.vhtlc_address
    );

    // Verify address matches
    if vhtlc_address.encode() != swap_data.vhtlc_address {
        return Err(Error::Vhtlc(format!(
            "VHTLC address ({}) does not match swap address ({})",
            vhtlc_address.encode(),
            swap_data.vhtlc_address
        )));
    }

    // Connect to Arkade server
    let rest_client = ark_rest::Client::new(ark_server_url.to_string());
    let server_info = rest_client
        .get_info()
        .await
        .map_err(|e| Error::Arkade(format!("Failed to get server info: {}", e)))?;

    // Fetch VTXOs
    let request = GetVtxosRequest::new_for_addresses(std::iter::once(vhtlc_address));
    let virtual_tx_outpoints = rest_client
        .list_vtxos(request)
        .await
        .map_err(|e| Error::Arkade(format!("Failed to fetch VTXOs: {}", e)))?;
    let vtxo_list = VtxoList::new(server_info.dust, virtual_tx_outpoints);

    let spend_info = vhtlc.taproot_spend_info();
    let script_ver = (vhtlc.claim_script(), LeafVersion::TapScript);
    let control_block = spend_info
        .control_block(&script_ver)
        .ok_or_else(|| Error::Vhtlc("Missing control block".into()))?;

    let total_amount = vtxo_list
        .spendable_offchain()
        .fold(Amount::ZERO, |acc, x| acc + x.amount);

    if total_amount == Amount::ZERO {
        return Err(Error::Vhtlc("No spendable VTXOs found".into()));
    }

    let script_pubkey = vhtlc.script_pubkey();
    let tapscripts = vhtlc.tapscripts();

    let vhtlc_inputs: Vec<VtxoInput> = vtxo_list
        .spendable_offchain()
        .map(|v| {
            VtxoInput::new(
                script_ver.0.clone(),
                None,
                control_block.clone(),
                tapscripts.clone(),
                script_pubkey.clone(),
                v.amount,
                v.outpoint,
            )
        })
        .collect();

    let outputs = vec![(&claim_ark_address, total_amount)];

    let OffchainTransactions {
        mut ark_tx,
        checkpoint_txs,
    } = build_offchain_transactions(&outputs, None, &vhtlc_inputs, &server_info)
        .map_err(|e| Error::Vhtlc(format!("Failed to build offchain TXs: {}", e)))?;

    // Sign function that adds preimage witness
    let sign_fn = |input: &mut psbt::Input,
                   msg: secp256k1::Message|
     -> std::result::Result<
        Vec<(schnorr::Signature, XOnlyPublicKey)>,
        ark_rs::core::Error,
    > {
        // Add preimage to PSBT input
        {
            let mut bytes = vec![1]; // One witness element
            let length = VarInt::from(preimage.len() as u64);
            length
                .consensus_encode(&mut bytes)
                .expect("valid length encoding");
            bytes.extend_from_slice(&preimage);

            input.unknown.insert(
                psbt::raw::Key {
                    type_value: 222,
                    key: VTXO_CONDITION_KEY.to_vec(),
                },
                bytes,
            );
        }

        let sig = Secp256k1::new().sign_schnorr_no_aux_rand(&msg, &own_kp);
        let pk = own_kp.public_key().into();

        Ok(vec![(sig, pk)])
    };

    sign_ark_transaction(sign_fn, &mut ark_tx, 0)
        .map_err(|e| Error::Vhtlc(format!("Failed to sign ark transaction: {}", e)))?;

    let ark_txid = ark_tx.unsigned_tx.compute_txid();

    let res = rest_client
        .submit_offchain_transaction_request(ark_tx, checkpoint_txs)
        .await
        .map_err(|e| Error::Arkade(format!("Failed to submit offchain TXs: {:?}", e)))?;

    let mut checkpoint_psbts = res.signed_checkpoint_txs;
    for checkpoint_psbt in checkpoint_psbts.iter_mut() {
        sign_checkpoint_transaction(sign_fn, checkpoint_psbt)
            .map_err(|e| Error::Vhtlc(format!("Failed to sign checkpoint TX: {}", e)))?;
    }

    rest_client
        .finalize_offchain_transaction(ark_txid, checkpoint_psbts)
        .await
        .map_err(|e| Error::Arkade(format!("Failed to finalize transaction: {}", e)))?;

    log::info!("Claimed VHTLC with transaction {}", ark_txid);

    Ok(ark_txid)
}

/// Refund a VHTLC swap after the locktime expires.
///
/// This function reconstructs the VHTLC from stored parameters,
/// signs the refund transaction, and submits it to the Arkade server.
pub async fn refund(
    ark_server_url: &str,
    refund_ark_address: ArkAddress,
    swap_data: SwapData,
    swap_params: SwapParams,
    network: Network,
) -> Result<Txid> {
    let secp = Secp256k1::new();

    let secret_key = swap_params.secret_key;
    let own_kp = Keypair::from_secret_key(&secp, &secret_key);
    let own_pk = own_kp.public_key();

    // Parse preimage for hash computation
    let preimage_bytes = swap_params.preimage;

    // Hash the preimage for VHTLC construction (SHA256 -> RIPEMD160)
    let sha256_hash = bitcoin::hashes::sha256::Hash::hash(&preimage_bytes);
    let ripemd160_hash = bitcoin::hashes::ripemd160::Hash::hash(&sha256_hash.to_byte_array());

    // Parse public keys
    let lendaswap_pk = parse_public_key(&swap_data.lendaswap_pk)?;
    let arkade_server_pk = parse_public_key(&swap_data.arkade_server_pk)?;

    // For refund: sender and receiver are swapped
    // User is sender (refunding), Lendaswap is receiver
    let vhtlc = VhtlcScript::new(
        VhtlcOptions {
            sender: own_pk.into(),
            receiver: lendaswap_pk.into(),
            server: arkade_server_pk.into(),
            preimage_hash: ripemd160_hash,
            refund_locktime: swap_data.refund_locktime,
            unilateral_claim_delay: parse_sequence_number(swap_data.unilateral_claim_delay)
                .map_err(|e| Error::Vhtlc(format!("Invalid unilateral claim delay: {}", e)))?,
            unilateral_refund_delay: parse_sequence_number(swap_data.unilateral_refund_delay)
                .map_err(|e| Error::Vhtlc(format!("Invalid unilateral refund delay: {}", e)))?,
            unilateral_refund_without_receiver_delay: parse_sequence_number(
                swap_data.unilateral_refund_without_receiver_delay,
            )
            .map_err(|e| {
                Error::Vhtlc(format!(
                    "Invalid unilateral refund without receiver delay: {}",
                    e
                ))
            })?,
        },
        network.to_bitcoin_network(),
    )
    .map_err(|e| Error::Vhtlc(format!("Failed to construct VHTLC script: {}", e)))?;

    let vhtlc_address = vhtlc.address();

    // Verify address matches
    if vhtlc_address.encode() != swap_data.vhtlc_address {
        return Err(Error::Vhtlc(format!(
            "VHTLC address ({}) does not match swap address ({})",
            vhtlc_address.encode(),
            swap_data.vhtlc_address
        )));
    }

    // Connect to Arkade server
    let rest_client = ark_rest::Client::new(ark_server_url.to_string());
    let server_info = rest_client
        .get_info()
        .await
        .map_err(|e| Error::Arkade(format!("Failed to get server info: {}", e)))?;

    // Fetch VTXOs
    let request = GetVtxosRequest::new_for_addresses(std::iter::once(vhtlc_address));
    let virtual_tx_outpoints = rest_client
        .list_vtxos(request)
        .await
        .map_err(|e| Error::Arkade(format!("Failed to fetch VTXOs: {}", e)))?;
    let vtxo_list = VtxoList::new(server_info.dust, virtual_tx_outpoints);

    let spend_info = vhtlc.taproot_spend_info();
    let script_ver = (
        vhtlc.refund_without_receiver_script(),
        LeafVersion::TapScript,
    );
    let control_block = spend_info
        .control_block(&script_ver)
        .ok_or_else(|| Error::Vhtlc("Missing control block".into()))?;

    let total_amount = vtxo_list
        .spendable_offchain()
        .fold(Amount::ZERO, |acc, x| acc + x.amount);

    if total_amount == Amount::ZERO {
        return Err(Error::Vhtlc("No spendable VTXOs found".into()));
    }

    let script_pubkey = vhtlc.script_pubkey();
    let tapscripts = vhtlc.tapscripts();

    let refund_locktime = swap_data.refund_locktime;
    let vhtlc_inputs: std::result::Result<Vec<VtxoInput>, Error> = vtxo_list
        .spendable_offchain()
        .map(|v| {
            let locktime = LockTime::from_time(refund_locktime)
                .map_err(|e| Error::Vhtlc(format!("Invalid locktime: {}", e)))?;
            Ok(VtxoInput::new(
                script_ver.0.clone(),
                Some(locktime),
                control_block.clone(),
                tapscripts.clone(),
                script_pubkey.clone(),
                v.amount,
                v.outpoint,
            ))
        })
        .collect();

    let vhtlc_inputs = vhtlc_inputs?;
    let outputs = vec![(&refund_ark_address, total_amount)];

    let OffchainTransactions {
        mut ark_tx,
        checkpoint_txs,
    } = build_offchain_transactions(&outputs, None, &vhtlc_inputs, &server_info)
        .map_err(|e| Error::Vhtlc(format!("Failed to build offchain TXs: {}", e)))?;

    // Sign function (no preimage needed for refund)
    let sign_fn = |_: &mut psbt::Input,
                   msg: secp256k1::Message|
     -> std::result::Result<
        Vec<(schnorr::Signature, XOnlyPublicKey)>,
        ark_rs::core::Error,
    > {
        let sig = Secp256k1::new().sign_schnorr_no_aux_rand(&msg, &own_kp);
        let pk = own_kp.public_key().into();

        Ok(vec![(sig, pk)])
    };

    sign_ark_transaction(sign_fn, &mut ark_tx, 0)
        .map_err(|e| Error::Vhtlc(format!("Failed to sign ark transaction: {}", e)))?;

    let ark_txid = ark_tx.unsigned_tx.compute_txid();

    let res = rest_client
        .submit_offchain_transaction_request(ark_tx, checkpoint_txs)
        .await
        .map_err(|e| Error::Arkade(format!("Failed to submit offchain TXs: {:?}", e)))?;

    let mut checkpoint_psbts = res.signed_checkpoint_txs;
    for checkpoint_psbt in checkpoint_psbts.iter_mut() {
        sign_checkpoint_transaction(sign_fn, checkpoint_psbt)
            .map_err(|e| Error::Vhtlc(format!("Failed to sign checkpoint TX: {}", e)))?;
    }

    rest_client
        .finalize_offchain_transaction(ark_txid, checkpoint_psbts)
        .await
        .map_err(|e| Error::Arkade(format!("Failed to finalize transaction: {}", e)))?;

    log::info!("Refunded VHTLC with transaction {}", ark_txid);

    Ok(ark_txid)
}

/// Get the amounts for a VHTLC swap.
///
/// Queries the Arkade server for the current state of the VHTLC.
pub async fn amounts(ark_server_url: &str, swap_data: SwapData) -> Result<VhtlcAmounts> {
    let server_info = ark_rest::Client::new(ark_server_url.to_string())
        .get_info()
        .await
        .map_err(|e| Error::Arkade(format!("Failed to get Arkade server info: {}", e)))?;

    let vhtlc_address = ArkAddress::decode(&swap_data.vhtlc_address)
        .map_err(|e| Error::Parse(format!("Invalid VHTLC address: {}", e)))?;

    let request = GetVtxosRequest::new_for_addresses(std::iter::once(vhtlc_address));
    let virtual_tx_outpoints = ark_rest::Client::new(ark_server_url.to_string())
        .list_vtxos(request)
        .await
        .map_err(|e| Error::Arkade(format!("Failed to fetch VTXOs: {}", e)))?;
    let vtxo_list = VtxoList::new(server_info.dust, virtual_tx_outpoints);

    let spendable = vtxo_list
        .spendable_offchain()
        .fold(Amount::ZERO, |acc, v| acc + v.amount);

    let spent = vtxo_list
        .spent()
        .fold(Amount::ZERO, |acc, v| acc + v.amount);

    let recoverable = vtxo_list
        .recoverable()
        .fold(Amount::ZERO, |acc, v| acc + v.amount);

    // TODO: We could add more info now e.g. expired.

    Ok(VhtlcAmounts {
        spendable: spendable.to_sat(),
        spent: spent.to_sat(),
        recoverable: recoverable.to_sat(),
    })
}

/// Collaboratively refund spendable VTXOs from a VHTLC.
///
/// Builds an offchain transaction spending via the `refund_script` leaf (3-of-3: sender +
/// receiver + server), signs as sender (client), requests receiver (lendaswap) signature
/// from the API, and submits to Arkade for the server signature.
///
/// Returns the ark transaction ID.
pub async fn collab_refund(
    ark_server_url: &str,
    lendaswap_api_url: &str,
    swap_id: &str,
    refund_ark_address: ArkAddress,
    swap_data: SwapData,
    swap_params: SwapParams,
    network: Network,
) -> Result<Txid> {
    let secp = Secp256k1::new();

    let secret_key = swap_params.secret_key;
    let own_kp = Keypair::from_secret_key(&secp, &secret_key);
    let own_pk = own_kp.public_key();

    // Hash the preimage for VHTLC construction (SHA256 -> RIPEMD160)
    let sha256_hash = bitcoin::hashes::sha256::Hash::hash(&swap_params.preimage);
    let ripemd160_hash = bitcoin::hashes::ripemd160::Hash::hash(&sha256_hash.to_byte_array());

    let lendaswap_pk = parse_public_key(&swap_data.lendaswap_pk)?;
    let arkade_server_pk = parse_public_key(&swap_data.arkade_server_pk)?;

    // In arkade-to-evm: sender=client(refund_pk), receiver=lendaswap
    let vhtlc = VhtlcScript::new(
        VhtlcOptions {
            sender: own_pk.into(),
            receiver: lendaswap_pk.into(),
            server: arkade_server_pk.into(),
            preimage_hash: ripemd160_hash,
            refund_locktime: swap_data.refund_locktime,
            unilateral_claim_delay: parse_sequence_number(swap_data.unilateral_claim_delay)
                .map_err(|e| Error::Vhtlc(format!("Invalid unilateral claim delay: {}", e)))?,
            unilateral_refund_delay: parse_sequence_number(swap_data.unilateral_refund_delay)
                .map_err(|e| Error::Vhtlc(format!("Invalid unilateral refund delay: {}", e)))?,
            unilateral_refund_without_receiver_delay: parse_sequence_number(
                swap_data.unilateral_refund_without_receiver_delay,
            )
            .map_err(|e| {
                Error::Vhtlc(format!(
                    "Invalid unilateral refund without receiver delay: {}",
                    e,
                ))
            })?,
        },
        network.to_bitcoin_network(),
    )
    .map_err(|e| Error::Vhtlc(format!("Failed to construct VHTLC: {}", e)))?;

    let vhtlc_address = vhtlc.address();
    if vhtlc_address.encode() != swap_data.vhtlc_address {
        return Err(Error::Vhtlc(format!(
            "VHTLC address mismatch: computed {}, expected {}",
            vhtlc_address.encode(),
            swap_data.vhtlc_address,
        )));
    }

    // Connect to Arkade
    let rest_client = ark_rest::Client::new(ark_server_url.to_string());
    let server_info = rest_client
        .get_info()
        .await
        .map_err(|e| Error::Arkade(format!("Failed to get server info: {}", e)))?;

    // Fetch spendable VTXOs
    let request = GetVtxosRequest::new_for_addresses(std::iter::once(vhtlc_address));
    let virtual_tx_outpoints = rest_client
        .list_vtxos(request)
        .await
        .map_err(|e| Error::Arkade(format!("Failed to fetch VTXOs: {}", e)))?;
    let vtxo_list = VtxoList::new(server_info.dust, virtual_tx_outpoints);

    let spend_info = vhtlc.taproot_spend_info();
    let script_ver = (vhtlc.refund_script(), LeafVersion::TapScript);
    let control_block = spend_info
        .control_block(&script_ver)
        .ok_or_else(|| Error::Vhtlc("Missing control block for refund_script".into()))?;

    let total_amount = vtxo_list
        .spendable_offchain()
        .fold(Amount::ZERO, |acc, x| acc + x.amount);

    if total_amount == Amount::ZERO {
        return Err(Error::Vhtlc("No spendable VTXOs found".into()));
    }

    let script_pubkey = vhtlc.script_pubkey();
    let tapscripts = vhtlc.tapscripts();

    let vhtlc_inputs: Vec<VtxoInput> = vtxo_list
        .spendable_offchain()
        .map(|v| {
            VtxoInput::new(
                script_ver.0.clone(),
                None, // No locktime for collaborative refund
                control_block.clone(),
                tapscripts.clone(),
                script_pubkey.clone(),
                v.amount,
                v.outpoint,
            )
        })
        .collect();

    let outputs = vec![(&refund_ark_address, total_amount)];

    let OffchainTransactions {
        mut ark_tx,
        checkpoint_txs,
    } = build_offchain_transactions(&outputs, None, &vhtlc_inputs, &server_info)
        .map_err(|e| Error::Vhtlc(format!("Failed to build offchain TXs: {}", e)))?;

    // Sign as sender
    let sign_fn = |_: &mut psbt::Input,
                   msg: secp256k1::Message|
     -> std::result::Result<
        Vec<(schnorr::Signature, XOnlyPublicKey)>,
        ark_rs::core::Error,
    > {
        let sig = Secp256k1::new().sign_schnorr_no_aux_rand(&msg, &own_kp);
        let pk = own_kp.public_key().into();
        Ok(vec![(sig, pk)])
    };

    sign_ark_transaction(sign_fn, &mut ark_tx, 0)
        .map_err(|e| Error::Vhtlc(format!("Failed to sign ark transaction: {}", e)))?;

    let mut signed_checkpoints = checkpoint_txs;
    for cp in signed_checkpoints.iter_mut() {
        sign_checkpoint_transaction(sign_fn, cp)
            .map_err(|e| Error::Vhtlc(format!("Failed to sign checkpoint TX: {}", e)))?;
    }

    // Request receiver (lendaswap) signature via API
    let api_client = crate::api::ApiClient::new(lendaswap_api_url);
    let api_request = crate::api::CollabRefundRequest {
        ark_tx: ark_tx.to_string(),
        checkpoint_txs: signed_checkpoints.iter().map(|p| p.to_string()).collect(),
    };

    let api_response = api_client.collab_refund(swap_id, &api_request).await?;

    // Parse countersigned PSBTs
    let ark_tx = bitcoin::Psbt::from_str(&api_response.ark_tx)
        .map_err(|e| Error::Vhtlc(format!("Invalid ark_tx PSBT from server: {}", e)))?;

    let checkpoint_txs = api_response
        .checkpoint_txs
        .iter()
        .enumerate()
        .map(|(i, b64)| {
            bitcoin::Psbt::from_str(b64).map_err(|e| {
                Error::Vhtlc(format!("Invalid checkpoint_txs[{i}] PSBT from server: {e}"))
            })
        })
        .collect::<Result<Vec<_>>>()?;

    // Submit to Arkade
    let ark_txid = ark_tx.unsigned_tx.compute_txid();

    let res = rest_client
        .submit_offchain_transaction_request(ark_tx, checkpoint_txs)
        .await
        .map_err(|e| Error::Arkade(format!("Failed to submit offchain TXs: {:?}", e)))?;

    let mut final_checkpoints = res.signed_checkpoint_txs;
    for cp in final_checkpoints.iter_mut() {
        sign_checkpoint_transaction(sign_fn, cp)
            .map_err(|e| Error::Vhtlc(format!("Failed to sign final checkpoint TX: {}", e)))?;
    }

    rest_client
        .finalize_offchain_transaction(ark_txid, final_checkpoints)
        .await
        .map_err(|e| Error::Arkade(format!("Failed to finalize transaction: {}", e)))?;

    log::info!(
        "Collaboratively refunded VHTLC with transaction {}",
        ark_txid
    );

    Ok(ark_txid)
}

/// Collaboratively refund recoverable VTXOs from a VHTLC via the delegate batch flow.
///
/// Builds delegate PSBTs (intent_proof + forfeits) spending via the `refund_script` leaf,
/// signs as sender (client), requests receiver (lendaswap) signature from the API,
/// then calls the delegate settle endpoint to complete the batch ceremony.
///
/// Returns the commitment transaction ID.
pub async fn collab_refund_delegate(
    ark_server_url: &str,
    lendaswap_api_url: &str,
    swap_id: &str,
    refund_ark_address: ArkAddress,
    swap_data: SwapData,
    swap_params: SwapParams,
    network: Network,
) -> Result<Txid> {
    use ark_rs::core::batch::prepare_delegate_psbts;
    use ark_rs::core::batch::sign_delegate_psbts;
    use ark_rs::core::intent;

    let secp = Secp256k1::new();

    let secret_key = swap_params.secret_key;
    let own_kp = Keypair::from_secret_key(&secp, &secret_key);
    let own_pk = own_kp.public_key();

    // Hash the preimage for VHTLC construction
    let sha256_hash = bitcoin::hashes::sha256::Hash::hash(&swap_params.preimage);
    let ripemd160_hash = bitcoin::hashes::ripemd160::Hash::hash(&sha256_hash.to_byte_array());

    let lendaswap_pk = parse_public_key(&swap_data.lendaswap_pk)?;
    let arkade_server_pk = parse_public_key(&swap_data.arkade_server_pk)?;

    let vhtlc = VhtlcScript::new(
        VhtlcOptions {
            sender: own_pk.into(),
            receiver: lendaswap_pk.into(),
            server: arkade_server_pk.into(),
            preimage_hash: ripemd160_hash,
            refund_locktime: swap_data.refund_locktime,
            unilateral_claim_delay: parse_sequence_number(swap_data.unilateral_claim_delay)
                .map_err(|e| Error::Vhtlc(format!("Invalid unilateral claim delay: {}", e)))?,
            unilateral_refund_delay: parse_sequence_number(swap_data.unilateral_refund_delay)
                .map_err(|e| Error::Vhtlc(format!("Invalid unilateral refund delay: {}", e)))?,
            unilateral_refund_without_receiver_delay: parse_sequence_number(
                swap_data.unilateral_refund_without_receiver_delay,
            )
            .map_err(|e| {
                Error::Vhtlc(format!(
                    "Invalid unilateral refund without receiver delay: {}",
                    e,
                ))
            })?,
        },
        network.to_bitcoin_network(),
    )
    .map_err(|e| Error::Vhtlc(format!("Failed to construct VHTLC: {}", e)))?;

    let vhtlc_address = vhtlc.address();
    if vhtlc_address.encode() != swap_data.vhtlc_address {
        return Err(Error::Vhtlc(format!(
            "VHTLC address mismatch: computed {}, expected {}",
            vhtlc_address.encode(),
            swap_data.vhtlc_address,
        )));
    }

    // Connect to Arkade
    let rest_client = ark_rest::Client::new(ark_server_url.to_string());
    let server_info = rest_client
        .get_info()
        .await
        .map_err(|e| Error::Arkade(format!("Failed to get server info: {}", e)))?;

    // Fetch recoverable VTXOs
    let request = GetVtxosRequest::new_for_addresses(std::iter::once(vhtlc_address));
    let virtual_tx_outpoints = rest_client
        .list_vtxos(request)
        .await
        .map_err(|e| Error::Arkade(format!("Failed to fetch VTXOs: {}", e)))?;
    let vtxo_list = VtxoList::new(server_info.dust, virtual_tx_outpoints);

    let spend_info = vhtlc.taproot_spend_info();
    let script_ver = (vhtlc.refund_script(), LeafVersion::TapScript);
    let control_block = spend_info
        .control_block(&script_ver)
        .ok_or_else(|| Error::Vhtlc("Missing control block for refund_script".into()))?;

    let total_amount = vtxo_list
        .recoverable()
        .fold(Amount::ZERO, |acc, x| acc + x.amount);

    if total_amount == Amount::ZERO {
        return Err(Error::Vhtlc("No recoverable VTXOs found".into()));
    }

    let script_pubkey = vhtlc.script_pubkey();
    let tapscripts = vhtlc.tapscripts();

    // Get delegate cosigner public key from lendaswap
    let api_client = crate::api::ApiClient::new(lendaswap_api_url);
    let cosigner_pk_response = api_client.get_delegate_cosigner_pk().await?;
    let delegate_cosigner_pk = PublicKey::from_str(&cosigner_pk_response.cosigner_pk)
        .map_err(|e| Error::Parse(format!("Invalid cosigner pk: {}", e)))?;

    // Build intent inputs from recoverable VTXOs
    let intent_inputs: Vec<intent::Input> = vtxo_list
        .recoverable()
        .map(|v| {
            intent::Input::new(
                v.outpoint,
                bitcoin::Sequence::ZERO,
                None,
                bitcoin::TxOut {
                    value: v.amount,
                    script_pubkey: script_pubkey.clone(),
                },
                tapscripts.clone(),
                (script_ver.0.clone(), control_block.clone()),
                false,
                false,
            )
        })
        .collect();

    let outputs = vec![intent::Output::Offchain(bitcoin::TxOut {
        value: total_amount,
        script_pubkey: refund_ark_address.to_p2tr_script_pubkey(),
    })];

    // Prepare delegate PSBTs
    let mut delegate = prepare_delegate_psbts(
        intent_inputs,
        outputs,
        delegate_cosigner_pk.inner,
        &server_info.forfeit_address,
        server_info.dust,
    )
    .map_err(|e| Error::Vhtlc(format!("Failed to prepare delegate PSBTs: {}", e)))?;

    // Sign as sender
    let mut sign_fn = |_: &mut psbt::Input,
                       msg: secp256k1::Message|
     -> std::result::Result<
        Vec<(schnorr::Signature, XOnlyPublicKey)>,
        ark_rs::core::Error,
    > {
        let sig = Secp256k1::new().sign_schnorr_no_aux_rand(&msg, &own_kp);
        let pk = own_kp.public_key().into();
        Ok(vec![(sig, pk)])
    };

    sign_delegate_psbts(
        &mut sign_fn,
        &mut delegate.intent.proof,
        &mut delegate.forfeit_psbts,
    )
    .map_err(|e| Error::Vhtlc(format!("Failed to sign delegate PSBTs: {}", e)))?;

    // Request receiver (lendaswap) signature via API
    let api_request = crate::api::CollabRefundDelegateRequest {
        intent_proof: delegate.intent.proof.to_string(),
        forfeit_psbts: delegate
            .forfeit_psbts
            .iter()
            .map(|p| p.to_string())
            .collect(),
    };

    let api_response = api_client
        .collab_refund_delegate(swap_id, &api_request)
        .await?;

    // Parse countersigned PSBTs back
    delegate.intent.proof = bitcoin::Psbt::from_str(&api_response.intent_proof)
        .map_err(|e| Error::Vhtlc(format!("Invalid intent_proof PSBT from server: {}", e)))?;

    delegate.forfeit_psbts = api_response
        .forfeit_psbts
        .iter()
        .enumerate()
        .map(|(i, b64)| {
            bitcoin::Psbt::from_str(b64).map_err(|e| {
                Error::Vhtlc(format!("Invalid forfeit_psbts[{i}] PSBT from server: {e}"))
            })
        })
        .collect::<Result<Vec<_>>>()?;

    // Now settle via the delegate endpoint
    let intent_message = delegate
        .intent
        .serialize_message()
        .map_err(|e| Error::Vhtlc(format!("Failed to serialize intent message: {}", e)))?;

    let settle_request = crate::api::SettleDelegateRequest {
        intent_proof: delegate.intent.proof.to_string(),
        intent_message,
        forfeit_psbts: delegate
            .forfeit_psbts
            .iter()
            .map(|p| p.to_string())
            .collect(),
        cosigner_pk: cosigner_pk_response.cosigner_pk,
        swap_id: None,
        preimage: None,
    };

    let settle_response = api_client.settle_delegate(&settle_request).await?;

    let txid = Txid::from_str(&settle_response.commitment_txid)
        .map_err(|e| Error::Vhtlc(format!("Invalid txid from server: {}", e)))?;

    log::info!(
        "Collaboratively refunded VHTLC via delegate with commitment {}",
        txid
    );

    Ok(txid)
}

/// Parse a hex-encoded public key.
fn parse_public_key(hex_str: &str) -> Result<PublicKey> {
    let bytes =
        hex::decode(hex_str).map_err(|e| Error::Parse(format!("Invalid public key hex: {}", e)))?;
    PublicKey::from_slice(&bytes).map_err(|e| Error::Bitcoin(format!("Invalid public key: {}", e)))
}
