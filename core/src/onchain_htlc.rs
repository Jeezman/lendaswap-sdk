//! On-chain Bitcoin HTLC implementation for BTC → Arkade swaps.
//!
//! This module provides Taproot HTLC outputs for atomic swaps where users
//! lock on-chain Bitcoin that Lendaswap can claim after the user reveals
//! the secret by claiming their Arkade VHTLC.
//!
//! For client-side use, this module provides the refund transaction builder
//! that allows users to reclaim their funds if the swap times out.
//!
//! The HTLC uses a Taproot output with:
//! - Unspendable key spend (NUMS internal key)
//! - Hashlock script path: server claims with preimage
//! - Timelock script path: user refunds after locktime

use crate::Error;
use crate::Result;
use ark_rs::core::UNSPENDABLE_KEY;
use bitcoin::Address;
use bitcoin::Amount;
use bitcoin::Network;
use bitcoin::OutPoint;
use bitcoin::ScriptBuf;
use bitcoin::Sequence;
use bitcoin::TapLeafHash;
use bitcoin::TapSighashType;
use bitcoin::Transaction;
use bitcoin::TxIn;
use bitcoin::TxOut;
use bitcoin::Witness;
use bitcoin::absolute::LockTime;
use bitcoin::hashes::Hash;
use bitcoin::hashes::ripemd160;
use bitcoin::hashes::sha256;
use bitcoin::key::PublicKey;
use bitcoin::key::Secp256k1;
use bitcoin::opcodes::all::OP_CHECKSIG;
use bitcoin::opcodes::all::OP_CHECKSIGVERIFY;
use bitcoin::opcodes::all::OP_CLTV;
use bitcoin::opcodes::all::OP_DROP;
use bitcoin::opcodes::all::OP_EQUAL;
use bitcoin::opcodes::all::OP_HASH160;
use bitcoin::script::Builder;
use bitcoin::secp256k1::Message;
use bitcoin::secp256k1::XOnlyPublicKey;
use bitcoin::sighash::SighashCache;
use bitcoin::taproot::ControlBlock;
use bitcoin::taproot::LeafVersion;
use bitcoin::taproot::TaprootBuilder;
use bitcoin::taproot::TaprootSpendInfo;
use bitcoin::transaction::Version;

/// Build the hashlock tapscript for server claim.
///
/// Script: `<server_pk> OP_CHECKSIGVERIFY OP_HASH160 <hash_lock> OP_EQUAL`
///
/// The server must provide a valid Schnorr signature AND the preimage.
/// OP_HASH160 computes RIPEMD160(SHA256(preimage)), matching Arkade VHTLCs.
pub fn build_hashlock_script(hash_lock: &[u8; 20], server_pk: &XOnlyPublicKey) -> ScriptBuf {
    Builder::new()
        .push_x_only_key(server_pk)
        .push_opcode(OP_CHECKSIGVERIFY)
        .push_opcode(OP_HASH160)
        .push_slice(hash_lock)
        .push_opcode(OP_EQUAL)
        .into_script()
}

/// Build the timelock tapscript for user refund.
///
/// Script: `<locktime> OP_CLTV OP_DROP <user_pk> OP_CHECKSIG`
///
/// The user can spend after the locktime has passed.
pub fn build_timelock_script(user_pk: &XOnlyPublicKey, refund_locktime: u32) -> ScriptBuf {
    Builder::new()
        .push_int(refund_locktime as i64)
        .push_opcode(OP_CLTV)
        .push_opcode(OP_DROP)
        .push_x_only_key(user_pk)
        .push_opcode(OP_CHECKSIG)
        .into_script()
}

/// Information needed to spend from the HTLC.
#[derive(Debug, Clone)]
pub struct HtlcScripts {
    /// The hashlock script (server claim path).
    pub hashlock_script: ScriptBuf,
    /// The timelock script (user refund path).
    pub timelock_script: ScriptBuf,
    /// The Taproot spend info containing merkle proofs.
    pub spend_info: TaprootSpendInfo,
}

/// Build a Taproot HTLC for BTC → Arkade swaps.
///
/// Creates a Taproot output with:
/// - Unspendable internal key (NUMS point)
/// - Left leaf: hashlock script (server claim)
/// - Right leaf: timelock script (user refund)
///
/// The hash_lock must be a 20-byte HASH160 (RIPEMD160(SHA256(secret))),
/// matching the hash function used by Arkade VHTLCs.
///
/// Returns the scripts and spend info needed for both spending paths.
pub fn build_htlc_scripts(
    hash_lock: &[u8; 20],
    server_claim_pk: &XOnlyPublicKey,
    user_refund_pk: &XOnlyPublicKey,
    refund_locktime: u32,
) -> HtlcScripts {
    let secp = Secp256k1::new();

    let hashlock_script = build_hashlock_script(hash_lock, server_claim_pk);
    let timelock_script = build_timelock_script(user_refund_pk, refund_locktime);

    let unspendable_key: PublicKey = UNSPENDABLE_KEY.parse().expect("valid key");

    // Build the taproot tree with two leaves at depth 1 (balanced tree).
    // Hashlock on the left (depth 1, index 0), timelock on the right (depth 1, index 1).
    let spend_info = TaprootBuilder::new()
        .add_leaf(1, hashlock_script.clone())
        .expect("adding hashlock leaf should succeed")
        .add_leaf(1, timelock_script.clone())
        .expect("adding timelock leaf should succeed")
        .finalize(&secp, unspendable_key.into())
        .expect("finalizing taproot should succeed");

    HtlcScripts {
        hashlock_script,
        timelock_script,
        spend_info,
    }
}

/// Generate Taproot address from HTLC scripts.
pub fn htlc_to_taproot_address(htlc: &HtlcScripts, network: Network) -> Address {
    let key = htlc.spend_info.output_key();
    let script = hex::encode(key.serialize());
    dbg!(script);
    Address::p2tr_tweaked(key, network)
}

/// Build a refund transaction to spend the HTLC after locktime expires.
///
/// The user uses this to refund their on-chain Bitcoin if the swap times out
/// (i.e., the server never claimed the Arkade VHTLC to reveal the secret).
pub fn build_refund_transaction(
    htlc_outpoint: OutPoint,
    htlc_amount: Amount,
    htlc_scripts: &HtlcScripts,
    user_sk: &bitcoin::secp256k1::SecretKey,
    destination: &Address,
    fee_rate_sat_per_vb: f64,
    refund_locktime: u32,
) -> Result<Transaction> {
    let secp = Secp256k1::new();

    // Create unsigned transaction.
    // IMPORTANT: nLockTime must be set to the refund locktime for CLTV to pass.
    // Sequence must be < 0xFFFFFFFF to enable locktime checking.
    let mut tx = Transaction {
        version: Version::TWO,
        lock_time: LockTime::from_consensus(refund_locktime),
        input: vec![TxIn {
            previous_output: htlc_outpoint,
            script_sig: ScriptBuf::new(), // Empty for Taproot
            // Sequence must be < 0xFFFFFFFF to enable nLockTime checking.
            sequence: Sequence::ENABLE_LOCKTIME_NO_RBF,
            witness: Witness::default(),
        }],
        output: vec![TxOut {
            value: Amount::ZERO, // Will be set after fee calculation
            script_pubkey: destination.script_pubkey(),
        }],
    };

    let tx_vbytes = 126u64;
    let fee = Amount::from_sat((tx_vbytes as f64 * fee_rate_sat_per_vb).ceil() as u64);

    // Set output value (input amount minus fee).
    let output_value = htlc_amount.checked_sub(fee).ok_or_else(|| {
        Error::Bitcoin(format!("Fee {} exceeds HTLC amount {}", fee, htlc_amount))
    })?;
    tx.output[0].value = output_value;

    // Get the control block for the timelock script.
    let control_block = htlc_scripts
        .spend_info
        .control_block(&(htlc_scripts.timelock_script.clone(), LeafVersion::TapScript))
        .ok_or_else(|| Error::Bitcoin("Failed to get control block for timelock script".into()))?;

    // Create the sighash for tapscript signing.
    let leaf_hash = TapLeafHash::from_script(&htlc_scripts.timelock_script, LeafVersion::TapScript);

    let prevouts = [TxOut {
        value: htlc_amount,
        script_pubkey: Address::p2tr_tweaked(
            htlc_scripts.spend_info.output_key(),
            Network::Bitcoin,
        )
        .script_pubkey(),
    }];

    let mut sighash_cache = SighashCache::new(&tx);
    let sighash = sighash_cache
        .taproot_script_spend_signature_hash(
            0,
            &bitcoin::sighash::Prevouts::All(&prevouts),
            leaf_hash,
            TapSighashType::Default,
        )
        .map_err(|e| Error::Bitcoin(format!("Failed to compute sighash: {e}")))?;

    // Sign with Schnorr.
    let msg = Message::from_digest(sighash.to_byte_array());
    let keypair = bitcoin::secp256k1::Keypair::from_secret_key(&secp, user_sk);
    let sig = secp.sign_schnorr(&msg, &keypair);

    // Build witness for timelock script path spend.
    let witness = build_refund_witness(&sig, &htlc_scripts.timelock_script, &control_block);
    tx.input[0].witness = witness;

    Ok(tx)
}

/// Build the witness stack for refunding the HTLC after locktime.
///
/// Witness stack for tapscript spend:
/// - control_block
/// - script
/// - signature (64 bytes Schnorr) - consumed by OP_CHECKSIG
fn build_refund_witness(
    signature: &bitcoin::secp256k1::schnorr::Signature,
    script: &ScriptBuf,
    control_block: &ControlBlock,
) -> Witness {
    let mut witness = Witness::new();
    // Tapscript execution: stack items are consumed from top.
    // Script: <locktime> OP_CLTV OP_DROP <pk> OP_CHECKSIG
    // We need: sig for CHECKSIG.
    witness.push(signature.serialize());
    witness.push(script.as_bytes());
    witness.push(control_block.serialize());
    witness
}

/// Compute HASH160 (RIPEMD160(SHA256(secret))) to get the hash lock.
///
/// This matches the hash function used by OP_HASH160 in Bitcoin script
/// and by Arkade VHTLCs, ensuring both sides of the swap use the same hash.
pub fn compute_hash_lock(secret: &[u8; 32]) -> [u8; 20] {
    let sha256_hash = sha256::Hash::hash(secret);
    ripemd160::Hash::hash(sha256_hash.as_ref()).to_byte_array()
}

#[cfg(test)]
mod tests {
    use super::*;
    use bitcoin::secp256k1::SecretKey;
    use std::str::FromStr;

    fn test_keypair() -> (SecretKey, XOnlyPublicKey) {
        let secp = Secp256k1::new();
        let sk = SecretKey::from_slice(&[1u8; 32]).unwrap();
        let keypair = bitcoin::secp256k1::Keypair::from_secret_key(&secp, &sk);
        let (xonly, _parity) = keypair.x_only_public_key();
        (sk, xonly)
    }

    #[test]
    fn onchain_htlc() {
        let secret = [42u8; 32];
        let hash_lock = compute_hash_lock(&secret);

        let (_, server_pk) = test_keypair();
        let secp = Secp256k1::new();
        let user_sk = SecretKey::from_slice(&[2u8; 32]).unwrap();
        let user_keypair = bitcoin::secp256k1::Keypair::from_secret_key(&secp, &user_sk);
        let (user_pk, _) = user_keypair.x_only_public_key();

        let locktime = 1700000000u32;
        let htlc = build_htlc_scripts(&hash_lock, &server_pk, &user_pk, locktime);

        // Scripts should not be empty.
        assert!(!htlc.hashlock_script.is_empty());
        assert!(!htlc.timelock_script.is_empty());

        // Should be able to create Taproot address.
        let address = htlc_to_taproot_address(&htlc, Network::Regtest);
        let address = address.to_string();
        assert_eq!(
            "bcrt1p9y8e33fmv06c9wr4rpcfkccpsankaqcu2kjkzlekjfv6lsmfhaqqplksqr",
            address
        );
    }

    #[test]
    fn onchain_htlc_btc_to_arkade() {
        // Server x-only pubkey (strip 03 prefix from compressed key)
        let server_pk = XOnlyPublicKey::from_slice(
            &hex::decode(concat!(
                "6c932b95705b07c4236a1abfabe283399774449914f6c4d7",
                "faeb30fd7f3c6b0e",
            ))
            .unwrap(),
        )
        .unwrap();

        // User x-only pubkey
        let user_pk = XOnlyPublicKey::from_slice(
            &hex::decode(concat!(
                "d149150a0c344bae35cfe0cd237e50bd41ec56fe7c2a2f5f",
                "8509911ec8c5a0e2",
            ))
            .unwrap(),
        )
        .unwrap();

        let locktime = 1769752815u32;
        // HASH160 hash lock (20 bytes)
        let hash_lock: [u8; 20] = hex::decode("9befb12985069ca625bce37f13af8acbb66e46bb")
            .unwrap()
            .try_into()
            .unwrap();

        let htlc = build_htlc_scripts(&hash_lock, &server_pk, &user_pk, locktime);

        assert!(!htlc.hashlock_script.is_empty());
        assert!(!htlc.timelock_script.is_empty());

        let address = htlc_to_taproot_address(&htlc, Network::Signet);
        let address = address.to_string();
        assert_eq!(
            "tb1p6enqnu9nqj52wzy6tl8qqtjfsxae2un66gwwp0hjydayydez7xsqz8ycd8",
            address
        );
    }

    #[test]
    fn test_build_refund_transaction() {
        let secret = [42u8; 32];
        let hash_lock = compute_hash_lock(&secret);

        let (_, server_pk) = test_keypair();
        let secp = Secp256k1::new();
        let user_sk = SecretKey::from_slice(&[2u8; 32]).unwrap();
        let user_keypair = bitcoin::secp256k1::Keypair::from_secret_key(&secp, &user_sk);
        let (user_pk, _) = user_keypair.x_only_public_key();

        let locktime = 1700000000u32;
        let htlc = build_htlc_scripts(&hash_lock, &server_pk, &user_pk, locktime);

        let outpoint = OutPoint::from_str(
            "0000000000000000000000000000000000000000000000000000000000000001:0",
        )
        .unwrap();
        let amount = Amount::from_sat(100_000);

        let destination =
            Address::from_str("bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080").unwrap();
        let destination = destination.assume_checked();

        let tx = build_refund_transaction(
            outpoint,
            amount,
            &htlc,
            &user_sk,
            &destination,
            1.0, // 1 sat/vB
            locktime,
        )
        .unwrap();

        // Transaction should have one input and one output.
        assert_eq!(tx.input.len(), 1);
        assert_eq!(tx.output.len(), 1);

        // Witness should have 3 elements: sig, script, control_block.
        assert_eq!(tx.input[0].witness.len(), 3);

        // nLockTime should be set to the refund locktime.
        assert_eq!(tx.lock_time, LockTime::from_consensus(locktime));

        // Sequence should allow locktime.
        assert!(tx.input[0].sequence.enables_absolute_lock_time());

        // Output value should be less than input (fee deducted).
        assert!(tx.output[0].value < amount);
    }
}
