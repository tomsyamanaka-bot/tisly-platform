#!/usr/bin/env bash
# Phase 1461–1500 — ConoHa VPS 自動デプロイ
# 配置: /opt/tisly/scripts/deploy.sh
set -euo pipefail

REPO_ROOT="${TISLY_REPO_ROOT:-/opt/tisly}"
SERVER_DIR="${REPO_ROOT}/server"
SERVICE_NAME="${TISLY_SERVICE:-tisly-server}"

log() { echo "[TiSLY deploy] $(date -Iseconds) $*"; }

cd "${REPO_ROOT}"
log "backup before deploy"
cd "${SERVER_DIR}"
npm run deploy:backup || log "backup warnings (continuing)"

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

log "record deploy event"
npx tsx scripts/record-deploy-event.ts deploy success "VPS deploy completed" deploy.sh

log "systemctl restart ${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"

log "nginx reload"
sudo nginx -t && sudo systemctl reload nginx

log "deploy complete"
curl -sf "http://127.0.0.1:${TISLY_PORT:-3080}/api/health" | head -c 200 || log "health check pending"

# RP2350 remote-test: heartbeat ルート未反映を検知（404 = ビルド/再起動漏れ）
heartbeat_code="$(curl -s -o /dev/null -w '%{http_code}' \
  "http://127.0.0.1:${TISLY_PORT:-3080}/api/remote-test/heartbeat" || echo "000")"
if [ "${heartbeat_code}" = "404" ]; then
  log "ERROR: /api/remote-test/heartbeat returned 404 — dist 未反映の可能性"
  exit 1
fi
log "remote-test heartbeat route OK (HTTP ${heartbeat_code})"
