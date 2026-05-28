#!/usr/bin/env bash
# Pinkacord — register your hotpatch bot account as a PS Administrator.
#
# PS reads `config/usergroups.csv` at boot. Each line is `username,rank`.
# The hotpatch bot needs `~` (Administrator) so it can run /hotpatch commands.
#
# Usage:
#   bash tools/setup-bot.sh <yourbotusername>
#
# Run this BEFORE the first deploy, so the file ships in the Docker image.

set -euo pipefail

if [ $# -lt 1 ] || [ -z "$1" ]; then
  echo "Usage: bash tools/setup-bot.sh <yourbotusername>"
  echo
  echo "Example: bash tools/setup-bot.sh pinkacordadmin"
  exit 1
fi

BOT_NAME="$1"
# PS normalizes usernames to lowercase alphanumeric — match that here so the rank applies.
BOT_ID=$(echo "$BOT_NAME" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9')

if [ -z "$BOT_ID" ]; then
  echo "❌ Bot name '$BOT_NAME' contains no valid characters (a-z, 0-9 only after normalization)."
  exit 1
fi

CSV="config/usergroups.csv"

if [ -f "$CSV" ] && grep -q "^${BOT_ID}," "$CSV"; then
  echo "✓ '$BOT_ID' is already in $CSV:"
  grep "^${BOT_ID}," "$CSV"
  exit 0
fi

# Append (or create) the file.
echo "${BOT_ID},~" >> "$CSV"
echo "✓ Added '$BOT_ID' as Administrator (~) in $CSV"
echo
echo "Next:"
echo "  git add $CSV && git commit -m 'add hotpatch bot to admins'"
echo "  bash tools/deploy-fly.sh    # the file will be baked into the image"
