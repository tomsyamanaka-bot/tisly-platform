#!/usr/bin/env bash
# Phase 1841–1880 — VPS 本番プロセス起動（systemd 推奨 · PM2 は使わない）
# 使い方: bash scripts/vps-production-start.sh
# 前提: /opt/tisly に clone 済み · VNC コンソールから root で実行
set -euo pipefail

REPO_ROOT="${TISLY_REPO_ROOT:-/opt/tisly}"
SERVER_DIR="${REPO_ROOT}/server"
ENV_FILE="${SERVER_DIR}/.env"
ENV_TEMPLATE="${SERVER_DIR}/.env.production.example"
SERVICE_NAME="${TISLY_SERVICE:-tisly-server}"
PORT="${TISLY_PORT:-3080}"
PUBLIC_BASE="${TISLY_PUBLIC_URL:-https://tisly.jp}"
NGINX_AVAILABLE="/etc/nginx/sites-available/tisly.jp"
NGINX_ENABLED="/etc/nginx/sites-enabled/tisly.jp"
SYSTEMD_UNIT="/etc/systemd/system/${SERVICE_NAME}.service"

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

log "=== VPS 本番起動 Phase 1841–1880 ==="
log "REPO_ROOT=${REPO_ROOT}"
log "起動方式: systemd（公式）— PM2 は使用しません"

[ -d "${SERVER_DIR}" ] || fail "server ディレクトリなし: ${SERVER_DIR}"

cd "${SERVER_DIR}"

# --- .env ---
if [ ! -f "${ENV_FILE}" ]; then
  log ".env なし — テンプレートから作成"
  [ -f "${ENV_TEMPLATE}" ] || fail "テンプレートなし: ${ENV_TEMPLATE}（正式版は server/.env.production.example）"
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
log ".env 必須キー: OK（秘密値は表示しません）"

# --- ビルドパイプライン ---
log "npm ci"
npm ci

log "npm run build"
npm run build
[ -f dist/index.js ] || fail "dist/index.js なし — build 失敗"

log "npm run release:gate"
npm run release:gate

log "npm run db:init"
npm run db:init

# --- 所有者（systemd User=tisly） ---
if id tisly >/dev/null 2>&1; then
  chown -R tisly:tisly "${REPO_ROOT}" 2>/dev/null || log "chown スキップ（権限不足の場合は手動で chown -R tisly:tisly /opt/tisly）"
fi

# --- systemd（公式起動方式） ---
log "systemd 登録: ${SERVICE_NAME}"
cp "${SERVER_DIR}/deploy/systemd/${SERVICE_NAME}.service" "${SYSTEMD_UNIT}"
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"
systemctl restart "${SERVICE_NAME}"

status="$(systemctl is-active "${SERVICE_NAME}" 2>/dev/null || echo inactive)"
[ "${status}" = "active" ] || fail "${SERVICE_NAME} が active ではありません — journalctl -u ${SERVICE_NAME} -n 50 を確認"

log "${SERVICE_NAME}: active (running)"

# --- nginx ---
if command -v nginx >/dev/null 2>&1; then
  log "nginx 反映"
  cp "${SERVER_DIR}/deploy/nginx/tisly.jp.conf" "${NGINX_AVAILABLE}"
  ln -sf "${NGINX_AVAILABLE}" "${NGINX_ENABLED}"
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  nginx -t
  systemctl reload nginx
  log "nginx reload OK"
else
  log "nginx 未インストール — apt install -y nginx を実行後、再度 nginx ブロックを手動実行"
fi

# --- localhost health ---
log "localhost health 確認 (port ${PORT})"
if command -v curl >/dev/null 2>&1; then
  curl -sf --max-time 15 "http://127.0.0.1:${PORT}/api/health" | head -c 200 || fail "localhost /api/health 失敗"
  echo ""
  log "localhost /api/health: OK"
else
  log "curl なし — localhost 確認スキップ"
fi

# --- 公開 URL 確認 ---
if command -v curl >/dev/null 2>&1; then
  log "公開 URL 確認"
  VERIFY_FAIL=0
  for path in /api/health /app /survey /business /sales /deployment/checklist; do
    if curl -sf --max-time 30 "${PUBLIC_BASE}${path}" >/dev/null 2>&1; then
      log "✓ ${PUBLIC_BASE}${path}"
    else
      log "✗ ${PUBLIC_BASE}${path} — 応答失敗（SSL 未設定の場合は certbot を先に実行）"
      VERIFY_FAIL=1
    fi
  done
  if [ "${VERIFY_FAIL}" -ne 0 ]; then
    log "一部 HTTPS URL が未応答 — certbot --nginx -d tisly.jp が未実施の可能性"
    log "systemd は起動済み。SSL 後に https://tisly.jp/app をブラウザ確認"
  fi
fi

log "=== 本番起動完了 ==="
log "確認 URL: ${PUBLIC_BASE}/app"
log "チェックリスト: ${PUBLIC_BASE}/deployment/checklist"
log "ログ: journalctl -u ${SERVICE_NAME} -f"
