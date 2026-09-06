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
  echo "::error::AUTH_KEY_PATH missing (ASC API key required for provisioning)"
  exit 1
fi
if [ -z "${APP_STORE_KEY_ID:-}" ] || [ -z "${APP_STORE_ISSUER_ID:-}" ] || [ -z "${APPLE_TEAM_ID:-}" ]; then
  echo "::error::APP_STORE_KEY_ID / APP_STORE_ISSUER_ID / APPLE_TEAM_ID required"
  exit 1
fi

echo "===== archive tree ====="
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

# Ensure ExportOptions essentials (team + automatic + local export)
/usr/libexec/PlistBuddy -c "Set :destination export" "$EXPORT_PLIST" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :destination string export" "$EXPORT_PLIST"
/usr/libexec/PlistBuddy -c "Set :signingStyle automatic" "$EXPORT_PLIST" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :signingStyle string automatic" "$EXPORT_PLIST"
/usr/libexec/PlistBuddy -c "Set :teamID ${APPLE_TEAM_ID}" "$EXPORT_PLIST" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :teamID string ${APPLE_TEAM_ID}" "$EXPORT_PLIST"
# Prefer Xcode-managed cert selection under automatic (do not force a missing identity)
/usr/libexec/PlistBuddy -c "Delete :signingCertificate" "$EXPORT_PLIST" 2>/dev/null || true

run_export() {
  local method="$1"
  echo "===== exportArchive method=${method} ====="
  /usr/libexec/PlistBuddy -c "Set :method ${method}" "$EXPORT_PLIST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :method string ${method}" "$EXPORT_PLIST"
  plutil -p "$EXPORT_PLIST"
  rm -rf "$EXPORT_DIR"
  mkdir -p "$EXPORT_DIR"
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
    2>&1 | tee -a "$LOG"
  local st=${PIPESTATUS[0]}
  set -e
  echo "exportArchive method=${method} exit=${st}"
  return "$st"
}

: > "$LOG"
EXPORT_OK=0
for METHOD in app-store-connect app-store; do
  if run_export "$METHOD"; then
    EXPORT_OK=1
    break
  fi
done

if [ "$EXPORT_OK" -ne 1 ]; then
  echo "::error::exportArchive failed for all methods (ITMS-90174 回避のため Payload zip は禁止)"
  grep -E 'error:|Error |provision|Provisioning|Signing|IDEDistribution|TEAM|certificate' "$LOG" | tail -n 100 || true
  exit 1
fi

IPA="$(find "$EXPORT_DIR" -type f -name '*.ipa' 2>/dev/null | head -n 1 || true)"
if [ -z "$IPA" ]; then
  echo "::error::exportArchive 成功だが .ipa なし: $EXPORT_DIR"
  ls -laR "$EXPORT_DIR" || true
  exit 1
fi
cp -f "$IPA" "$OUT_IPA"
echo "Copied signed IPA -> $OUT_IPA"

STAGE="${APP_DIR}/build/ipa-verify"
rm -rf "$STAGE"
mkdir -p "$STAGE"
/usr/bin/unzip -q "$OUT_IPA" -d "$STAGE"
APP_IN_IPA="$(find "$STAGE/Payload" -maxdepth 1 -name '*.app' -type d | head -n 1 || true)"
if [ -z "$APP_IN_IPA" ]; then
  echo "::error::IPA 内に Payload/*.app がありません"
  exit 1
fi

PROV="${APP_IN_IPA}/embedded.mobileprovision"
if [ ! -f "$PROV" ]; then
  echo "::error::ITMS-90174: IPA に embedded.mobileprovision がありません"
  find "$APP_IN_IPA" -maxdepth 2 -print || true
  exit 1
fi
echo "embedded.mobileprovision OK ($(wc -c < "$PROV" | tr -d ' ') bytes)"
security cms -D -i "$PROV" 2>/dev/null | plutil -extract Name raw -o - - 2>/dev/null || true
security cms -D -i "$PROV" 2>/dev/null | plutil -extract Entitlements xml1 -o - - 2>/dev/null | head -n 40 || true
codesign -dv --verbose=2 "$APP_IN_IPA" 2>&1 | tee "${APP_DIR}/build/codesign-verify.log" | head -n 40 || true

ls -lh "$OUT_IPA"
echo "OK signed IPA $OUT_IPA ($(wc -c < "$OUT_IPA" | tr -d ' ') bytes) with embedded.mobileprovision"
