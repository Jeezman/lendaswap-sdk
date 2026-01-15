//! JavaScript storage adapter for WASM.
//!
//! This module provides the bridge between JavaScript storage implementations
//! and the Rust WalletStorage/SwapStorage/VtxoSwapStorage traits. It allows TypeScript code to provide
//! storage callbacks that are used by the core SDK.

use js_sys::{Function, Promise};
use lendaswap_core::storage::{StorageFuture, SwapStorage, VtxoSwapStorage, WalletStorage};
use lendaswap_core::{ExtendedSwapStorageData, ExtendedVtxoSwapStorageData};
use serde::Serialize;
use std::cell::RefCell;
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;

thread_local! {
    /// Stores IDs of swap entries that failed to deserialize.
    /// This allows the frontend to know how many entries were skipped.
    static CORRUPTED_SWAP_IDS: RefCell<Vec<String>> = RefCell::new(Vec::new());
}

/// Get the list of swap IDs that failed to deserialize.
pub fn get_corrupted_swap_ids() -> Vec<String> {
    CORRUPTED_SWAP_IDS.with(|ids| ids.borrow().clone())
}

/// Clear the list of corrupted swap IDs.
pub fn clear_corrupted_swap_ids() {
    CORRUPTED_SWAP_IDS.with(|ids| ids.borrow_mut().clear());
}

/// Serialize a value to JsValue using consistent settings.
/// Uses `serialize_maps_as_objects(true)` to ensure internally tagged enums
/// with flatten serialize correctly as plain JS objects.
fn to_js_value<T: Serialize>(value: &T) -> Result<JsValue, serde_wasm_bindgen::Error> {
    let serializer = serde_wasm_bindgen::Serializer::new().serialize_maps_as_objects(true);
    value.serialize(&serializer)
}

/// JavaScript wallet storage provider passed from TypeScript.
///
/// This struct wraps JavaScript callback functions that implement
/// the typed wallet storage operations. Each function should return a Promise.
///
/// # Example (TypeScript)
///
/// ```typescript
/// const provider = new JsWalletStorageProvider(
///     async () => localStorage.getItem('mnemonic'),           // get_mnemonic
///     async (mnemonic) => localStorage.setItem('mnemonic', mnemonic), // set_mnemonic
///     async () => parseInt(localStorage.getItem('key_index') ?? '0'), // get_key_index
///     async (index) => localStorage.setItem('key_index', index.toString()), // set_key_index
/// );
/// ```
#[wasm_bindgen]
pub struct JsWalletStorageProvider {
    get_mnemonic_fn: Function,
    set_mnemonic_fn: Function,
    get_key_index_fn: Function,
    set_key_index_fn: Function,
}

#[wasm_bindgen]
impl JsWalletStorageProvider {
    /// Create a new JsWalletStorageProvider from JavaScript callbacks.
    ///
    /// # Arguments
    /// * `get_mnemonic_fn` - Function: `() => Promise<string | null>`
    /// * `set_mnemonic_fn` - Function: `(mnemonic: string) => Promise<void>`
    /// * `get_key_index_fn` - Function: `() => Promise<number>`
    /// * `set_key_index_fn` - Function: `(index: number) => Promise<void>`
    #[wasm_bindgen(constructor)]
    pub fn new(
        get_mnemonic_fn: Function,
        set_mnemonic_fn: Function,
        get_key_index_fn: Function,
        set_key_index_fn: Function,
    ) -> Self {
        Self {
            get_mnemonic_fn,
            set_mnemonic_fn,
            get_key_index_fn,
            set_key_index_fn,
        }
    }
}

/// Internal adapter that implements the core WalletStorage trait using JS callbacks.
///
/// This adapter converts JavaScript Promise-based callbacks into Rust async
/// operations that implement the WalletStorage trait.
pub struct JsWalletStorageAdapter {
    provider: JsWalletStorageProvider,
}

impl JsWalletStorageAdapter {
    /// Create a new adapter wrapping a JsWalletStorageProvider.
    pub fn new(provider: JsWalletStorageProvider) -> Self {
        Self { provider }
    }
}

impl WalletStorage for JsWalletStorageAdapter {
    fn get_mnemonic(&self) -> StorageFuture<'_, Option<String>> {
        let result = self.provider.get_mnemonic_fn.call0(&JsValue::NULL);

        Box::pin(async move {
            let promise: Promise = result
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to call get_mnemonic: {:?}", e))
                })?
                .dyn_into()
                .map_err(|_| {
                    lendaswap_core::Error::Storage("Expected Promise from get_mnemonic".into())
                })?;

            let value = JsFuture::from(promise).await.map_err(|e| {
                lendaswap_core::Error::Storage(format!("get_mnemonic Promise rejected: {:?}", e))
            })?;

            if value.is_null() || value.is_undefined() {
                Ok(None)
            } else {
                Ok(value.as_string())
            }
        })
    }

    fn set_mnemonic(&self, mnemonic: &str) -> StorageFuture<'_, ()> {
        let mnemonic = JsValue::from_str(mnemonic);
        let result = self
            .provider
            .set_mnemonic_fn
            .call1(&JsValue::NULL, &mnemonic);

        Box::pin(async move {
            let promise: Promise = result
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to call set_mnemonic: {:?}", e))
                })?
                .dyn_into()
                .map_err(|_| {
                    lendaswap_core::Error::Storage("Expected Promise from set_mnemonic".into())
                })?;

            JsFuture::from(promise).await.map_err(|e| {
                lendaswap_core::Error::Storage(format!("set_mnemonic Promise rejected: {:?}", e))
            })?;

            Ok(())
        })
    }

    fn get_key_index(&self) -> StorageFuture<'_, u32> {
        let result = self.provider.get_key_index_fn.call0(&JsValue::NULL);

        Box::pin(async move {
            let promise: Promise = result
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to call get_key_index: {:?}", e))
                })?
                .dyn_into()
                .map_err(|_| {
                    lendaswap_core::Error::Storage("Expected Promise from get_key_index".into())
                })?;

            let value = JsFuture::from(promise).await.map_err(|e| {
                lendaswap_core::Error::Storage(format!("get_key_index Promise rejected: {:?}", e))
            })?;

            let index = value.as_f64().unwrap_or(0.0) as u32;
            Ok(index)
        })
    }

    fn set_key_index(&self, index: u32) -> StorageFuture<'_, ()> {
        let index = JsValue::from_f64(index as f64);
        let result = self.provider.set_key_index_fn.call1(&JsValue::NULL, &index);

        Box::pin(async move {
            let promise: Promise = result
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to call set_key_index: {:?}", e))
                })?
                .dyn_into()
                .map_err(|_| {
                    lendaswap_core::Error::Storage("Expected Promise from set_key_index".into())
                })?;

            JsFuture::from(promise).await.map_err(|e| {
                lendaswap_core::Error::Storage(format!("set_key_index Promise rejected: {:?}", e))
            })?;

            Ok(())
        })
    }
}

/// JavaScript swap storage provider passed from TypeScript.
///
/// This struct wraps JavaScript callback functions that implement
/// typed swap storage operations. Each function should return a Promise.
///
/// # Example (TypeScript with Dexie)
///
/// ```typescript
/// import Dexie from 'dexie';
///
/// const db = new Dexie('lendaswap');
/// db.version(1).stores({ swaps: 'id' });
///
/// const swapStorage = new JsSwapStorageProvider(
///     async (swapId) => await db.swaps.get(swapId) ?? null,
///     async (swapId, data) => { await db.swaps.put({ id: swapId, ...data }); },
///     async (swapId) => { await db.swaps.delete(swapId); },
///     async () => await db.swaps.toCollection().primaryKeys()
/// );
/// ```
#[wasm_bindgen]
pub struct JsSwapStorageProvider {
    get_fn: Function,
    store_fn: Function,
    delete_fn: Function,
    list_fn: Function,
    get_all_fn: Function,
}

#[wasm_bindgen]
impl JsSwapStorageProvider {
    /// Create a new JsSwapStorageProvider from JavaScript callbacks.
    ///
    /// # Arguments
    /// * `get_fn` - Function: `(swapId: string) => Promise<ExtendedSwapStorageData | null>`
    /// * `store_fn` - Function: `(swapId: string, data: ExtendedSwapStorageData) => Promise<void>`
    /// * `delete_fn` - Function: `(swapId: string) => Promise<void>`
    /// * `list_fn` - Function: `() => Promise<string[]>`
    /// * `get_all_fn` - Function: `() => Promise<ExtendedSwapStorageData[]>`
    #[wasm_bindgen(constructor)]
    pub fn new(
        get_fn: Function,
        store_fn: Function,
        delete_fn: Function,
        list_fn: Function,
        get_all_fn: Function,
    ) -> Self {
        Self {
            get_fn,
            store_fn,
            delete_fn,
            list_fn,
            get_all_fn,
        }
    }
}

/// Internal adapter that implements the core SwapStorage trait using JS callbacks.
///
/// This adapter converts JavaScript Promise-based callbacks into Rust async
/// operations that implement the SwapStorage trait.
pub struct JsSwapStorageAdapter {
    provider: JsSwapStorageProvider,
}

impl JsSwapStorageAdapter {
    /// Create a new adapter wrapping a JsSwapStorageProvider.
    pub fn new(provider: JsSwapStorageProvider) -> Self {
        Self { provider }
    }
}

impl SwapStorage for JsSwapStorageAdapter {
    fn get(&self, swap_id: &str) -> StorageFuture<'_, Option<ExtendedSwapStorageData>> {
        let swap_id = JsValue::from_str(swap_id);
        let result = self.provider.get_fn.call1(&JsValue::NULL, &swap_id);

        Box::pin(async move {
            let promise: Promise = result
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to call get: {:?}", e))
                })?
                .dyn_into()
                .map_err(|_| lendaswap_core::Error::Storage("Expected Promise from get".into()))?;

            let value = JsFuture::from(promise).await.map_err(|e| {
                lendaswap_core::Error::Storage(format!("get Promise rejected: {:?}", e))
            })?;

            if value.is_null() || value.is_undefined() {
                Ok(None)
            } else {
                let data: ExtendedSwapStorageData =
                    serde_wasm_bindgen::from_value(value).map_err(|e| {
                        lendaswap_core::Error::Storage(format!(
                            "Failed to deserialize swap data: {:?}",
                            e
                        ))
                    })?;
                Ok(Some(data))
            }
        })
    }

    fn store(&self, swap_id: &str, data: &ExtendedSwapStorageData) -> StorageFuture<'_, ()> {
        let swap_id = JsValue::from_str(swap_id);
        let data_js = to_js_value(data);

        Box::pin(async move {
            let data_js = data_js.map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to serialize swap data: {:?}", e))
            })?;

            let result = self
                .provider
                .store_fn
                .call2(&JsValue::NULL, &swap_id, &data_js);

            let promise: Promise = result
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to call store: {:?}", e))
                })?
                .dyn_into()
                .map_err(|_| {
                    lendaswap_core::Error::Storage("Expected Promise from store".into())
                })?;

            JsFuture::from(promise).await.map_err(|e| {
                lendaswap_core::Error::Storage(format!("store Promise rejected: {:?}", e))
            })?;

            Ok(())
        })
    }

    fn delete(&self, swap_id: &str) -> StorageFuture<'_, ()> {
        let swap_id = JsValue::from_str(swap_id);
        let result = self.provider.delete_fn.call1(&JsValue::NULL, &swap_id);

        Box::pin(async move {
            let promise: Promise = result
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to call delete: {:?}", e))
                })?
                .dyn_into()
                .map_err(|_| {
                    lendaswap_core::Error::Storage("Expected Promise from delete".into())
                })?;

            JsFuture::from(promise).await.map_err(|e| {
                lendaswap_core::Error::Storage(format!("delete Promise rejected: {:?}", e))
            })?;

            Ok(())
        })
    }

    fn list(&self) -> StorageFuture<'_, Vec<String>> {
        let result = self.provider.list_fn.call0(&JsValue::NULL);

        Box::pin(async move {
            let promise: Promise = result
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to call list: {:?}", e))
                })?
                .dyn_into()
                .map_err(|_| lendaswap_core::Error::Storage("Expected Promise from list".into()))?;

            let value = JsFuture::from(promise).await.map_err(|e| {
                lendaswap_core::Error::Storage(format!("list Promise rejected: {:?}", e))
            })?;

            let ids: Vec<String> = serde_wasm_bindgen::from_value(value).map_err(|e| {
                lendaswap_core::Error::Storage(format!("Failed to deserialize swap IDs: {:?}", e))
            })?;

            Ok(ids)
        })
    }

    fn get_all(&self) -> StorageFuture<'_, Vec<ExtendedSwapStorageData>> {
        let result = self.provider.get_all_fn.call0(&JsValue::NULL);

        Box::pin(async move {
            let promise: Promise = result
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to call list: {:?}", e))
                })?
                .dyn_into()
                .map_err(|_| lendaswap_core::Error::Storage("Expected Promise from list".into()))?;

            let value = JsFuture::from(promise).await.map_err(|e| {
                lendaswap_core::Error::Storage(format!("list Promise rejected: {:?}", e))
            })?;

            // Try to deserialize the entire array first (fast path)
            if let Ok(swaps) =
                serde_wasm_bindgen::from_value::<Vec<ExtendedSwapStorageData>>(value.clone())
            {
                // Clear any stale corrupted IDs since fast path succeeded
                clear_corrupted_swap_ids();
                return Ok(swaps);
            }

            // If that fails, iterate over individual entries and skip failures
            let array: js_sys::Array = value
                .dyn_into()
                .map_err(|_| lendaswap_core::Error::Storage("Expected Array from getAll".into()))?;

            // Clear corrupted IDs right before iteration to avoid race conditions
            // with React StrictMode calling this twice
            clear_corrupted_swap_ids();

            let mut swaps = Vec::new();

            for i in 0..array.length() {
                let entry = array.get(i);
                let entry_string = entry.as_string();

                // Try to extract the ID first for error tracking
                let entry_id = js_sys::Reflect::get(&entry, &JsValue::from_str("id"))
                    .ok()
                    .and_then(|v| v.as_string())
                    .unwrap_or_else(|| format!("unknown-{}", i));

                match serde_wasm_bindgen::from_value::<ExtendedSwapStorageData>(entry) {
                    Ok(swap) => swaps.push(swap),
                    Err(e) => {
                        log::warn!(
                            "Failed to deserialize swap entry '{}': {:?}. Full json {entry_string:?}",
                            entry_id,
                            e
                        );
                        CORRUPTED_SWAP_IDS.with(|ids| {
                            ids.borrow_mut().push(entry_id);
                        });
                    }
                }
            }

            let corrupted_count = CORRUPTED_SWAP_IDS.with(|ids| ids.borrow().len());
            if corrupted_count > 0 {
                log::warn!(
                    "Skipped {} corrupted swap entries out of {} total",
                    corrupted_count,
                    array.length(),
                );
            }

            Ok(swaps)
        })
    }
}

/// JavaScript VTXO swap storage provider passed from TypeScript.
///
/// This struct wraps JavaScript callback functions that implement
/// typed VTXO swap storage operations. Each function should return a Promise.
///
/// # Example (TypeScript with Dexie)
///
/// ```typescript
/// import Dexie from 'dexie';
///
/// const db = new Dexie('lendaswap');
/// db.version(1).stores({ vtxoSwaps: 'id' });
///
/// const vtxoSwapStorage = new JsVtxoSwapStorageProvider(
///     async (swapId) => await db.vtxoSwaps.get(swapId) ?? null,
///     async (swapId, data) => { await db.vtxoSwaps.put({ id: swapId, ...data }); },
///     async (swapId) => { await db.vtxoSwaps.delete(swapId); },
///     async () => await db.vtxoSwaps.toCollection().primaryKeys(),
///     async () => await db.vtxoSwaps.toArray()
/// );
/// ```
#[wasm_bindgen]
pub struct JsVtxoSwapStorageProvider {
    get_fn: Function,
    store_fn: Function,
    delete_fn: Function,
    list_fn: Function,
    get_all_fn: Function,
}

#[wasm_bindgen]
impl JsVtxoSwapStorageProvider {
    /// Create a new JsVtxoSwapStorageProvider from JavaScript callbacks.
    ///
    /// # Arguments
    /// * `get_fn` - Function: `(swapId: string) => Promise<ExtendedVtxoSwapStorageData | null>`
    /// * `store_fn` - Function: `(swapId: string, data: ExtendedVtxoSwapStorageData) => Promise<void>`
    /// * `delete_fn` - Function: `(swapId: string) => Promise<void>`
    /// * `list_fn` - Function: `() => Promise<string[]>`
    /// * `get_all_fn` - Function: `() => Promise<ExtendedVtxoSwapStorageData[]>`
    #[wasm_bindgen(constructor)]
    pub fn new(
        get_fn: Function,
        store_fn: Function,
        delete_fn: Function,
        list_fn: Function,
        get_all_fn: Function,
    ) -> Self {
        Self {
            get_fn,
            store_fn,
            delete_fn,
            list_fn,
            get_all_fn,
        }
    }
}

/// Internal adapter that implements the core VtxoSwapStorage trait using JS callbacks.
///
/// This adapter converts JavaScript Promise-based callbacks into Rust async
/// operations that implement the VtxoSwapStorage trait.
pub struct JsVtxoSwapStorageAdapter {
    provider: JsVtxoSwapStorageProvider,
}

impl JsVtxoSwapStorageAdapter {
    /// Create a new adapter wrapping a JsVtxoSwapStorageProvider.
    pub fn new(provider: JsVtxoSwapStorageProvider) -> Self {
        Self { provider }
    }
}

impl VtxoSwapStorage for JsVtxoSwapStorageAdapter {
    fn get(&self, swap_id: &str) -> StorageFuture<'_, Option<ExtendedVtxoSwapStorageData>> {
        let swap_id = JsValue::from_str(swap_id);
        let result = self.provider.get_fn.call1(&JsValue::NULL, &swap_id);

        Box::pin(async move {
            let promise: Promise = result
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to call get: {:?}", e))
                })?
                .dyn_into()
                .map_err(|_| lendaswap_core::Error::Storage("Expected Promise from get".into()))?;

            let value = JsFuture::from(promise).await.map_err(|e| {
                lendaswap_core::Error::Storage(format!("get Promise rejected: {:?}", e))
            })?;

            if value.is_null() || value.is_undefined() {
                Ok(None)
            } else {
                let data: ExtendedVtxoSwapStorageData = serde_wasm_bindgen::from_value(value)
                    .map_err(|e| {
                        lendaswap_core::Error::Storage(format!(
                            "Failed to deserialize VTXO swap data: {:?}",
                            e
                        ))
                    })?;
                Ok(Some(data))
            }
        })
    }

    fn store(&self, swap_id: &str, data: &ExtendedVtxoSwapStorageData) -> StorageFuture<'_, ()> {
        let swap_id = JsValue::from_str(swap_id);
        let data_js = serde_wasm_bindgen::to_value(data);

        Box::pin(async move {
            let data_js = data_js.map_err(|e| {
                lendaswap_core::Error::Storage(format!(
                    "Failed to serialize VTXO swap data: {:?}",
                    e
                ))
            })?;

            let result = self
                .provider
                .store_fn
                .call2(&JsValue::NULL, &swap_id, &data_js);

            let promise: Promise = result
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to call store: {:?}", e))
                })?
                .dyn_into()
                .map_err(|_| {
                    lendaswap_core::Error::Storage("Expected Promise from store".into())
                })?;

            JsFuture::from(promise).await.map_err(|e| {
                lendaswap_core::Error::Storage(format!("store Promise rejected: {:?}", e))
            })?;

            Ok(())
        })
    }

    fn delete(&self, swap_id: &str) -> StorageFuture<'_, ()> {
        let swap_id = JsValue::from_str(swap_id);
        let result = self.provider.delete_fn.call1(&JsValue::NULL, &swap_id);

        Box::pin(async move {
            let promise: Promise = result
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to call delete: {:?}", e))
                })?
                .dyn_into()
                .map_err(|_| {
                    lendaswap_core::Error::Storage("Expected Promise from delete".into())
                })?;

            JsFuture::from(promise).await.map_err(|e| {
                lendaswap_core::Error::Storage(format!("delete Promise rejected: {:?}", e))
            })?;

            Ok(())
        })
    }

    fn list(&self) -> StorageFuture<'_, Vec<String>> {
        let result = self.provider.list_fn.call0(&JsValue::NULL);

        Box::pin(async move {
            let promise: Promise = result
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to call list: {:?}", e))
                })?
                .dyn_into()
                .map_err(|_| lendaswap_core::Error::Storage("Expected Promise from list".into()))?;

            let value = JsFuture::from(promise).await.map_err(|e| {
                lendaswap_core::Error::Storage(format!("list Promise rejected: {:?}", e))
            })?;

            let ids: Vec<String> = serde_wasm_bindgen::from_value(value).map_err(|e| {
                lendaswap_core::Error::Storage(format!(
                    "Failed to deserialize VTXO swap IDs: {:?}",
                    e
                ))
            })?;

            Ok(ids)
        })
    }

    fn get_all(&self) -> StorageFuture<'_, Vec<ExtendedVtxoSwapStorageData>> {
        let result = self.provider.get_all_fn.call0(&JsValue::NULL);

        Box::pin(async move {
            let promise: Promise = result
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!("Failed to call get_all: {:?}", e))
                })?
                .dyn_into()
                .map_err(|_| {
                    lendaswap_core::Error::Storage("Expected Promise from get_all".into())
                })?;

            let value = JsFuture::from(promise).await.map_err(|e| {
                lendaswap_core::Error::Storage(format!("get_all Promise rejected: {:?}", e))
            })?;

            let swaps: Vec<ExtendedVtxoSwapStorageData> = serde_wasm_bindgen::from_value(value)
                .map_err(|e| {
                    lendaswap_core::Error::Storage(format!(
                        "Failed to deserialize VTXO swaps: {:?}",
                        e
                    ))
                })?;

            Ok(swaps)
        })
    }
}
