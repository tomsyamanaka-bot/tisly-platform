#!/usr/bin/env bash
# 本番 502 Bad Gateway 緊急復旧（ConoHa VPS）
# 用法: bash /opt/tisly/scripts/vps-recover-502.sh
set -euo pipefail

REPO_ROOT="${TISLY_REPO_ROOT:-/opt/tisly}"
SERVICE_NAME="${TISLY_SERVICE:-tisly-server}"
HEALTH_LOCAL="http://127.0.0.1:3080/api/health"
HEALTH_PUBLIC="${TISLY_HEALTH_URL:-https://tisly.jp/api/health}"

log() { echo "[TiSLY recover-502] $(date -Iseconds) $*"; }
fail() { log "ERROR: $*"; exit 1; }

cd "${REPO_ROOT}"

log "systemctl status (before)"
systemctl is-active "${SERVICE_NAME}" || true
systemctl status "${SERVICE_NAME}" --no-pager -l | head -25 || true

log "ensure dist/index.js exists"
[ -f "${REPO_ROOT}/server/dist/index.js" ] || fail "dist/index.js missing — run deploy-vps.sh"

log "apply systemd unit"
UNIT_SRC="${REPO_ROOT}/server/deploy/systemd/tisly-server.service"
if [ -f "${UNIT_SRC}" ]; then
  cp "${UNIT_SRC}" /etc/systemd/system/tisly-server.service
  systemctl daemon-reload
fi

log "apply nginx retry conf"
NGINX_SRC="${REPO_ROOT}/server/deploy/nginx/tisly.jp.conf"
if [ -f "${NGINX_SRC}" ]; then
  cp "${NGINX_SRC}" /etc/nginx/sites-available/tisly.jp
  ln -sf /etc/nginx/sites-available/tisly.jp /etc/nginx/sites-enabled/tisly.jp
  nginx -t
  systemctl reload nginx
fi

log "restart ${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

LOCAL_OK=false
for attempt in $(seq 1 60); do
  if curl -sf --max-time 3 "${HEALTH_LOCAL}" | grep -q commitShort; then
    LOCAL_OK=true
    log "localhost health OK (${attempt})"
    break
  fi
  log "localhost wait (${attempt}/60)..."
  sleep 1
done
[ "${LOCAL_OK}" = "true" ] || fail "localhost health failed"

PUBLIC_BODY="$(curl -sf --max-time 15 "${HEALTH_PUBLIC}" || true)"
echo "${PUBLIC_BODY}" | grep -q commitShort || fail "public health failed"
echo "${PUBLIC_BODY}" | grep commitShort

log "RECOVER OK — ${HEALTH_PUBLIC}"
