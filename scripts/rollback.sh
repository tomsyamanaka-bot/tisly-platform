#!/usr/bin/env bash
# Phase 1541–1580 — 前回コミットへロールバック + nginx reload + health 確認
set -euo pipefail

REPO_ROOT="${TISLY_REPO_ROOT:-/opt/tisly}"
SERVER_DIR="${REPO_ROOT}/server"
SERVICE_NAME="${TISLY_SERVICE:-tisly-server}"
PUBLIC_BASE="${TISLY_PUBLIC_URL:-https://tisly.jp}"

log() { echo "[TiSLY rollback] $(date -Iseconds) $*"; }
warn() { echo "[TiSLY rollback] WARN: $*" >&2; }

ROLLBACK_URLS=(
  "${PUBLIC_BASE}/api/health"
  "${PUBLIC_BASE}/app"
  "${PUBLIC_BASE}/survey"
  "${PUBLIC_BASE}/business"
  "${PUBLIC_BASE}/sales"
  "${PUBLIC_BASE}/deployment/checklist"
)

cd "${REPO_ROOT}"

PREV_COMMIT="$(git rev-parse HEAD~1 2>/dev/null || true)"
if [ -z "${PREV_COMMIT}" ]; then
  log "ERROR: no previous commit"
  exit 1
fi

log "backup before rollback"
cd "${SERVER_DIR}"
npm run deploy:backup || warn "backup warnings (continuing)"

cd "${REPO_ROOT}"
log "git reset --hard HEAD~1 (${PREV_COMMIT})"
git reset --hard HEAD~1

cd "${SERVER_DIR}"
log "npm ci"
npm ci

log "npm run build"
npm run build

log "record rollback event"
npx tsx scripts/record-deploy-event.ts rollback rolled_back "reset to ${PREV_COMMIT}" rollback.sh || warn "deploy event record skipped"

log "systemctl restart ${SERVICE_NAME}"
sudo systemctl restart "${SERVICE_NAME}"

log "nginx -t && reload"
if sudo nginx -t 2>/dev/null; then
  sudo systemctl reload nginx
  log "nginx reload OK"
else
  warn "nginx -t failed — fix config manually"
fi

log "health / URL verification"
VERIFY_FAIL=0
if command -v curl >/dev/null 2>&1; then
  for url in "${ROLLBACK_URLS[@]}"; do
    if curl -sf --max-time 30 "${url}" >/dev/null 2>&1; then
      log "✓ ${url}"
    else
      log "✗ ${url} — 応答失敗"
      VERIFY_FAIL=1
    fi
  done
  health_body="$(curl -sf --max-time 15 "${PUBLIC_BASE}/api/health" 2>/dev/null || echo '{}')"
  log "health response: ${health_body:0:120}"
else
  warn "curl not found — skip URL verification"
fi

log "rollback complete → ${PREV_COMMIT}"
log "ブラウザ確認: ${PUBLIC_BASE}/deployment/checklist"

if [ "${VERIFY_FAIL}" -ne 0 ]; then
  warn "一部 URL が応答しません。journalctl -u ${SERVICE_NAME} -n 50 を確認"
  exit 1
fi

exit 0
