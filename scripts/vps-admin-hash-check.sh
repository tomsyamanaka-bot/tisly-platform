#!/usr/bin/env bash
set -euo pipefail
pid="$(systemctl show tisly-server -p MainPID --value)"
echo "PID=$pid"
env_hash="$(tr '\0' '\n' < "/proc/$pid/environ" | grep '^ADMIN_PASSWORD_HASH=' | cut -d= -f2- || true)"
file_hash="$(grep '^ADMIN_PASSWORD_HASH=' /opt/tisly/server/.env | head -1 | cut -d= -f2- || true)"
echo "ENV_LEN=${#env_hash}"
echo "FILE_LEN=${#file_hash}"
echo "ENV_PREFIX=${env_hash:0:50}"
echo "FILE_PREFIX=${file_hash:0:50}"
echo "ENV_SUFFIX=${env_hash: -20}"
echo "FILE_SUFFIX=${file_hash: -20}"
if [ "$env_hash" = "$file_hash" ]; then
  echo "MATCH=yes"
else
  echo "MATCH=no"
fi
echo "HASH_LINES=$(grep -c '^ADMIN_PASSWORD_HASH=' /opt/tisly/server/.env || true)"
echo "ADMIN_USERNAME=$(tr '\0' '\n' < "/proc/$pid/environ" | grep '^ADMIN_USERNAME=' | cut -d= -f2- || true)"
echo "REQUIRE_2FA=$(tr '\0' '\n' < "/proc/$pid/environ" | grep '^REQUIRE_2FA=' | cut -d= -f2- || true)"
hex_ok() {
  local v="$1"
  [[ "$v" =~ ^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$ ]]
}
if hex_ok "$env_hash"; then
  echo "ENV_FORMAT=valid_scrypt"
else
  echo "ENV_FORMAT=invalid"
fi
if hex_ok "$file_hash"; then
  echo "FILE_FORMAT=valid_scrypt"
else
  echo "FILE_FORMAT=invalid"
fi
IFS=: read -r part0 part1 part2 <<< "$env_hash"
echo "SALT_LEN=${#part1}"
echo "HASH_LEN=${#part2}"
echo "EXPECTED_HASH_LEN=128"
echo "EXPECTED_TOTAL_LEN=168"
invalid_chars="$(printf '%s' "$part1$part2" | tr -cd '0-9a-f' | wc -c)"
total_hex_len="$(printf '%s' "$part1$part2" | wc -c)"
echo "NON_HEX_IN_SALTHASH=$((total_hex_len - invalid_chars))"

# Raw line diagnostics (no secret dump)
line="$(grep '^ADMIN_PASSWORD_HASH=' /opt/tisly/server/.env | head -1)"
echo "RAW_LINE_LEN=${#line}"
printf '%s' "$line" | tail -c 30 | od -An -tx1 | head -3

# Node verifyPassword against file hash (password arg optional 2nd param)
cd /opt/tisly/server
if [ -n "${1:-}" ]; then
  node --input-type=module -e "
import { verifyPassword } from './dist/auth/password.js';
const hash = process.env.ADMIN_PASSWORD_HASH || '$file_hash';
const ok = verifyPassword('$1', hash);
console.log('VERIFY_PASSWORD=' + (ok ? 'ok' : 'fail'));
"
fi
