#!/usr/bin/env bash
# VPS — ADMIN_PASSWORD_HASH を安全に再設定して tisly-server を再起動
set -euo pipefail

SERVER_DIR="${TISLY_SERVER_DIR:-/opt/tisly/server}"
ENV_FILE="${SERVER_DIR}/.env"
SERVICE_NAME="${TISLY_SERVICE:-tisly-server}"
PASSWORD="${1:-}"

if [ -z "$PASSWORD" ]; then
  echo "Usage: $0 'your-strong-password'" >&2
  exit 1
fi

if [ "${#PASSWORD}" -lt 8 ]; then
  echo "Error: password must be at least 8 characters" >&2
  exit 1
fi

cd "$SERVER_DIR"
hash_line="$(npm run hash:admin-password -- "$PASSWORD" 2>/dev/null | grep '^ADMIN_PASSWORD_HASH=scrypt:' || true)"
if [ -z "$hash_line" ]; then
  echo "Error: failed to generate hash" >&2
  exit 1
fi

tmp="$(mktemp)"
if grep -q '^ADMIN_PASSWORD_HASH=' "$ENV_FILE"; then
  sed "s|^ADMIN_PASSWORD_HASH=.*|$hash_line|" "$ENV_FILE" > "$tmp"
else
  cp "$ENV_FILE" "$tmp"
  printf '\n%s\n' "$hash_line" >> "$tmp"
fi
mv "$tmp" "$ENV_FILE"
chmod 600 "$ENV_FILE"

systemctl restart "$SERVICE_NAME"
sleep 2

if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  echo "Error: $SERVICE_NAME not active after restart" >&2
  systemctl status "$SERVICE_NAME" --no-pager || true
  exit 1
fi

echo "ADMIN_PASSWORD_HASH updated and $SERVICE_NAME restarted"
echo "Verify: curl -s -X POST https://tisly.jp/api/auth/login -H 'Content-Type: application/json' -d '{\"username\":\"admin\",\"password\":\"YOUR_PASSWORD\"}'"
