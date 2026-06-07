#!/usr/bin/env bash
# Phase 1541–1580 — VPS 初回投入チェック CLI（色付き・次アクション表示）
# 使い方: bash scripts/vps-first-deploy-check.sh
# 配置先: /opt/tisly/scripts/vps-first-deploy-check.sh
set -euo pipefail

REPO_ROOT="${TISLY_REPO_ROOT:-/opt/tisly}"
SERVER_DIR="${REPO_ROOT}/server"
ENV_FILE="${SERVER_DIR}/.env"
SERVICE_NAME="${TISLY_SERVICE:-tisly-server}"
PORT="${TISLY_PORT:-3080}"
PUBLIC_BASE="${TISLY_PUBLIC_URL:-https://tisly.jp}"
NGINX_CONF="${NGINX_SITE_CONF:-/etc/nginx/sites-enabled/tisly.jp}"
NGINX_TEMPLATE="${SERVER_DIR}/deploy/nginx/tisly.jp.conf"
SYSTEMD_UNIT="/etc/systemd/system/${SERVICE_NAME}.service"

PASS=0
WARN=0
FAIL=0

MISSING_ENV_KEYS=()
MISSING_TOOLS=()
FIX_ACTIONS=()

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_GREEN='\033[0;32m'
  C_RED='\033[0;31m'
  C_YELLOW='\033[0;33m'
  C_BOLD='\033[1m'
  C_RESET='\033[0m'
else
  C_GREEN='' C_RED='' C_YELLOW='' C_BOLD='' C_RESET=''
fi

add_fix() {
  local action="$1"
  for existing in "${FIX_ACTIONS[@]:-}"; do
    [ "${existing}" = "${action}" ] && return
  done
  FIX_ACTIONS+=("${action}")
}

log_pass() { echo -e "  ${C_GREEN}✓${C_RESET} $*"; PASS=$((PASS + 1)); }
log_warn() { echo -e "  ${C_YELLOW}⚠${C_RESET} $*"; WARN=$((WARN + 1)); }
log_fail() {
  echo -e "  ${C_RED}✗${C_RESET} $*"
  FAIL=$((FAIL + 1))
}

section() { echo ""; echo -e "${C_BOLD}=== $* ===${C_RESET}"; }

check_cmd() {
  local name="$1"
  local fix_hint="${2:-apt install -y ${name}}"
  if command -v "$name" >/dev/null 2>&1; then
    local ver
    ver="$("$name" --version 2>/dev/null | head -1 || "$name" -v 2>/dev/null | head -1 || echo "ok")"
    log_pass "${name}: ${ver}"
  else
    log_fail "${name}: 未インストール"
    MISSING_TOOLS+=("${name}")
    add_fix "${fix_hint}"
  fi
}

check_env_key() {
  local key="$1"
  local required="${2:-1}"
  local fix_hint="${3:-nano ${ENV_FILE} で ${key} を設定（docs/env_fill_in_guide.md 参照）}"
  if [ ! -f "${ENV_FILE}" ]; then
    return
  fi
  local val
  val="$(grep -E "^${key}=" "${ENV_FILE}" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  if [ -z "${val}" ]; then
    if [ "${required}" = "1" ]; then
      log_fail ".env: ${key} 未設定"
      MISSING_ENV_KEYS+=("${key}")
      add_fix "${fix_hint}"
    else
      log_warn ".env: ${key} 未設定（任意）"
    fi
  else
    case "${key}" in
      JWT_SECRET|ADMIN_PASSWORD_HASH|INGEST_SECRET|DEPLOY_OPS_TOKEN|MQTT_PASSWORD)
        log_pass ".env: ${key} 設定済み（値は表示しません）"
        ;;
      *)
        log_pass ".env: ${key}=${val}"
        ;;
    esac
  fi
}

echo -e "${C_BOLD}[TiSLY] VPS 初回投入チェック${C_RESET} — $(date -Iseconds)"
echo "REPO_ROOT=${REPO_ROOT}"

section "1. システムコマンド"
check_cmd node "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs"
check_cmd npm "apt install -y nodejs"
check_cmd git "apt install -y git"
check_cmd nginx "apt install -y nginx"
check_cmd certbot "apt install -y certbot python3-certbot-nginx"
if command -v systemctl >/dev/null 2>&1; then
  log_pass "systemctl: $(systemctl --version 2>/dev/null | head -1 || echo ok)"
else
  log_fail "systemctl: 未インストール"
  MISSING_TOOLS+=("systemctl")
  add_fix "systemd が有効な Linux VPS を使用してください"
fi

section "2. 配置ディレクトリ"
if [ -d "${REPO_ROOT}" ]; then
  log_pass "リポジトリ: ${REPO_ROOT}"
else
  log_fail "リポジトリなし: ${REPO_ROOT}"
  add_fix "sudo -u tisly git clone <リポジトリURL> ${REPO_ROOT}"
fi
if [ -d "${SERVER_DIR}" ]; then
  log_pass "server: ${SERVER_DIR}"
else
  log_fail "server ディレクトリなし: ${SERVER_DIR}"
  add_fix "git clone が正しいか確認してください"
fi
if [ -d "${SERVER_DIR}/public" ]; then
  log_pass "server/public: フロント内包 OK（ルート web/ 不要）"
else
  log_fail "server/public なし: ${SERVER_DIR}/public"
  add_fix "git pull で server/public を取得（ルート web/ は不要）"
fi
if [ -f "${SERVER_DIR}/.env.production.example" ]; then
  log_pass "server/.env.production.example あり"
else
  log_fail "server/.env.production.example なし"
  add_fix "git pull で server/.env.production.example を取得"
fi
if [ -d "${REPO_ROOT}/.github/workflows" ]; then
  log_pass ".github/workflows あり"
else
  log_warn ".github/workflows なし — CI 未設定"
fi

section "3. .env"
if [ -f "${ENV_FILE}" ]; then
  log_pass ".env 存在: ${ENV_FILE}"
  check_env_key "NODE_ENV"
  check_env_key "JWT_SECRET" 1 "openssl rand -base64 48 で生成 → docs/env_fill_in_guide.md"
  check_env_key "ADMIN_PASSWORD_HASH" 1 "npm run hash:admin-password で生成（scrypt:... 形式）→ docs/admin-password-recovery.md"
  admin_hash_val="$(grep -E '^ADMIN_PASSWORD_HASH=' "${ENV_FILE}" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)"
  if [ -n "${admin_hash_val}" ]; then
    if [ "${admin_hash_val}" = "temp" ] || [[ ! "${admin_hash_val}" =~ ^scrypt: ]]; then
      log_fail ".env: ADMIN_PASSWORD_HASH が平文または temp（ログイン不可）"
      add_fix "docs/admin-password-recovery.md — npm run hash:admin-password で scrypt 形式を生成"
    else
      log_pass ".env: ADMIN_PASSWORD_HASH scrypt 形式 OK"
    fi
  fi
  check_env_key "INGEST_SECRET" 1 "openssl rand -base64 48 で生成"
  check_env_key "TISLY_PUBLIC_URL"
  check_env_key "DEPLOY_OPS_TOKEN" 1 "openssl rand -hex 32 で生成"
  check_env_key "MQTT_MODE"
  check_env_key "MQTT_URL" 0
  check_env_key "MQTT_SUBSCRIBER_ENABLED" 0
  check_env_key "SHELLY_MODE"
  check_env_key "QNAP_UPLOAD_MODE"
  check_env_key "GOOGLE_OAUTH_ENABLED"
  check_env_key "GMAIL_SEND_MODE"
  check_env_key "DEMO_RESET_ENABLED"
  if grep -qE '^DEMO_RESET_ENABLED=true' "${ENV_FILE}" 2>/dev/null; then
    log_warn "DEMO_RESET_ENABLED=true — 本番では false 推奨"
    add_fix "nano ${ENV_FILE} で DEMO_RESET_ENABLED=false に変更"
  fi
else
  log_fail ".env なし: ${ENV_FILE}"
  add_fix "cp ${SERVER_DIR}/.env.production.example ${ENV_FILE} && chmod 600 ${ENV_FILE}"
  add_fix "docs/env_fill_in_guide.md を見ながら .env を埋める"
fi

if [ "${#MISSING_ENV_KEYS[@]}" -gt 0 ]; then
  echo ""
  echo -e "${C_RED}${C_BOLD}.env 不足項目:${C_RESET}"
  for key in "${MISSING_ENV_KEYS[@]}"; do
    echo -e "  ${C_RED}· ${key}${C_RESET}"
  done
fi

section "4. npm ci / build"
if [ -d "${SERVER_DIR}/node_modules" ]; then
  log_pass "node_modules 存在"
else
  log_fail "node_modules なし"
  add_fix "cd ${SERVER_DIR} && npm ci"
fi
if [ -f "${SERVER_DIR}/dist/index.js" ]; then
  log_pass "build 成果物: dist/index.js"
else
  log_fail "dist/index.js なし"
  add_fix "cd ${SERVER_DIR} && npm run build"
fi

section "5. nginx"
if [ -f "${NGINX_TEMPLATE}" ]; then
  log_pass "テンプレート: deploy/nginx/tisly.jp.conf"
  for needle in "return 301 https" "location /api/" "location /ws" "gzip on" "X-Frame-Options"; do
    if grep -q "${needle}" "${NGINX_TEMPLATE}" 2>/dev/null; then
      log_pass "テンプレート: ${needle}"
    else
      log_fail "テンプレート不足: ${needle}"
    fi
  done
else
  log_fail "nginx テンプレートなし"
fi
if [ -f "${NGINX_CONF}" ]; then
  log_pass "nginx サイト設定: ${NGINX_CONF}"
  if sudo nginx -t 2>/dev/null; then
    log_pass "nginx -t OK"
  else
    log_fail "nginx -t 失敗"
    add_fix "sudo nginx -t でエラー行を確認し ${NGINX_CONF} を修正"
  fi
else
  log_warn "nginx サイト未配置: ${NGINX_CONF}"
  add_fix "sudo cp ${NGINX_TEMPLATE} /etc/nginx/sites-available/tisly.jp && sudo ln -sf /etc/nginx/sites-available/tisly.jp /etc/nginx/sites-enabled/"
fi

section "6. systemd"
if [ -f "${SYSTEMD_UNIT}" ] || [ -f "${SERVER_DIR}/deploy/systemd/${SERVICE_NAME}.service" ]; then
  log_pass "systemd ユニット定義あり"
else
  log_warn "systemd ユニット未インストール"
  add_fix "sudo cp ${SERVER_DIR}/deploy/systemd/${SERVICE_NAME}.service ${SYSTEMD_UNIT} && sudo systemctl daemon-reload && sudo systemctl enable ${SERVICE_NAME}"
fi
if command -v systemctl >/dev/null 2>&1; then
  status="$(systemctl is-active "${SERVICE_NAME}" 2>/dev/null || echo inactive)"
  if [ "${status}" = "active" ]; then
    log_pass "${SERVICE_NAME}: active"
  else
    log_fail "${SERVICE_NAME}: ${status}"
    add_fix "sudo systemctl start ${SERVICE_NAME} && journalctl -u ${SERVICE_NAME} -n 50"
  fi
fi

section "7. ポート ${PORT}"
if command -v ss >/dev/null 2>&1; then
  if ss -tlnp 2>/dev/null | grep -q ":${PORT} "; then
    log_pass "port ${PORT} LISTEN"
  else
    log_fail "port ${PORT} 未 LISTEN"
    add_fix "sudo systemctl start ${SERVICE_NAME}"
  fi
elif command -v netstat >/dev/null 2>&1; then
  if netstat -tlnp 2>/dev/null | grep -q ":${PORT} "; then
    log_pass "port ${PORT} LISTEN"
  else
    log_fail "port ${PORT} 未 LISTEN"
    add_fix "sudo systemctl start ${SERVICE_NAME}"
  fi
else
  log_warn "ss/netstat なし — ポート確認スキップ"
fi

section "8. HTTPS 応答"
health_url="${PUBLIC_BASE}/api/health"
app_url="${PUBLIC_BASE}/app"
if command -v curl >/dev/null 2>&1; then
  if curl -sf --max-time 15 "${health_url}" >/dev/null 2>&1; then
    log_pass "GET ${health_url}"
  else
    log_fail "GET ${health_url} — 応答なしまたはエラー"
    add_fix "certbot --nginx -d tisly.jp && sudo systemctl restart ${SERVICE_NAME}"
  fi
  code="$(curl -sI --max-time 15 "${app_url}" 2>/dev/null | head -1 | awk '{print $2}' || echo 000)"
  if [ "${code}" = "200" ] || [ "${code}" = "301" ] || [ "${code}" = "302" ]; then
    log_pass "GET ${app_url} — HTTP ${code}"
  else
    log_fail "GET ${app_url} — HTTP ${code}"
    add_fix "nginx と ${SERVICE_NAME} のログを確認"
  fi
else
  log_warn "curl なし — HTTPS 確認スキップ"
  MISSING_TOOLS+=("curl")
  add_fix "apt install -y curl"
fi

if [ "${#MISSING_TOOLS[@]}" -gt 0 ]; then
  echo ""
  echo -e "${C_YELLOW}${C_BOLD}不足ツール:${C_RESET}"
  for tool in "${MISSING_TOOLS[@]}"; do
    echo -e "  ${C_YELLOW}· ${tool}${C_RESET}"
  done
fi

section "次にやること"
if [ "${#FIX_ACTIONS[@]}" -gt 0 ]; then
  local_i=1
  for action in "${FIX_ACTIONS[@]}"; do
    echo -e "  ${C_YELLOW}${local_i}.${C_RESET} ${action}"
    local_i=$((local_i + 1))
  done
else
  echo -e "  ${C_GREEN}追加作業なし — デプロイ可能です${C_RESET}"
fi

section "結果"
echo "PASS=${PASS}  WARN=${WARN}  FAIL=${FAIL}"
echo ""
if [ "${FAIL}" -gt 0 ]; then
  echo -e "${C_RED}${C_BOLD}"
  echo "  ╔══════════════════════════════════════╗"
  echo "  ║           NOT READY                  ║"
  echo "  ╚══════════════════════════════════════╝"
  echo -e "${C_RESET}"
  echo "上記 ✗ と「次にやること」を解消してから scripts/vps-deploy-one-command.sh を実行"
  exit 1
fi
if [ "${WARN}" -gt 0 ]; then
  echo -e "${C_YELLOW}${C_BOLD}"
  echo "  ╔══════════════════════════════════════╗"
  echo "  ║      READY WITH WARNINGS             ║"
  echo "  ╚══════════════════════════════════════╝"
  echo -e "${C_RESET}"
  echo "警告を確認のうえ投入可"
  exit 0
fi
echo -e "${C_GREEN}${C_BOLD}"
echo "  ╔══════════════════════════════════════╗"
echo "  ║        READY FOR DEPLOY              ║"
echo "  ╚══════════════════════════════════════╝"
echo -e "${C_RESET}"
exit 0
