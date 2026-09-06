#!/usr/bin/env bash
# Create App Store–signed IPA at ios/App/build/TiSLY.ipa via xcodebuild -exportArchive.
# Payload-zip fallback is DISABLED — it omits a valid embedded.mobileprovision (ITMS-90174).
# Usage: ios-make-ipa.sh <ios/App dir>
# Requires env: AUTH_KEY_PATH, APP_STORE_KEY_ID, APP_STORE_ISSUER_ID, APPLE_TEAM_ID
set -euo pipefail

APP_DIR="${1:?ios/App dir required}"
ARCHIVE_PATH="${APP_DIR}/build/TiSLY.xcarchive"
EXPORT_DIR="${APP_DIR}/build/ipa"
EXPORT_PLIST="${APP_DIR}/build/ExportOptions.plist"
LOG="${APP_DIR}/build/export.log"
OUT_IPA="${APP_DIR}/build/TiSLY.ipa"

mkdir -p "${APP_DIR}/build"
rm -rf "$EXPORT_DIR"
mkdir -p "$EXPORT_DIR"
rm -f "$OUT_IPA"

if [ ! -d "$ARCHIVE_PATH" ]; then
  echo "::error::archive missing: $ARCHIVE_PATH"
  find "${APP_DIR}/build" -maxdepth 3 -print || true
  exit 1
fi

if [ ! -f "$EXPORT_PLIST" ]; then
  echo "::error::ExportOptions.plist missing: $EXPORT_PLIST"
  exit 1
fi

if [ -z "${AUTH_KEY_PATH:-}" ] || [ ! -f "${AUTH_KEY_PATH}" ]; then
  echo "::error::AUTH_KEY_PATH missing or not a file (ASC API key required for provisioning)"
  exit 1
fi
if [ -z "${APP_STORE_KEY_ID:-}" ] || [ -z "${APP_STORE_ISSUER_ID:-}" ]; then
  echo "::error::APP_STORE_KEY_ID / APP_STORE_ISSUER_ID required"
  exit 1
fi
if [ -z "${APPLE_TEAM_ID:-}" ]; then
  echo "::error::APPLE_TEAM_ID required for Automatic Signing export"
  exit 1
fi

echo "===== archive tree (depth 5) ====="
find "$ARCHIVE_PATH" -maxdepth 5 \( -type d -o -name '*.app' -o -name 'embedded.mobileprovision' \) -print || true

APP_IN_ARCHIVE="$(find "$ARCHIVE_PATH/Products/Applications" -maxdepth 1 -name '*.app' -type d 2>/dev/null | head -n 1 || true)"
if [ -z "$APP_IN_ARCHIVE" ]; then
  APP_IN_ARCHIVE="$(find "$ARCHIVE_PATH" -name '*.app' -type d 2>/dev/null | head -n 1 || true)"
fi
if [ -z "$APP_IN_ARCHIVE" ]; then
  echo "::error::archive 内に .app がありません"
  exit 1
fi
echo "Found app: $APP_IN_ARCHIVE"

PROV_IN_ARCHIVE="${APP_IN_ARCHIVE}/embedded.mobileprovision"
if [ ! -f "$PROV_IN_ARCHIVE" ]; then
  echo "::warning::archive .app に embedded.mobileprovision がありません — exportArchive で Distribution プロファイルを埋め込みます"
else
  echo "Archive already has embedded.mobileprovision ($(wc -c < "$PROV_IN_ARCHIVE" | tr -d ' ') bytes)"
fi

echo "===== ExportOptions.plist ====="
plutil -p "$EXPORT_PLIST" || cat "$EXPORT_PLIST"

echo "===== xcodebuild -exportArchive (Automatic Signing + ASC API key) ====="
set +e
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_DIR" \
  -exportOptionsPlist "$EXPORT_PLIST" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$AUTH_KEY_PATH" \
  -authenticationKeyID "$APP_STORE_KEY_ID" \
  -authenticationKeyIssuerID "$APP_STORE_ISSUER_ID" \
  2>&1 | tee "$LOG"
EXPORT_STATUS=${PIPESTATUS[0]}
set -e

if [ "$EXPORT_STATUS" -ne 0 ]; then
  echo "::error::exportArchive failed exit=${EXPORT_STATUS} (ITMS-90174 回避のため Payload zip フォールバックは行いません)"
  grep -E 'error:|Error |provision|Provisioning|Signing|IDEDistribution|TEAM' "$LOG" | tail -n 80 || true
  exit "$EXPORT_STATUS"
fi

IPA="$(find "$EXPORT_DIR" -type f -name '*.ipa' 2>/dev/null | head -n 1 || true)"
if [ -z "$IPA" ]; then
  echo "::error::exportArchive は成功したが .ipa がありません: $EXPORT_DIR"
  ls -laR "$EXPORT_DIR" || true
  exit 1
fi

cp -f "$IPA" "$OUT_IPA"
echo "Copied signed IPA -> $OUT_IPA"

# --- Require embedded.mobileprovision (fixes / detects ITMS-90174) ---
STAGE="${APP_DIR}/build/ipa-verify"
rm -rf "$STAGE"
mkdir -p "$STAGE"
/usr/bin/unzip -q "$OUT_IPA" -d "$STAGE"
APP_IN_IPA="$(find "$STAGE/Payload" -maxdepth 1 -name '*.app' -type d | head -n 1 || true)"
if [ -z "$APP_IN_IPA" ]; then
  echo "::error::IPA 内に Payload/*.app がありません"
  /usr/bin/unzip -l "$OUT_IPA" | head -n 40 || true
  exit 1
fi

PROV="${APP_IN_IPA}/embedded.mobileprovision"
if [ ! -f "$PROV" ]; then
  echo "::error::ITMS-90174: IPA に embedded.mobileprovision がありません ($PROV)"
  echo "Signing & Capabilities / exportArchive Automatic Signing を確認してください。"
  find "$APP_IN_IPA" -maxdepth 2 -print || true
  exit 1
fi

echo "embedded.mobileprovision OK ($(wc -c < "$PROV" | tr -d ' ') bytes)"
security cms -D -i "$PROV" 2>/dev/null | plutil -p - 2>/dev/null | head -n 40 || true

# codesign presence check
codesign -dv --verbose=2 "$APP_IN_IPA" 2>&1 | tee "${APP_DIR}/build/codesign-verify.log" | head -n 40 || true
if ! codesign -dv "$APP_IN_IPA" 2>&1 | grep -qi 'Authority\|Signature='; then
  echo "::warning::codesign -dv で署名詳細を確認できませんでした（ログ参照）"
fi

ls -lh "$OUT_IPA"
echo "OK signed IPA $OUT_IPA ($(wc -c < "$OUT_IPA" | tr -d ' ') bytes) with embedded.mobileprovision"
