#!/usr/bin/env bash
# Phase 1881–1920 — VPS Launch Gap Fix & Real Production Start
# 使い方: cd /opt/tisly && bash scripts/vps-production-start.sh
# 前提: /opt/tisly に clone 済み · git pull 済み · root で実行
set -euo pipefail

REPO_ROOT="${TISLY_REPO_ROOT:-/opt/tisly}"
SERVER_DIR="${REPO_ROOT}/server"
ENV_FILE="${SERVER_DIR}/.env"
ENV_TEMPLATE="${SERVER_DIR}/.env.production.example"
SERVICE_NAME="${TISLY_SERVICE:-tisly-server}"
PORT="${TISLY_PORT:-3080}"
NGINX_AVAILABLE="/etc/nginx/sites-available/tisly.jp"
NGINX_ENABLED="/etc/nginx/sites-enabled/tisly.jp"
SYSTEMD_UNIT="/etc/systemd/system/${SERVICE_NAME}.service"
SYSTEMD_SRC="${SERVER_DIR}/deploy/systemd/${SERVICE_NAME}.service"
NGINX_SRC="${SERVER_DIR}/deploy/nginx/tisly.jp.conf"

log() { echo "[TiSLY start] $(date -Iseconds) $*"; }
fail() { echo "[TiSLY start] ERROR: $*" >&2; exit 1; }

check_env_key() {
  local key="$1"
  local val
  val="$(grep -E "^${key}=" "${ENV_FILE}" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  if [ -z "${val}" ]; then
    echo "${key}"
  fi
}

log "=== VPS 本番起動 Phase 1881–1920 ==="
log "REPO_ROOT=${REPO_ROOT}"

[ -d "${SERVER_DIR}" ] || fail "server ディレクトリなし: ${SERVER_DIR}"
[ -f "${SYSTEMD_SRC}" ] || fail "systemd ユニットなし: ${SYSTEMD_SRC}"
[ -f "${NGINX_SRC}" ] || fail "nginx conf なし: ${NGINX_SRC}"

cd "${SERVER_DIR}"
log "cd ${SERVER_DIR}"

# --- .env ---
if [ ! -f "${ENV_FILE}" ]; then
  log ".env なし — テンプレートから作成"
  [ -f "${ENV_TEMPLATE}" ] || fail "テンプレートなし: ${ENV_TEMPLATE}"
  cp "${ENV_TEMPLATE}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  fail ".env を作成しました。docs/env_fill_in_guide.md を見ながら必須項目を埋めてから再実行してください"
fi
log ".env 存在: ${ENV_FILE}"

MISSING_KEYS=()
for key in JWT_SECRET ADMIN_PASSWORD_HASH INGEST_SECRET DEPLOY_OPS_TOKEN NODE_ENV TISLY_PUBLIC_URL; do
  m="$(check_env_key "${key}")"
  [ -n "${m}" ] && MISSING_KEYS+=("${m}")
done
if [ "${#MISSING_KEYS[@]}" -gt 0 ]; then
  echo ""
  echo "✋ .env 不足項目（値は表示しません）:"
  for key in "${MISSING_KEYS[@]}"; do
    echo "  · ${key}"
  done
  echo "  → docs/env_fill_in_guide.md を参照して埋めてから再実行"
  exit 1
fi
log ".env 必須キー: OK"

log "npm ci"
npm ci

log "npm run build"
npm run build
[ -f dist/index.js ] || fail "dist/index.js なし — build 失敗"

log "npm run release:gate"
npm run release:gate

log "npm run db:init"
npm run db:init

if id tisly >/dev/null 2>&1; then
  chown -R tisly:tisly "${REPO_ROOT}" 2>/dev/null || log "chown スキップ（手動: chown -R tisly:tisly /opt/tisly）"
fi

log "systemd 配置: ${SYSTEMD_UNIT}"
cp "${SYSTEMD_SRC}" "${SYSTEMD_UNIT}"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

status="$(systemctl is-active "${SERVICE_NAME}" 2>/dev/null || echo inactive)"
[ "${status}" = "active" ] || fail "${SERVICE_NAME} が active ではありません — journalctl -u ${SERVICE_NAME} -n 50"

log "${SERVICE_NAME}: active (running)"

if command -v nginx >/dev/null 2>&1; then
  log "nginx 配置: ${NGINX_AVAILABLE}"
  cp "${NGINX_SRC}" "${NGINX_AVAILABLE}"
  ln -sf "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  nginx -t
  systemctl reload nginx
  log "nginx reload OK"
else
  fail "nginx 未インストール — apt install -y nginx を実行してから再実行"
fi

log "curl http://127.0.0.1:${PORT}/api/health"
if command -v curl >/dev/null 2>&1; then
  curl -sf --max-time 15 "http://127.0.0.1:${PORT}/api/health" || fail "localhost /api/health 失敗"
  echo ""
  log "localhost /api/health: OK"

  log "curl -I http://tisly.jp/app"
  curl -sI --max-time 30 "http://tisly.jp/app" | head -15 || fail "http://tisly.jp/app 応答なし"
else
  fail "curl 未インストール — apt install -y curl"
fi

log "=== 本番起動完了 ==="
log "確認 URL: https://tisly.jp/app"
log "ログ: journalctl -u ${SERVICE_NAME} -f"
