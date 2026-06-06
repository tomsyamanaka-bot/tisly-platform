#!/usr/bin/env bash
# Phase 1501–1540 — VPS 投入コマンド一本化
# 使い方: bash scripts/vps-deploy-one-command.sh
# 事前: scripts/vps-first-deploy-check.sh が PASS であること
set -euo pipefail

REPO_ROOT="${TISLY_REPO_ROOT:-/opt/tisly}"
SERVER_DIR="${REPO_ROOT}/server"
SERVICE_NAME="${TISLY_SERVICE:-tisly-server}"
PUBLIC_BASE="${TISLY_PUBLIC_URL:-https://tisly.jp}"

log() { echo "[TiSLY deploy] $(date -Iseconds) $*"; }
fail() { echo "[TiSLY deploy] ERROR: $*" >&2; exit 1; }

curl_ok() {
  local url="$1"
  local label="$2"
  if curl -sf --max-time 30 "${url}" >/dev/null 2>&1; then
    log "✓ ${label}: ${url}"
  else
    log "✗ ${label}: ${url} — 応答失敗"
    return 1
  fi
}

log "=== VPS 一本化デプロイ開始 ==="
log "REPO_ROOT=${REPO_ROOT}"

cd "${REPO_ROOT}"
log "git pull"
git pull --ff-only origin master

cd "${SERVER_DIR}"
log "npm ci"
npm ci

log "npm run build"
npm run build

log "npm run release:gate"
npm run release:gate

log "npm run db:init"
npm run db:init

log "systemctl restart ${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"

log "nginx -t && reload"
sudo nginx -t
sudo systemctl reload nginx

log "=== 公開 URL 応答確認 ==="
VERIFY_FAIL=0
curl_ok "${PUBLIC_BASE}/api/health" "health" || VERIFY_FAIL=1
curl_ok "${PUBLIC_BASE}/app" "app" || VERIFY_FAIL=1
curl_ok "${PUBLIC_BASE}/survey" "survey" || VERIFY_FAIL=1
curl_ok "${PUBLIC_BASE}/business" "business" || VERIFY_FAIL=1
curl_ok "${PUBLIC_BASE}/sales" "sales" || VERIFY_FAIL=1

if [ "${VERIFY_FAIL}" -ne 0 ]; then
  fail "一部 URL が応答しません。journalctl -u ${SERVICE_NAME} -n 50 を確認"
fi

log "record deploy event"
npx tsx scripts/record-deploy-event.ts deploy success "vps-deploy-one-command.sh" vps-deploy-one-command.sh || log "deploy event record skipped"

log "=== デプロイ完了 ==="
log "確認: ${PUBLIC_BASE}/deployment/checklist"
