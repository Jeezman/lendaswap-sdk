/**
 * Show wallet and API information.
 */

export async function showInfo(client, config) {
    console.log("Wallet & API Information");
    console.log("=".repeat(50));

    // Wallet info
    const mnemonic = await client.getMnemonic();
    const userIdXpub = await client.getUserIdXpub();
    console.log("\nWallet:");
    console.log(`  Mnemonic:  ${mnemonic.split(" ").slice(0, 4).join(" ")} ...`);
    console.log(`  User ID:   ${userIdXpub.substring(0, 30)}...`);

    // API info
    const version = await client.getVersion();
    console.log("\nAPI:");
    console.log(`  URL:       ${config.apiUrl}`);
    console.log(`  Version:   ${version.tag}`);
    console.log(`  Commit:    ${version.commitHash.substring(0, 7)}`);

    // Config
    console.log("\nConfig:");
    console.log(`  Network:   ${config.network}`);
    console.log(`  Database:  ${config.dbPath}`);
    console.log(`  Arkade:    ${config.arkadeUrl}`);
    console.log(`  Esplora:   ${config.esploraUrl}`);
}
