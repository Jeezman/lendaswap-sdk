#!/bin/bash
#
# Full swap flow: USDC (Polygon) → BTC (Arkade)
#
# Usage:
#   ./swap-usdc-pol-to-btc-arkade.sh [arkade_address] [amount]
#
# Prerequisites:
#   - .env with EVM_MNEMONIC set (Polygon wallet with USDC)
#   - npm install already run
#
set -euo pipefail

cd "$(dirname "$0")"

ARKADE_ADDR="${1:-tark1qra883hysahlkt0ujcwhv0x2n278849c3m7t3a08l7fdc40f4f2nm2gg7equpznfkswkuf7m5n6urhqwvp0ezkx879e7gyjk3amwmn4zxmpp68}"
AMOUNT="${2:-1000000}"
POLL_INTERVAL=10
MAX_WAIT=300 # 5 minutes

echo "============================================"
echo " Lendaswap: USDC (Polygon) -> BTC (Arkade)"
echo "============================================"
echo ""
echo "  Amount:  $AMOUNT (smallest units, e.g. 1000000 = 1 USDC)"
echo "  Target:  $ARKADE_ADDR"
echo ""

# ── Helper: portable timeout (works on macOS without coreutils) ──
run_with_timeout() {
  local secs="$1"
  shift
  "$@" &
  local pid=$!
  (sleep "$secs" && kill "$pid" 2>/dev/null) &
  local timer_pid=$!
  wait "$pid" 2>/dev/null || true
  kill "$timer_pid" 2>/dev/null || true
  wait "$timer_pid" 2>/dev/null || true
}

# ── Helper: extract swap status with a single poll ──
get_swap_status() {
  local swap_id="$1"
  local tmpfile
  tmpfile=$(mktemp)

  # Run watch with a 12s timeout — one poll cycle is 5s, so this captures at least one status line
  run_with_timeout 12 npm run watch -- "$swap_id" > "$tmpfile" 2>&1

  local status
  status=$(grep "^Status:" "$tmpfile" | tail -1 | awk '{print $2}') || true
  rm -f "$tmpfile"
  echo "$status"
}

# ─────────────────────────────────────────────
# Step 1: Create Swap
# ─────────────────────────────────────────────
echo "── Step 1: Creating swap ──"
echo ""

SWAP_OUTPUT=$(npm run swap -- usdc_pol btc_arkade "$AMOUNT" "$ARKADE_ADDR" 2>&1)
echo "$SWAP_OUTPUT"

# Extract the swap ID from "Swap ID: <uuid>" or "Swap ID:       <uuid>"
SWAP_ID=$(echo "$SWAP_OUTPUT" | grep 'Swap ID:' | head -1 | awk '{print $NF}')

if [ -z "$SWAP_ID" ]; then
  echo ""
  echo "ERROR: Could not extract swap ID from output"
  exit 1
fi

echo ""
echo "Swap ID: $SWAP_ID"

# ─────────────────────────────────────────────
# Step 2: Fund EVM HTLC via Coordinator
# ─────────────────────────────────────────────
echo ""
echo "── Step 2: Funding EVM HTLC via coordinator ──"
echo ""

# Auto-confirm the prompts: approve tx (if needed) + executeAndCreate tx
printf 'y\ny\n' | npm run evm-fund -- "$SWAP_ID"

# ─────────────────────────────────────────────
# Step 3: Wait for serverfunded
# ─────────────────────────────────────────────
echo ""
echo "── Step 3: Waiting for server to fund Arkade side ──"
echo ""

ELAPSED=0

while [ "$ELAPSED" -lt "$MAX_WAIT" ]; do
  STATUS=$(get_swap_status "$SWAP_ID")

  echo "  [${ELAPSED}s] Status: ${STATUS:-unknown}"

  case "$STATUS" in
    serverfunded)
      echo ""
      echo "  Server has funded the Arkade VHTLC!"
      break
      ;;
    clientredeemed|serverredeemed)
      echo ""
      echo "  Swap already redeemed."
      break
      ;;
    expired|clientrefunded|clientfundedserverrefunded)
      echo ""
      echo "ERROR: Swap reached terminal state: $STATUS"
      exit 1
      ;;
  esac

  sleep "$POLL_INTERVAL"
  ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

if [ "$ELAPSED" -ge "$MAX_WAIT" ]; then
  echo ""
  echo "ERROR: Timed out after ${MAX_WAIT}s waiting for serverfunded"
  echo "Check manually:  npm run watch -- $SWAP_ID"
  exit 1
fi

# ─────────────────────────────────────────────
# Step 4: Redeem (claim the Arkade VHTLC)
# ─────────────────────────────────────────────
echo ""
echo "── Step 4: Redeeming swap ──"
echo ""

npm run redeem -- "$SWAP_ID"

echo ""
echo "============================================"
echo " Swap complete!"
echo " Swap ID: $SWAP_ID"
echo "============================================"