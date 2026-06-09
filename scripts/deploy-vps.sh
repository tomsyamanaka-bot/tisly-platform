#!/usr/bin/env bash
# ConoHa VPS 本番自動デプロイ（GitHub Actions から呼び出し / 手動実行可）
# 配置: /opt/tisly/scripts/deploy-vps.sh
# 何度実行しても同じ手順で安全に更新できる（冪等）
set -euo pipefail

REPO_ROOT="${TISLY_REPO_ROOT:-/opt/tisly}"
SERVER_DIR="${REPO_ROOT}/server"
SERVICE_NAME="${TISLY_SERVICE:-tisly-server}"
HEALTH_URL="${TISLY_HEALTH_URL:-https://tisly.jp/api/health}"
EXPECTED_COMMIT="${EXPECTED_COMMIT_SHORT:-}"

log() { echo "[TiSLY deploy-vps] $(date -Iseconds) $*"; }
fail() { log "ERROR: $*"; exit 1; }

if [ -n "${EXPECTED_COMMIT}" ]; then
  EXPECTED_SHORT="${EXPECTED_COMMIT:0:7}"
else
  EXPECTED_SHORT=""
fi

cd "${REPO_ROOT}"

echo "=== git pull ==="
git pull origin master

echo "=== npm install ==="
cd "${SERVER_DIR}"
npm install

echo "=== build ==="
npm run build
[ -f dist/index.js ] || fail "dist/index.js がありません — build 失敗"

echo "=== restart ==="
sudo systemctl restart "${SERVICE_NAME}"

echo "=== health check ==="
HEALTH_BODY=""
for attempt in $(seq 1 30); do
  if HEALTH_BODY="$(curl -sf --max-time 15 "${HEALTH_URL}" 2>/dev/null)"; then
    if echo "${HEALTH_BODY}" | grep -q commitShort; then
      break
    fi
  fi
  log "health 待機中 (${attempt}/30)..."
  sleep 2
done

[ -n "${HEALTH_BODY}" ] || fail "health API に到達できません: ${HEALTH_URL}"
echo "${HEALTH_BODY}" | grep commitShort || fail "health 応答に commitShort がありません"

if [ -n "${EXPECTED_SHORT}" ]; then
  ACTUAL_SHORT="$(echo "${HEALTH_BODY}" | grep -oE '"commitShort":"[0-9a-f]{7}"' | head -1 | cut -d'"' -f4 || true)"
  if [ "${ACTUAL_SHORT}" != "${EXPECTED_SHORT}" ]; then
    echo "${HEALTH_BODY}"
    fail "commitShort 不一致: expected=${EXPECTED_SHORT} actual=${ACTUAL_SHORT:-<none>}"
  fi
  log "commitShort 確認 OK: ${EXPECTED_SHORT}"
else
  echo "${HEALTH_BODY}" | grep commitShort
  log "commitShort 確認 OK（手動実行 — 期待値未指定）"
fi

echo "=== deploy completed ==="
