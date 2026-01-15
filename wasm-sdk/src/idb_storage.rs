//! IndexedDB storage implementation using the `idb` crate.
//!
//! This module provides native Rust IndexedDB storage implementations for:
//! - `IdbWalletStorage`: Wallet data (mnemonic, key index)
//! - `IdbSwapStorage`: Swap data
//! - `IdbVtxoSwapStorage`: VTXO swap data
//!
//! This replaces the JavaScript/Dexie implementation with pure Rust,
//! simplifying the architecture while maintaining human-readable storage
//! in browser DevTools.

use idb::{Database, DatabaseEvent, Factory, KeyPath, ObjectStoreParams, TransactionMode};
use js_sys::Reflect;
use lendaswap_core::storage::{StorageFuture, SwapStorage, VtxoSwapStorage, WalletStorage};
use lendaswap_core::{ExtendedSwapStorageData, ExtendedVtxoSwapStorageData};
use serde::Serialize;
use std::rc::Rc;
use wasm_bindgen::JsValue;
use wasm_bindgen::prelude::*;

// Version 1: Fresh database with new name to avoid Dexie conflicts
const DB_VERSION: u32 = 1;
const DEFAULT_DB_NAME: &str = "lendaswap-v2";
const WALLET_STORE: &str = "wallet";
const SWAPS_STORE: &str = "lendaswap_swaps";
const VTXO_SWAPS_STORE: &str = "lendaswap_vtxo_swaps";
const WALLET_KEY: &str = "default";

// Old Dexie database name for wallet migration
const OLD_WALLET_DB_NAME: &str = "lendaswap-wallet-v1";

/// Serialize a value to JsValue using consistent settings.
fn to_js_value<T: Serialize>(value: &T) -> Result<JsValue, serde_wasm_bindgen::Error> {
    let serializer = serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true);
    value.serialize(&serializer)
}

/// Shared database handle for all storage implementations.
#[wasm_bindgen]
pub struct IdbStorageHandle {
    db: Rc<Database>,
}

#[wasm_bindgen]
impl IdbStorageHandle {
    /// Get the database name.
    #[wasm_bindgen(getter)]
    pub fn name(&self) -> String {
        self.db.name()
    }

    /// Close the database connection.
    pub fn close(&self) {
        self.db.close();
    }
}

impl Clone for IdbStorageHandle {
    fn clone(&self) -> Self {
        Self {
            db: Rc::clone(&self.db),
        }
    }
}

/// Open the IndexedDB database with migrations.
///
/// This function opens (or creates) the lendaswap IndexedDB database
/// and runs any necessary migrations. It also migrates wallet data from
/// the old Dexie-based `lendaswap-wallet` database if present.
///
/// # Arguments
/// * `db_name` - Optional database name (default: "lendaswap-v2")
///
/// # Returns
/// An `IdbStorageHandle` that can be used to create storage implementations.
#[wasm_bindgen(js_name = "openIdbDatabase")]
pub async fn open_idb_database(db_name: Option<String>) -> Result<IdbStorageHandle, JsValue> {
    let db_name = db_name.unwrap_or_else(|| DEFAULT_DB_NAME.to_string());

    let factory = Factory::new()
        .map_err(|e| JsValue::from_str(&format!("Failed to get IndexedDB factory: {:?}", e)))?;

    let mut open_request = factory
        .open(&db_name, Some(DB_VERSION))
        .map_err(|e| JsValue::from_str(&format!("Failed to open database: {:?}", e)))?;

    open_request.on_upgrade_needed(|event| {
        let db = event.database().unwrap();
        let old_version = event.old_version().unwrap_or(0);

        log::info!(
            "IndexedDB upgrade: {} -> {} for database '{}'",
            old_version,
            DB_VERSION,
            db.name()
        );

        // Version 1: Create object stores
        if old_version < 1 {
            log::info!("Creating object stores (version 1)");

            // Wallet store - single key-value for wallet data
            db.create_object_store(WALLET_STORE, ObjectStoreParams::new())
                .expect("Failed to create wallet store");

            // Swaps store - keyed by swap ID
            let mut swaps_params = ObjectStoreParams::new();
            swaps_params.key_path(Some(KeyPath::new_single("id")));
            db.create_object_store(SWAPS_STORE, swaps_params)
                .expect("Failed to create swaps store");

            // VTXO swaps store - keyed by swap ID
            let mut vtxo_params = ObjectStoreParams::new();
            vtxo_params.key_path(Some(KeyPath::new_single("id")));
            db.create_object_store(VTXO_SWAPS_STORE, vtxo_params)
                .expect("Failed to create vtxo_swaps store");
        }
    });

    let db = open_request
        .await
        .map_err(|e| JsValue::from_str(&format!("Failed to open database: {:?}", e)))?;

    // Migrate wallet data from old Dexie database if it exists
    migrate_wallet_from_old_database(&db).await?;

    Ok(IdbStorageHandle { db: Rc::new(db) })
}

/// Migrate wallet data from the old Dexie `lendaswap-wallet` database.
///
/// This function checks if the old wallet database exists and if so,
/// copies the mnemonic and key index to the new database.
async fn migrate_wallet_from_old_database(main_db: &Database) -> Result<(), JsValue> {
    let factory =
        Factory::new().map_err(|e| JsValue::from_str(&format!("Factory error: {:?}", e)))?;

    // Try to open the old wallet database (without version = opens latest)
    let old_db_req = match factory.open(OLD_WALLET_DB_NAME, None) {
        Ok(req) => req,
        Err(_) => {
            log::debug!("Old wallet database doesn't exist, skipping migration");
            return Ok(());
        }
    };

    let old_db = match old_db_req.await {
        Ok(db) => db,
        Err(_) => {
            log::debug!("Cannot open old wallet database, skipping migration");
            return Ok(());
        }
    };

    // Check if we already have wallet data in the new database
    let main_tx = main_db
        .transaction(&[WALLET_STORE], TransactionMode::ReadOnly)
        .map_err(|e| JsValue::from_str(&format!("Transaction error: {:?}", e)))?;
    let main_store = main_tx
        .object_store(WALLET_STORE)
        .map_err(|e| JsValue::from_str(&format!("Store error: {:?}", e)))?;
    let existing: Option<JsValue> = main_store
        .get(JsValue::from_str(WALLET_KEY))
        .map_err(|e| JsValue::from_str(&format!("Get error: {:?}", e)))?
        .await
        .map_err(|e| JsValue::from_str(&format!("Get await error: {:?}", e)))?;

    if existing.is_some() {
        // Already have wallet data, don't overwrite
        log::debug!("Wallet data already exists, skipping migration");
        old_db.close();
        return Ok(());
    }

    // Read from old database (key is "wallet" in old Dexie format)
    let old_tx = match old_db.transaction(&["wallet"], TransactionMode::ReadOnly) {
        Ok(tx) => tx,
        Err(_) => {
            log::debug!("Cannot create transaction on old wallet database");
            old_db.close();
            return Ok(());
        }
    };

    let old_store = match old_tx.object_store("wallet") {
        Ok(store) => store,
        Err(_) => {
            log::debug!("Cannot access wallet store in old database");
            old_db.close();
            return Ok(());
        }
    };

    // Old Dexie used "wallet" as the key for the single wallet record
    let old_data: Option<JsValue> = old_store
        .get(JsValue::from_str("wallet"))
        .map_err(|e| JsValue::from_str(&format!("Old get error: {:?}", e)))?
        .await
        .map_err(|e| JsValue::from_str(&format!("Old get await error: {:?}", e)))?;

    if let Some(old_data) = old_data {
        // Extract mnemonic and keyIndex from old record
        let mnemonic = Reflect::get(&old_data, &JsValue::from_str("mnemonic")).ok();
        let key_index = Reflect::get(&old_data, &JsValue::from_str("keyIndex"))
            .ok()
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);

        // Write to new wallet store
        let new_tx = main_db
            .transaction(&[WALLET_STORE], TransactionMode::ReadWrite)
            .map_err(|e| JsValue::from_str(&format!("New tx error: {:?}", e)))?;
        let new_store = new_tx
            .object_store(WALLET_STORE)
            .map_err(|e| JsValue::from_str(&format!("New store error: {:?}", e)))?;

        let new_obj = js_sys::Object::new();
        if let Some(m) = mnemonic {
            if !m.is_null() && !m.is_undefined() {
                Reflect::set(&new_obj, &JsValue::from_str("mnemonic"), &m).ok();
            }
        }
        Reflect::set(
            &new_obj,
            &JsValue::from_str("key_index"),
            &JsValue::from_f64(key_index),
        )
        .ok();

        new_store
            .put(&new_obj, Some(&JsValue::from_str(WALLET_KEY)))
            .map_err(|e| JsValue::from_str(&format!("Put error: {:?}", e)))?
            .await
            .map_err(|e| JsValue::from_str(&format!("Put await error: {:?}", e)))?;

        new_tx
            .commit()
            .map_err(|e| JsValue::from_str(&format!("Commit start error: {:?}", e)))?
            .await
            .map_err(|e| JsValue::from_str(&format!("Commit error: {:?}", e)))?;

        log::info!("Migrated wallet data from old lendaswap-wallet database");
    }

    old_db.close();
    Ok(())
}

/// IDB-based wallet storage implementation.
pub struct IdbWalletStorage {
    db: Rc<Database>,
}

impl IdbWalletStorage {
    /// Create a new IdbWalletStorage from a database handle.
    pub fn new(handle: &IdbStorageHandle) -> Self {
        Self {
            db: Rc::clone(&handle.db),
        }
    }
}

impl WalletStorage for IdbWalletStorage {
    fn get_mnemonic(&self) -> StorageFuture<'_, Option<String>> {
        let db = Rc::clone(&self.db);

        Box::pin(async move {
            let tx = db
                .transaction(&[WALLET_STORE], TransactionMode::ReadOnly)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to create transaction: {:?}", e))
                })?;

            let store = tx.object_store(WALLET_STORE).map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to get store: {:?}", e))
            })?;

            let value: Option<JsValue> = store
                .get(JsValue::from_str(WALLET_KEY))
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get wallet data: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get wallet data: {:?}", e))
                })?;

            let Some(value) = value else {
                return Ok(None);
            };

            // Extract mnemonic field from the object
            let mnemonic = Reflect::get(&value, &JsValue::from_str("mnemonic"))
                .ok()
                .and_then(|v| v.as_string());

            Ok(mnemonic)
        })
    }

    fn set_mnemonic(&self, mnemonic: &str) -> StorageFuture<'_, ()> {
        let db = Rc::clone(&self.db);
        let mnemonic = mnemonic.to_string();

        Box::pin(async move {
            let tx = db
                .transaction(&[WALLET_STORE], TransactionMode::ReadWrite)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to create transaction: {:?}", e))
                })?;

            let store = tx.object_store(WALLET_STORE).map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to get store: {:?}", e))
            })?;

            // Get existing data or create new
            let existing: Option<JsValue> = store
                .get(JsValue::from_str(WALLET_KEY))
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get wallet data: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get wallet data: {:?}", e))
                })?;

            let obj = match existing {
                Some(v) => v.dyn_into().unwrap_or_else(|_| js_sys::Object::new()),
                None => js_sys::Object::new(),
            };

            Reflect::set(
                &obj,
                &JsValue::from_str("mnemonic"),
                &JsValue::from_str(&mnemonic),
            )
            .map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to set mnemonic: {:?}", e))
            })?;

            store
                .put(&obj, Some(&JsValue::from_str(WALLET_KEY)))
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to store wallet data: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to store wallet data: {:?}", e))
                })?;

            tx.commit()
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to start commit: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to commit: {:?}", e))
                })?;

            Ok(())
        })
    }

    fn get_key_index(&self) -> StorageFuture<'_, u32> {
        let db = Rc::clone(&self.db);

        Box::pin(async move {
            let tx = db
                .transaction(&[WALLET_STORE], TransactionMode::ReadOnly)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to create transaction: {:?}", e))
                })?;

            let store = tx.object_store(WALLET_STORE).map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to get store: {:?}", e))
            })?;

            let value: Option<JsValue> = store
                .get(JsValue::from_str(WALLET_KEY))
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get wallet data: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get wallet data: {:?}", e))
                })?;

            let Some(value) = value else {
                return Ok(0);
            };

            let key_index = Reflect::get(&value, &JsValue::from_str("key_index"))
                .ok()
                .and_then(|v| v.as_f64())
                .map(|v| v as u32)
                .unwrap_or(0);

            Ok(key_index)
        })
    }

    fn set_key_index(&self, index: u32) -> StorageFuture<'_, ()> {
        let db = Rc::clone(&self.db);

        Box::pin(async move {
            let tx = db
                .transaction(&[WALLET_STORE], TransactionMode::ReadWrite)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to create transaction: {:?}", e))
                })?;

            let store = tx.object_store(WALLET_STORE).map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to get store: {:?}", e))
            })?;

            // Get existing data or create new
            let existing: Option<JsValue> = store
                .get(JsValue::from_str(WALLET_KEY))
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get wallet data: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get wallet data: {:?}", e))
                })?;

            let obj = match existing {
                Some(v) => v.dyn_into().unwrap_or_else(|_| js_sys::Object::new()),
                None => js_sys::Object::new(),
            };

            Reflect::set(
                &obj,
                &JsValue::from_str("key_index"),
                &JsValue::from_f64(index as f64),
            )
            .map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to set key_index: {:?}", e))
            })?;

            store
                .put(&obj, Some(&JsValue::from_str(WALLET_KEY)))
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to store wallet data: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to store wallet data: {:?}", e))
                })?;

            tx.commit()
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to start commit: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to commit: {:?}", e))
                })?;

            Ok(())
        })
    }
}

/// IDB-based swap storage implementation.
pub struct IdbSwapStorage {
    db: Rc<Database>,
}

impl IdbSwapStorage {
    /// Create a new IdbSwapStorage from a database handle.
    pub fn new(handle: &IdbStorageHandle) -> Self {
        Self {
            db: Rc::clone(&handle.db),
        }
    }
}

/// Apply migrations to a swap record if needed.
fn migrate_swap_record(value: &JsValue) -> Result<(), JsValue> {
    let response = Reflect::get(value, &JsValue::from_str("response"))?;
    if response.is_undefined() || response.is_null() {
        return Ok(());
    }

    // Migration v2: refund_locktime -> vhtlc_refund_locktime/evm_refund_locktime
    if Reflect::has(&response, &JsValue::from_str("refund_locktime"))? {
        // Skip BtcToArkade swaps (they have btc_htlc_address field)
        if !Reflect::has(&response, &JsValue::from_str("btc_htlc_address"))? {
            let old_locktime = Reflect::get(&response, &JsValue::from_str("refund_locktime"))?
                .as_f64()
                .unwrap_or(0.0);

            let twelve_hours = 43200.0;

            // Detect swap type: evm_to_btc has source_token_address field
            let is_evm_to_btc =
                Reflect::has(&response, &JsValue::from_str("source_token_address"))?;

            if is_evm_to_btc {
                Reflect::set(
                    &response,
                    &JsValue::from_str("evm_refund_locktime"),
                    &JsValue::from_f64(old_locktime),
                )?;
                Reflect::set(
                    &response,
                    &JsValue::from_str("vhtlc_refund_locktime"),
                    &JsValue::from_f64(old_locktime - twelve_hours),
                )?;
            } else {
                Reflect::set(
                    &response,
                    &JsValue::from_str("vhtlc_refund_locktime"),
                    &JsValue::from_f64(old_locktime),
                )?;
                Reflect::set(
                    &response,
                    &JsValue::from_str("evm_refund_locktime"),
                    &JsValue::from_f64(old_locktime - twelve_hours),
                )?;
            }

            // Delete old field using js_sys::Object
            if let Ok(obj) = response.clone().dyn_into::<js_sys::Object>() {
                let _ = Reflect::delete_property(&obj, &JsValue::from_str("refund_locktime"));
            }
        }
    }

    // Migration v3: Add source_asset/target_asset
    if !Reflect::has(&response, &JsValue::from_str("source_asset"))? {
        Reflect::set(
            &response,
            &JsValue::from_str("source_asset"),
            &JsValue::from_str("unknown"),
        )?;
    }
    if !Reflect::has(&response, &JsValue::from_str("target_asset"))? {
        Reflect::set(
            &response,
            &JsValue::from_str("target_asset"),
            &JsValue::from_str("unknown"),
        )?;
    }

    Ok(())
}

impl SwapStorage for IdbSwapStorage {
    fn get(&self, swap_id: &str) -> StorageFuture<'_, Option<ExtendedSwapStorageData>> {
        let db = Rc::clone(&self.db);
        let swap_id = swap_id.to_string();

        Box::pin(async move {
            let tx = db
                .transaction(&[SWAPS_STORE], TransactionMode::ReadOnly)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to create transaction: {:?}", e))
                })?;

            let store = tx.object_store(SWAPS_STORE).map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to get store: {:?}", e))
            })?;

            let value: Option<JsValue> = store
                .get(JsValue::from_str(&swap_id))
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get swap: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get swap: {:?}", e))
                })?;

            let Some(value) = value else {
                return Ok(None);
            };

            // Apply migrations at read time
            migrate_swap_record(&value).map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to migrate swap record: {:?}", e))
            })?;

            let data: ExtendedSwapStorageData =
                serde_wasm_bindgen::from_value(value).map_err(|e| {
                    lendaswap_core::Error::Storage(format!(
                        "Failed to deserialize swap data: {:?}",
                        e
                    ))
                })?;

            Ok(Some(data))
        })
    }

    fn store(&self, swap_id: &str, data: &ExtendedSwapStorageData) -> StorageFuture<'_, ()> {
        let db = Rc::clone(&self.db);
        let swap_id = swap_id.to_string();
        let data_js = to_js_value(data);

        Box::pin(async move {
            let data_js = data_js.map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to serialize swap data: {:?}", e))
            })?;

            // Add the id field to the object
            Reflect::set(
                &data_js,
                &JsValue::from_str("id"),
                &JsValue::from_str(&swap_id),
            )
            .map_err(|e| lendaswap_core::Error::Storage(format!("Failed to set id: {:?}", e)))?;

            let tx = db
                .transaction(&[SWAPS_STORE], TransactionMode::ReadWrite)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to create transaction: {:?}", e))
                })?;

            let store = tx.object_store(SWAPS_STORE).map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to get store: {:?}", e))
            })?;

            store
                .put(&data_js, None)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to store swap: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to store swap: {:?}", e))
                })?;

            tx.commit()
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to start commit: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to commit: {:?}", e))
                })?;

            Ok(())
        })
    }

    fn delete(&self, swap_id: &str) -> StorageFuture<'_, ()> {
        let db = Rc::clone(&self.db);
        let swap_id = swap_id.to_string();

        Box::pin(async move {
            let tx = db
                .transaction(&[SWAPS_STORE], TransactionMode::ReadWrite)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to create transaction: {:?}", e))
                })?;

            let store = tx.object_store(SWAPS_STORE).map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to get store: {:?}", e))
            })?;

            store
                .delete(JsValue::from_str(&swap_id))
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to delete swap: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to delete swap: {:?}", e))
                })?;

            tx.commit()
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to start commit: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to commit: {:?}", e))
                })?;

            Ok(())
        })
    }

    fn list(&self) -> StorageFuture<'_, Vec<String>> {
        let db = Rc::clone(&self.db);

        Box::pin(async move {
            let tx = db
                .transaction(&[SWAPS_STORE], TransactionMode::ReadOnly)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to create transaction: {:?}", e))
                })?;

            let store = tx.object_store(SWAPS_STORE).map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to get store: {:?}", e))
            })?;

            let keys = store
                .get_all_keys(None, None)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get keys: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get keys: {:?}", e))
                })?;

            let ids: Vec<String> = keys.iter().filter_map(|k| k.as_string()).collect();

            Ok(ids)
        })
    }

    fn get_all(&self) -> StorageFuture<'_, Vec<ExtendedSwapStorageData>> {
        let db = Rc::clone(&self.db);

        Box::pin(async move {
            let tx = db
                .transaction(&[SWAPS_STORE], TransactionMode::ReadOnly)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to create transaction: {:?}", e))
                })?;

            let store = tx.object_store(SWAPS_STORE).map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to get store: {:?}", e))
            })?;

            let values = store
                .get_all(None, None)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get all swaps: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get all swaps: {:?}", e))
                })?;

            let mut swaps = Vec::new();

            for value in values {
                // Apply migrations at read time
                if let Err(e) = migrate_swap_record(&value) {
                    log::warn!("Failed to migrate swap record: {:?}", e);
                    continue;
                }

                match serde_wasm_bindgen::from_value::<ExtendedSwapStorageData>(value.clone()) {
                    Ok(swap) => swaps.push(swap),
                    Err(e) => {
                        let id = Reflect::get(&value, &JsValue::from_str("id"))
                            .ok()
                            .and_then(|v| v.as_string())
                            .unwrap_or_else(|| "unknown".to_string());
                        log::warn!("Failed to deserialize swap '{}': {:?}", id, e);
                    }
                }
            }

            Ok(swaps)
        })
    }
}

/// IDB-based VTXO swap storage implementation.
pub struct IdbVtxoSwapStorage {
    db: Rc<Database>,
}

impl IdbVtxoSwapStorage {
    /// Create a new IdbVtxoSwapStorage from a database handle.
    pub fn new(handle: &IdbStorageHandle) -> Self {
        Self {
            db: Rc::clone(&handle.db),
        }
    }
}

impl VtxoSwapStorage for IdbVtxoSwapStorage {
    fn get(&self, swap_id: &str) -> StorageFuture<'_, Option<ExtendedVtxoSwapStorageData>> {
        let db = Rc::clone(&self.db);
        let swap_id = swap_id.to_string();

        Box::pin(async move {
            let tx = db
                .transaction(&[VTXO_SWAPS_STORE], TransactionMode::ReadOnly)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to create transaction: {:?}", e))
                })?;

            let store = tx.object_store(VTXO_SWAPS_STORE).map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to get store: {:?}", e))
            })?;

            let value: Option<JsValue> = store
                .get(JsValue::from_str(&swap_id))
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get vtxo swap: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get vtxo swap: {:?}", e))
                })?;

            let Some(value) = value else {
                return Ok(None);
            };

            let data: ExtendedVtxoSwapStorageData =
                serde_wasm_bindgen::from_value(value).map_err(|e| {
                    lendaswap_core::Error::Storage(format!(
                        "Failed to deserialize vtxo swap data: {:?}",
                        e
                    ))
                })?;

            Ok(Some(data))
        })
    }

    fn store(&self, swap_id: &str, data: &ExtendedVtxoSwapStorageData) -> StorageFuture<'_, ()> {
        let db = Rc::clone(&self.db);
        let swap_id = swap_id.to_string();
        let data_js = serde_wasm_bindgen::to_value(data);

        Box::pin(async move {
            let data_js = data_js.map_err(|e| {
                lendaswap_core::Error::Storage(format!(
                    "Failed to serialize vtxo swap data: {:?}",
                    e
                ))
            })?;

            // Add the id field to the object
            Reflect::set(
                &data_js,
                &JsValue::from_str("id"),
                &JsValue::from_str(&swap_id),
            )
            .map_err(|e| lendaswap_core::Error::Storage(format!("Failed to set id: {:?}", e)))?;

            let tx = db
                .transaction(&[VTXO_SWAPS_STORE], TransactionMode::ReadWrite)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to create transaction: {:?}", e))
                })?;

            let store = tx.object_store(VTXO_SWAPS_STORE).map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to get store: {:?}", e))
            })?;

            store
                .put(&data_js, None)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to store vtxo swap: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to store vtxo swap: {:?}", e))
                })?;

            tx.commit()
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to start commit: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to commit: {:?}", e))
                })?;

            Ok(())
        })
    }

    fn delete(&self, swap_id: &str) -> StorageFuture<'_, ()> {
        let db = Rc::clone(&self.db);
        let swap_id = swap_id.to_string();

        Box::pin(async move {
            let tx = db
                .transaction(&[VTXO_SWAPS_STORE], TransactionMode::ReadWrite)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to create transaction: {:?}", e))
                })?;

            let store = tx.object_store(VTXO_SWAPS_STORE).map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to get store: {:?}", e))
            })?;

            store
                .delete(JsValue::from_str(&swap_id))
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to delete vtxo swap: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to delete vtxo swap: {:?}", e))
                })?;

            tx.commit()
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to start commit: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to commit: {:?}", e))
                })?;

            Ok(())
        })
    }

    fn list(&self) -> StorageFuture<'_, Vec<String>> {
        let db = Rc::clone(&self.db);

        Box::pin(async move {
            let tx = db
                .transaction(&[VTXO_SWAPS_STORE], TransactionMode::ReadOnly)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to create transaction: {:?}", e))
                })?;

            let store = tx.object_store(VTXO_SWAPS_STORE).map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to get store: {:?}", e))
            })?;

            let keys = store
                .get_all_keys(None, None)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get keys: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get keys: {:?}", e))
                })?;

            let ids: Vec<String> = keys.iter().filter_map(|k| k.as_string()).collect();

            Ok(ids)
        })
    }

    fn get_all(&self) -> StorageFuture<'_, Vec<ExtendedVtxoSwapStorageData>> {
        let db = Rc::clone(&self.db);

        Box::pin(async move {
            let tx = db
                .transaction(&[VTXO_SWAPS_STORE], TransactionMode::ReadOnly)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to create transaction: {:?}", e))
                })?;

            let store = tx.object_store(VTXO_SWAPS_STORE).map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to get store: {:?}", e))
            })?;

            let values = store
                .get_all(None, None)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get all vtxo swaps: {:?}", e))
                })?
                .await
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to get all vtxo swaps: {:?}", e))
                })?;

            let mut swaps = Vec::new();

            for value in values {
                match serde_wasm_bindgen::from_value::<ExtendedVtxoSwapStorageData>(value.clone()) {
                    Ok(swap) => swaps.push(swap),
                    Err(e) => {
                        let id = Reflect::get(&value, &JsValue::from_str("id"))
                            .ok()
                            .and_then(|v| v.as_string())
                            .unwrap_or_else(|| "unknown".to_string());
                        log::warn!("Failed to deserialize vtxo swap '{}': {:?}", id, e);
                    }
                }
            }

            Ok(swaps)
        })
    }
}
