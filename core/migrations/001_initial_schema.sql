-- Initial schema for lendaswap client storage

-- Wallet table
CREATE TABLE IF NOT EXISTS wallet (
    id TEXT PRIMARY KEY,
    mnemonic TEXT,
    key_index INTEGER NOT NULL DEFAULT 0
);

-- Ensure default wallet row exists
INSERT OR IGNORE INTO wallet (id, key_index) VALUES ('default', 0);

-- Swap registry table to track which table contains each swap
CREATE TABLE IF NOT EXISTS swap_registry (
    swap_id TEXT PRIMARY KEY NOT NULL,
    swap_type TEXT NOT NULL
);

-- BTC -> EVM swaps table
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
    target_amount REAL,
    source_amount INTEGER,
    -- SwapParams
    secret_key TEXT NOT NULL,
    public_key TEXT NOT NULL,
    preimage TEXT NOT NULL,
    preimage_hash TEXT NOT NULL,
    user_id TEXT NOT NULL,
    key_index INTEGER NOT NULL
);

-- EVM -> BTC swaps table
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
);

-- BTC -> Arkade swaps table
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
);

-- Onchain BTC -> EVM swaps table
CREATE TABLE IF NOT EXISTS onchain_to_evm_swaps (
    swap_id TEXT PRIMARY KEY NOT NULL,
    status TEXT NOT NULL,
    btc_htlc_address TEXT NOT NULL,
    source_amount INTEGER NOT NULL,
    target_amount REAL NOT NULL,
    fee_sats INTEGER NOT NULL,
    btc_server_pk TEXT NOT NULL,
    evm_hash_lock TEXT NOT NULL,
    btc_hash_lock TEXT NOT NULL,
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
);

-- VTXO swaps table
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
);
