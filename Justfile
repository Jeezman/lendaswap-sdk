# =============================================================================
# Database (SQLx migrations for core)
# =============================================================================
# Default database path for development/testing

DB_PATH := './lendaswap-client.db'
DB_URL := 'sqlite:' + DB_PATH

# Create the database file if it doesn't exist
db-create:
    #!/usr/bin/env bash
    cd core
    if [ ! -f "{{ DB_PATH }}" ]; then
        echo "Creating database at {{ DB_PATH }}..."
        mkdir -p "$(dirname "{{ DB_PATH }}")"
        touch "{{ DB_PATH }}"
        echo "Database created."
    else
        echo "Database already exists at {{ DB_PATH }}"
    fi

# Prepare SQLx offline query data (run after changing queries)

# Note: doesn't need db-create since it only analyzes queries, doesn't connect to DB
db-prepare: db-create
    cd core && cargo sqlx prepare

# Add a new migration (creates up/down SQL files)
db-add-migration name:
    sqlx migrate add --source ./core/migrations -r {{ name }}

# Run pending migrations
db-run-migration: db-create
    sqlx migrate run --source ./core/migrations --database-url={{ DB_URL }}

# Revert the last migration
db-revert-migration:
    sqlx migrate revert --source ./core/migrations --database-url={{ DB_URL }}

# Show migration status
db-status:
    sqlx migrate info --source ./core/migrations --database-url={{ DB_URL }}

# =============================================================================
# WASM SDK (browser)
# =============================================================================

build-wasm:
    cd ts-sdk && pnpm build:wasm

release-wasm:
    cd ts-sdk && pnpm build:wasm:release

build-sdk: build-wasm
    cd ts-sdk && pnpm install && pnpm run build:ts

build-release: release-wasm
    cd ts-sdk && pnpm install && pnpm run build:release

test-sdk:
    cd ts-sdk && pnpm test

# Bump SDK version and publish to npm
bump-npm-version version: release-wasm
    cd ts-sdk && pnpm version {{ version }} --no-git-tag-version

# Dry-run publish to npm (shows what would be published)
publish-npm-dry-run: release-wasm
    cd ts-sdk && pnpm install && pnpm run publish:npm:dry-run

# Publish the SDK to npm (requires npm login)
publish-npm: release-wasm
    cd ts-sdk && pnpm install && pnpm run publish:npm

# =============================================================================
# Native SDK (Node.js with SQLite)
# =============================================================================

# Build native SDK for current platform (generates types + binary)
build-native:
    cd node-sdk && npm install && npm run build

# Build native SDK in debug mode
build-native-debug:
    cd node-sdk && npm install && npm run build:debug

# Bump native SDK version
bump-native-version version:
    cd node-sdk && npm version {{ version }} --no-git-tag-version

# Publish native SDK (current platform only - use CI for multi-platform)

# NOTE: For production, use GitHub Actions to build all platforms
publish-native-dry-run: build-native
    cd node-sdk && npm publish --dry-run

publish-native: build-native
    cd node-sdk && npm publish --access public

# =============================================================================
# All SDKs
# =============================================================================

# Build both SDKs
build-all: build-native build-sdk

# Bump version for both SDKs
bump-version version:
    cd ts-sdk && pnpm version {{ version }} --no-git-tag-version
    cd node-sdk && npm version {{ version }} --no-git-tag-version

# =============================================================================
# Examples
# =============================================================================

# Run Node.js example (requires build-native first)
run-nodejs-example: build-native
    cd examples/nodejs && npm install && npm start
