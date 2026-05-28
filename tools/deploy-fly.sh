#!/usr/bin/env bash
# Pinkacord — one-shot Fly.io deploy script.
#
# Run from the repo root after:
#   1. fly CLI installed       (https://fly.io/docs/flyctl/install/)
#   2. fly auth login          (one-time interactive)
#   3. Edit secrets below      (admin password + bot creds)
#
# Usage: bash tools/deploy-fly.sh

set -euo pipefail

APP_NAME="pinkacordshowdown"
REGION="iad"  # change to match where most of your community is — see fly.toml
VOLUME_NAME="pinkacord_data"
VOLUME_SIZE_GB=3

# ────────────────────────────────────────────────────────────────────────────
# REQUIRED — fill in before running
# ────────────────────────────────────────────────────────────────────────────
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"      # set in env or paste here
BOT_USERNAME="${BOT_USERNAME:-}"          # PS account name (lowercase, no spaces)
BOT_PASSWORD="${BOT_PASSWORD:-}"          # password for that PS account

if [ -z "$ADMIN_PASSWORD" ] || [ -z "$BOT_USERNAME" ] || [ -z "$BOT_PASSWORD" ]; then
  echo "❌ Missing secrets. Set them in env or edit this script:"
  echo "   ADMIN_PASSWORD=...  BOT_USERNAME=...  BOT_PASSWORD=...  bash tools/deploy-fly.sh"
  exit 1
fi

# Make flyctl reachable even when ~/.fly/bin isn't on PATH yet (fresh install).
export FLYCTL_INSTALL="${FLYCTL_INSTALL:-$HOME/.fly}"
export PATH="$FLYCTL_INSTALL/bin:$PATH"

# ────────────────────────────────────────────────────────────────────────────
# Pre-flight
# ────────────────────────────────────────────────────────────────────────────
command -v fly >/dev/null 2>&1 || command -v flyctl >/dev/null 2>&1 || command -v flyctl.exe >/dev/null 2>&1 || { echo "❌ fly CLI not found. Install: https://fly.io/docs/flyctl/install/"; exit 1; }
FLY="$(command -v fly || command -v flyctl || command -v flyctl.exe)"
"$FLY" auth whoami >/dev/null 2>&1 || { echo "❌ Not logged in. Run: $FLY auth login"; exit 1; }

echo "✓ fly CLI present at $FLY, logged in as: $("$FLY" auth whoami)"
echo "✓ App name: $APP_NAME (region: $REGION)"
echo

# ────────────────────────────────────────────────────────────────────────────
# Create app if it doesn't exist
# ────────────────────────────────────────────────────────────────────────────
if "$FLY" apps list 2>/dev/null | grep -q "^$APP_NAME"; then
  echo "✓ App '$APP_NAME' already exists, skipping create."
else
  echo "→ Creating app '$APP_NAME'…"
  "$FLY" apps create "$APP_NAME"
fi

# ────────────────────────────────────────────────────────────────────────────
# Volume (persistent disk for content/, logs/, databases/)
# ────────────────────────────────────────────────────────────────────────────
if "$FLY" volumes list -a "$APP_NAME" 2>/dev/null | grep -q "$VOLUME_NAME"; then
  echo "✓ Volume '$VOLUME_NAME' already exists."
else
  echo "→ Creating volume '$VOLUME_NAME' (${VOLUME_SIZE_GB}GB) in $REGION…"
  "$FLY" volumes create "$VOLUME_NAME" --size "$VOLUME_SIZE_GB" --region "$REGION" -a "$APP_NAME" --yes
fi

# ────────────────────────────────────────────────────────────────────────────
# Secrets
# ────────────────────────────────────────────────────────────────────────────
echo "→ Setting secrets (won't print values)…"
"$FLY" secrets set \
  PINKACORD_ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  PINKACORD_BOT_USERNAME="$BOT_USERNAME" \
  PINKACORD_BOT_PASSWORD="$BOT_PASSWORD" \
  -a "$APP_NAME" \
  --stage  # don't trigger restart yet — deploy below will do that

# ────────────────────────────────────────────────────────────────────────────
# Deploy
# ────────────────────────────────────────────────────────────────────────────
echo "→ Deploying (this takes a few minutes)…"
"$FLY" deploy -a "$APP_NAME"

# ────────────────────────────────────────────────────────────────────────────
# Post-flight
# ────────────────────────────────────────────────────────────────────────────
echo
echo "✓ Deploy complete."
echo
echo "  PS server:   https://${APP_NAME}.fly.dev/"
echo "  Admin panel: https://${APP_NAME}.fly.dev:8443/"
echo
echo "Verify health:"
echo "  curl https://${APP_NAME}.fly.dev/health"
echo
echo "Tail logs:"
echo "  fly logs -a ${APP_NAME}"
