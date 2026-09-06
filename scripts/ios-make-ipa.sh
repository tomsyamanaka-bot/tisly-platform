#!/usr/bin/env bash
# Build ios/App/build/TiSLY.ipa from an existing .xcarchive.
# Usage: ios-make-ipa.sh <ios/App dir>
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

echo "===== archive tree (depth 5) ====="
find "$ARCHIVE_PATH" -maxdepth 5 \( -type d -o -name '*.app' \) -print || true

# Capacitor/Xcode: normally Products/Applications/*.app — also search whole archive
APP_IN_ARCHIVE="$(find "$ARCHIVE_PATH/Products/Applications" -maxdepth 1 -name '*.app' -type d 2>/dev/null | head -n 1 || true)"
if [ -z "$APP_IN_ARCHIVE" ]; then
  APP_IN_ARCHIVE="$(find "$ARCHIVE_PATH" -name '*.app' -type d 2>/dev/null | head -n 1 || true)"
fi
if [ -z "$APP_IN_ARCHIVE" ]; then
  echo "::error::archive 内に .app がありません"
  exit 1
fi
echo "Found app: $APP_IN_ARCHIVE"

if [ -f "$EXPORT_PLIST" ] && [ -n "${AUTH_KEY_PATH:-}" ] && [ -n "${APP_STORE_KEY_ID:-}" ] && [ -n "${APP_STORE_ISSUER_ID:-}" ]; then
  echo "===== xcodebuild -exportArchive ====="
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
  echo "exportArchive exit=${PIPESTATUS[0]}"
  set -e
else
  echo "exportArchive skipped (plist/auth incomplete)" | tee "$LOG"
fi

ls -laR "$EXPORT_DIR" || true
IPA="$(find "$EXPORT_DIR" -type f -name '*.ipa' 2>/dev/null | head -n 1 || true)"

if [ -n "$IPA" ]; then
  cp -f "$IPA" "$OUT_IPA"
  echo "Copied exported IPA -> $OUT_IPA"
else
  echo "Packaging IPA from archive .app (Payload zip)"
  STAGE="${APP_DIR}/build/ipa-stage"
  rm -rf "$STAGE"
  mkdir -p "$STAGE/Payload"
  # Keep original .app name inside Payload/
  cp -R "$APP_IN_ARCHIVE" "$STAGE/Payload/"
  # ditto produces a valid zip/ipa on macOS
  /usr/bin/ditto -c -k --sequesterRsrc --keepParent "$STAGE/Payload" "$OUT_IPA" 2>/dev/null \
    || ( cd "$STAGE" && /usr/bin/zip -r -y -q "$OUT_IPA" Payload )
fi

if [ ! -f "$OUT_IPA" ] || [ ! -s "$OUT_IPA" ]; then
  echo "::error::IPA not created or empty: $OUT_IPA"
  exit 1
fi

if ! /usr/bin/unzip -l "$OUT_IPA" | grep -qE 'Payload/[^/]+\.app'; then
  echo "::error::IPA missing Payload/*.app"
  /usr/bin/unzip -l "$OUT_IPA" | head -n 50 || true
  exit 1
fi

# Canonical path for later steps / artifacts
ls -lh "$OUT_IPA"
echo "OK $OUT_IPA ($(wc -c < "$OUT_IPA") bytes)"
