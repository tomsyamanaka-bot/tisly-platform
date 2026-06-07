#!/usr/bin/env bash
# Phase 2385 — Gmail PDF 添付テストメール確認（login → test-email → stats → production-check）
set -euo pipefail

BASE_URL="${BASE_URL:-https://tisly.jp}"
ADMIN_USER="${ADMIN_USER:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD env var}"

echo "=== Phase 2385 Gmail PDF attachment verify ==="
echo "BASE_URL=$BASE_URL"

echo ""
echo "--- GET /api/notifications/stats (before) ---"
curl -s "$BASE_URL/api/notifications/stats" | jq '{gmailMode, smtpConfigured, emailMode, lastSendStatus}'

echo ""
echo "--- POST /api/auth/login ---"
token="$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASSWORD\"}" \
  | jq -r .token)"
if [[ -z "$token" || "$token" == "null" ]]; then
  echo "Login failed" >&2
  exit 1
fi
echo "login ok (token acquired)"

echo ""
echo "--- POST /api/notifications/test-email ---"
result="$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/api/notifications/test-email" \
  -H "Authorization: Bearer $token")"
status="$(echo "$result" | tail -1 | sed 's/HTTP_STATUS://')"
body="$(echo "$result" | sed '$d')"
echo "$body" | jq .

if [[ "$status" != "200" ]]; then
  echo "test-email failed (HTTP $status)" >&2
  exit 1
fi
if [[ "$(echo "$body" | jq -r .ok)" != "true" ]]; then
  echo "test-email returned ok:false" >&2
  exit 1
fi
if [[ "$(echo "$body" | jq -r .attachmentIncluded)" != "true" ]]; then
  echo "Expected attachmentIncluded=true" >&2
  exit 1
fi
echo "PDF attachment: $(echo "$body" | jq -r .attachmentFileName)"

echo ""
echo "--- GET /api/notifications/stats (after) ---"
curl -s "$BASE_URL/api/notifications/stats" | jq '{gmailMode, smtpConfigured, lastSendStatus}'

gmail_mode="$(curl -s "$BASE_URL/api/notifications/stats" | jq -r .gmailMode)"
last_status="$(curl -s "$BASE_URL/api/notifications/stats" | jq -r .lastSendStatus.status)"
if [[ "$gmail_mode" == "real" && "$last_status" != "sent" ]]; then
  echo "Expected lastSendStatus=sent in real mode, got: $last_status" >&2
  exit 1
fi

echo ""
echo "--- GET /api/deploy/production-check ---"
curl -s "$BASE_URL/api/deploy/production-check" 2>/dev/null \
  | jq '{phase, adminPasswordStatus, operationalReady, gmailMode, pdfAttachmentEnabled, testEmailBodySafe, productionRatePercent, ready}' \
  || curl -s "$BASE_URL/api/deploy/production-check-2384" \
  | jq '{phase, adminPasswordStatus, operationalReady, gmailMode, productionRatePercent, ready}'

echo ""
echo "=== Phase 2385 Gmail verify: SUCCESS ==="
echo "受信メール確認:"
echo "  - 件名: [TiSLY] Gmail 通知テスト"
echo "  - 添付: tisly-gmail-test.pdf"
echo "  - 本文: 送信時刻 + モード(real/mock) のみ（SMTP 情報なし）"
