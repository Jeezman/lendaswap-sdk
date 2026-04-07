/**
 * Setup sample
 */

import {
  Client,
  InMemorySwapStorage,
  InMemoryWalletStorage,
} from "../src/index.js";

// #region setup
const client = await Client.builder()
  .withSignerStorage(new InMemoryWalletStorage())
  .withSwapStorage(new InMemorySwapStorage())
  .withApiKey(process.env.API_KEY || "")
  .build();
// #endregion setup

// #region version
const version = await client.getVersion();
console.log(`${JSON.stringify(version)}`);
// #endregion version
