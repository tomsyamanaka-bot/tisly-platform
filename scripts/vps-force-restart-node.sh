#!/usr/bin/env bash
# VPS の Node を強制再起動する
# systemd が主。pm2 と :3080 残留も落とす。
set -euo pipefail

SERVICE_NAME="${TISLY_SERVICE:-tisly-server}"
PORT="${TISLY_PORT:-3080}"
PROBE_TESTER_LOGIN="${PROBE_TESTER_LOGIN:-1}"

run_root() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo -n "$@"
  fi
}

echo "=== force-restart Node (systemd + pm2 + :${PORT}) ==="
echo "service=${SERVICE_NAME} user=$(whoami)"

echo "=== systemctl stop ${SERVICE_NAME} ==="
run_root systemctl stop "${SERVICE_NAME}" || true

if command -v pm2 >/dev/null 2>&1; then
  echo "=== pm2 restart all (flush stale Node memory) ==="
  pm2 restart all || true
  echo "=== pm2 stop all so systemd owns :${PORT} ==="
  pm2 stop all || true
  pm2 save || true
else
  echo "pm2 not installed — systemd is the process owner"
fi

echo "=== free leftover listeners on :${PORT} ==="
if command -v fuser >/dev/null 2>&1; then
  run_root fuser -k "${PORT}/tcp" || true
fi
if command -v ss >/dev/null 2>&1; then
  PIDS="$(ss -ltnp 2>/dev/null | awk -v p=":${PORT}" 'index($0, p) {print}' | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true)"
  for pid in ${PIDS}; do
    echo "killing leftover pid ${pid} on :${PORT}"
    run_root kill -9 "${pid}" || true
  done
fi
sleep 1

echo "=== systemctl start ${SERVICE_NAME} ==="
run_root systemctl start "${SERVICE_NAME}"
sleep 1
echo "=== systemctl restart ${SERVICE_NAME} ==="
run_root systemctl restart "${SERVICE_NAME}"

if command -v pm2 >/dev/null 2>&1; then
  echo "=== pm2 restart all (after systemd owns :${PORT}) ==="
  pm2 restart all || true
fi

echo "=== localhost health after force-restart ==="
LOCAL_OK=false
for attempt in $(seq 1 60); do
  if curl -sf --max-time 3 "http://127.0.0.1:${PORT}/api/health" | grep -q commitShort; then
    LOCAL_OK=true
    echo "localhost health OK (${attempt})"
    break
  fi
  echo "localhost health wait (${attempt}/60)..."
  sleep 1
done
[ "${LOCAL_OK}" = "true" ] || {
  echo "ERROR: localhost:${PORT}/api/health unreachable after force-restart"
  exit 1
}

if [ "${PROBE_TESTER_LOGIN}" = "1" ]; then
  echo "=== TESTER001 login probe (must never be Customer not found) ==="
  LOGIN_OK=false
  for attempt in $(seq 1 10); do
    LOGIN_BODY="$(curl -sS --max-time 15 -X POST \
      "http://127.0.0.1:${PORT}/api/auth/customer/login" \
      -H "Content-Type: application/json" \
      -H "Cache-Control: no-store" \
      -d '{"customerCode":"TESTER001","username":"tester.user","password":"x"}' \
      || true)"
    echo "login probe (${attempt}): $(echo "${LOGIN_BODY}" | head -c 280)"
    if echo "${LOGIN_BODY}" | grep -q "Customer not found"; then
      echo "WARN: TESTER001 still Customer not found (${attempt})"
      sleep 1
      continue
    fi
    if echo "${LOGIN_BODY}" | grep -q '"success":true' && echo "${LOGIN_BODY}" | grep -q "TESTER001"; then
      LOGIN_OK=true
      break
    fi
    sleep 1
  done
  [ "${LOGIN_OK}" = "true" ] || {
    echo "ERROR: TESTER001 login probe failed"
    exit 1
  }

  echo "=== TESTER001 alias path /api/auth/customer-login ==="
  ALIAS_BODY="$(curl -sS --max-time 15 -X POST \
    "http://127.0.0.1:${PORT}/api/auth/customer-login" \
    -H "Content-Type: application/json" \
    -d '{"customerCode":"TESTER001"}' \
    || true)"
  echo "${ALIAS_BODY}" | head -c 280
  echo "${ALIAS_BODY}" | grep -q "Customer not found" && {
    echo "ERROR: customer-login alias returned Customer not found"
    exit 1
  }
  echo "${ALIAS_BODY}" | grep -q '"success":true' || {
    echo "ERROR: customer-login alias did not return success"
    exit 1
  }
fi

echo "=== force-restart complete ==="
