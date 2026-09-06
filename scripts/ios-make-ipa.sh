#!/usr/bin/env bash
# Create ios/App/build/TiSLY.ipa from TiSLY.xcarchive.
# 1) xcodebuild -exportArchive
# 2) fallback: zip Payload from Products/Applications/*.app
set -euo pipefail

APP_DIR="${1:-${GITHUB_WORKSPACE}/ios/App}"
ARCHIVE_PATH="${APP_DIR}/build/TiSLY.xcarchive"
EXPORT_DIR="${APP_DIR}/build/ipa"
EXPORT_PLIST="${APP_DIR}/build/ExportOptions.plist"
LOG="${APP_DIR}/build/export.log"
OUT_IPA="${APP_DIR}/build/TiSLY.ipa"
AUTH_KEY_PATH="${AUTH_KEY_PATH:-}"
APP_STORE_KEY_ID="${APP_STORE_KEY_ID:-}"
APP_STORE_ISSUER_ID="${APP_STORE_ISSUER_ID:-}"

mkdir -p "${APP_DIR}/build"
rm -rf "$EXPORT_DIR"
mkdir -p "$EXPORT_DIR"
rm -f "$OUT_IPA"

if [ ! -d "$ARCHIVE_PATH" ]; then
  echo "::error::archive missing: $ARCHIVE_PATH"
  ls -laR "${APP_DIR}/build" || true
  exit 1
fi

echo "===== archive Applications ====="
ls -laR "$ARCHIVE_PATH/Products" || true
APP_IN_ARCHIVE="$(find "$ARCHIVE_PATH/Products/Applications" -maxdepth 1 -name '*.app' -type d 2>/dev/null | head -n 1 || true)"
if [ -z "$APP_IN_ARCHIVE" ]; then
  echo "::error::archive 内に .app がありません (SKIP_INSTALL=YES の可能性)。Products:"
  find "$ARCHIVE_PATH" -maxdepth 4 -type d -print || true
  exit 1
fi
echo "Found app in archive: $APP_IN_ARCHIVE"

EXPORT_OK=0
if [ -f "$EXPORT_PLIST" ] && [ -n "$AUTH_KEY_PATH" ] && [ -n "$APP_STORE_KEY_ID" ] && [ -n "$APP_STORE_ISSUER_ID" ]; then
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
  EXPORT_OK=${PIPESTATUS[0]}
  set -e
  echo "exportArchive exit=${EXPORT_OK}"
else
  echo "Skip exportArchive (missing plist or API key env); will package from archive"
  echo "skipped exportArchive" > "$LOG"
fi

echo "===== export dir ====="
ls -laR "$EXPORT_DIR" || true

IPA="$(find "$EXPORT_DIR" -type f -name '*.ipa' 2>/dev/null | head -n 1 || true)"
if [ -n "$IPA" ]; then
  cp -f "$IPA" "$OUT_IPA"
  echo "Using exported IPA: $IPA -> $OUT_IPA"
else
  echo "No IPA from exportArchive — packaging Payload zip from archive .app"
  STAGE="${APP_DIR}/build/ipa-stage"
  rm -rf "$STAGE"
  mkdir -p "$STAGE/Payload"
  cp -R "$APP_IN_ARCHIVE" "$STAGE/Payload/"
  (
    cd "$STAGE"
    /usr/bin/zip -r -y -q "$OUT_IPA" Payload
  )
  echo "Packaged fallback IPA from $APP_IN_ARCHIVE"
fi

if [ ! -f "$OUT_IPA" ]; then
  echo "::error::failed to create $OUT_IPA"
  exit 1
fi

# Sanity: IPA is a zip containing Payload/*.app
if ! /usr/bin/unzip -l "$OUT_IPA" | grep -q 'Payload/.*\.app/'; then
  echo "::error::IPA に Payload/*.app が含まれていません"
  /usr/bin/unzip -l "$OUT_IPA" | head -n 40 || true
  exit 1
fi

ls -lh "$OUT_IPA"
echo "OUT_IPA=${OUT_IPA}"
