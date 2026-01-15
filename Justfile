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
