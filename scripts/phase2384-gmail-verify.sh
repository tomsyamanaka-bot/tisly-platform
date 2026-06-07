#!/usr/bin/env bash
# Phase 2384 — Gmail 実送信確認（login → test-email → stats → production-check）
set -euo pipefail

BASE_URL="${TISLY_PUBLIC_URL:-https://tisly.jp}"
ADMIN_USER="${ADMIN_USERNAME:-admin}"
ADMIN_PASS="${1:-${ADMIN_PASSWORD:-}}"

if [ -z "$ADMIN_PASS" ]; then
  echo "Usage: $0 'admin-password'" >&2
  echo "  or:  ADMIN_PASSWORD='...' $0" >&2
  exit 1
fi

echo "=== Phase 2384 Gmail real-send verify ==="
echo "BASE_URL=$BASE_URL"

echo ""
echo "--- GET /api/notifications/stats (before) ---"
curl -sf "$BASE_URL/api/notifications/stats" | head -c 2000
echo ""

echo ""
echo "--- POST /api/auth/login ---"
login_json="$(curl -sf -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")"
token="$(printf '%s' "$login_json" | sed -n 's/.*"token":"\([^"]*\)".*/\1/p')"
if [ -z "$token" ]; then
  echo "Login failed: $login_json" >&2
  exit 1
fi
echo "login ok (token acquired)"

echo ""
echo "--- POST /api/notifications/test-email ---"
result="$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/notifications/test-email" \
  -H "Authorization: Bearer $token")"
body="${result%%HTTP_STATUS:*}"
status="${result##*HTTP_STATUS:}"
echo "$body"
echo "HTTP_STATUS=$status"

if [ "$status" != "200" ]; then
  echo "test-email failed (HTTP $status)" >&2
  exit 1
fi

if ! printf '%s' "$body" | grep -q '"ok":true'; then
  echo "test-email returned ok:false" >&2
  exit 1
fi

echo ""
echo "--- GET /api/notifications/stats (after) ---"
stats_after="$(curl -sf "$BASE_URL/api/notifications/stats")"
echo "$stats_after" | head -c 2000
echo ""

gmail_mode="$(printf '%s' "$stats_after" | sed -n 's/.*"gmailMode":"\([^"]*\)".*/\1/p')"
last_status="$(printf '%s' "$stats_after" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p' | head -1)"

if [ "$gmail_mode" = "real" ] && [ "$last_status" != "sent" ]; then
  echo "Expected lastSendStatus=sent in real mode, got: $last_status" >&2
  exit 1
fi

echo ""
echo "--- GET /api/deploy/production-check ---"
curl -sf "$BASE_URL/api/deploy/production-check" | head -c 3000
echo ""

echo ""
echo "=== Phase 2384 Gmail verify: SUCCESS ==="
echo "受信メール確認: NOTIFICATION_TEST_TO 宛に [TiSLY] Gmail 通知テスト が届いているか確認してください"
