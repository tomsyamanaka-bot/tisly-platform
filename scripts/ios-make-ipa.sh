#!/usr/bin/env bash
# Create App Store–signed IPA at ios/App/build/TiSLY.ipa via xcodebuild -exportArchive.
# Payload-zip fallback is DISABLED — it omits embedded.mobileprovision (ITMS-90174).
# Usage: ios-make-ipa.sh <ios/App dir>
# Requires env: AUTH_KEY_PATH, APP_STORE_KEY_ID, APP_STORE_ISSUER_ID, APPLE_TEAM_ID
set -euo pipefail

APP_DIR="${1:?ios/App dir required}"
ARCHIVE_PATH="${APP_DIR}/build/TiSLY.xcarchive"
EXPORT_DIR="${APP_DIR}/build/ipa"
EXPORT_PLIST="${APP_DIR}/build/ExportOptions.plist"
LOG="${APP_DIR}/build/export.log"
OUT_IPA="${APP_DIR}/build/TiSLY.ipa"
UPLOAD_FLAG="${APP_DIR}/build/exported-via-upload.flag"

mkdir -p "${APP_DIR}/build"
rm -rf "$EXPORT_DIR" "$UPLOAD_FLAG"
mkdir -p "$EXPORT_DIR"
rm -f "$OUT_IPA"
: > "$LOG"

if [ ! -d "$ARCHIVE_PATH" ]; then
  echo "::error::archive missing: $ARCHIVE_PATH"
  exit 1
fi
if [ ! -f "$EXPORT_PLIST" ]; then
  echo "::error::ExportOptions.plist missing: $EXPORT_PLIST"
  exit 1
fi
if [ -z "${AUTH_KEY_PATH:-}" ] || [ ! -f "${AUTH_KEY_PATH}" ]; then
  echo "::error::AUTH_KEY_PATH missing"
  exit 1
fi
if [ -z "${APP_STORE_KEY_ID:-}" ] || [ -z "${APP_STORE_ISSUER_ID:-}" ] || [ -z "${APPLE_TEAM_ID:-}" ]; then
  echo "::error::APP_STORE_KEY_ID / APP_STORE_ISSUER_ID / APPLE_TEAM_ID required"
  exit 1
fi

# WWDR intermediate (helps Distribution trust chain on fresh runners)
WWDR_CER="${RUNNER_TEMP:-/tmp}/AppleWWDRCAG3.cer"
if curl -fsSL -o "$WWDR_CER" "https://www.apple.com/certificateauthority/AppleWWDRCAG3.cer"; then
  security import "$WWDR_CER" -k login.keychain-db -T /usr/bin/codesign -T /usr/bin/security 2>/dev/null || true
  echo "Imported Apple WWDR G3 (best effort)"
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
ls -la "${APP_IN_ARCHIVE}/embedded.mobileprovision" 2>/dev/null || echo "archive .app has no embedded.mobileprovision yet"

ensure_plist_base() {
  /usr/libexec/PlistBuddy -c "Set :signingStyle automatic" "$EXPORT_PLIST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :signingStyle string automatic" "$EXPORT_PLIST"
  /usr/libexec/PlistBuddy -c "Set :teamID ${APPLE_TEAM_ID}" "$EXPORT_PLIST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :teamID string ${APPLE_TEAM_ID}" "$EXPORT_PLIST"
  /usr/libexec/PlistBuddy -c "Delete :signingCertificate" "$EXPORT_PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Delete :provisioningProfiles" "$EXPORT_PLIST" 2>/dev/null || true
}

run_export() {
  local method="$1"
  local destination="$2"
  echo "===== exportArchive method=${method} destination=${destination} =====" | tee -a "$LOG"
  ensure_plist_base
  /usr/libexec/PlistBuddy -c "Set :method ${method}" "$EXPORT_PLIST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :method string ${method}" "$EXPORT_PLIST"
  /usr/libexec/PlistBuddy -c "Set :destination ${destination}" "$EXPORT_PLIST" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :destination string ${destination}" "$EXPORT_PLIST"
  plutil -p "$EXPORT_PLIST" | tee -a "$LOG"
  rm -rf "$EXPORT_DIR"
  mkdir -p "$EXPORT_DIR"
  set +e
  xcodebuild \
    -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_DIR" \
    -exportOptionsPlist "$EXPORT_PLIST" \
    -allowProvisioningUpdates \
    -allowProvisioningDeviceRegistration \
    -authenticationKeyPath "$AUTH_KEY_PATH" \
    -authenticationKeyID "$APP_STORE_KEY_ID" \
    -authenticationKeyIssuerID "$APP_STORE_ISSUER_ID" \
    2>&1 | tee -a "$LOG"
  local st=${PIPESTATUS[0]}
  set -e
  echo "exportArchive method=${method} destination=${destination} exit=${st}" | tee -a "$LOG"
  return "$st"
}

EXPORT_OK=0

# 0) If ASC prepare already wrote manual ExportOptions, try it first (do not overwrite)
if /usr/libexec/PlistBuddy -c "Print :signingStyle" "$EXPORT_PLIST" 2>/dev/null | grep -qi manual; then
  echo "===== exportArchive using pre-prepared manual ExportOptions =====" | tee -a "$LOG"
  plutil -p "$EXPORT_PLIST" | tee -a "$LOG"
  rm -rf "$EXPORT_DIR"
  mkdir -p "$EXPORT_DIR"
  set +e
  xcodebuild \
    -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_DIR" \
    -exportOptionsPlist "$EXPORT_PLIST" \
    -allowProvisioningUpdates \
    -allowProvisioningDeviceRegistration \
    -authenticationKeyPath "$AUTH_KEY_PATH" \
    -authenticationKeyID "$APP_STORE_KEY_ID" \
    -authenticationKeyIssuerID "$APP_STORE_ISSUER_ID" \
    2>&1 | tee -a "$LOG"
  st=${PIPESTATUS[0]}
  set -e
  if [ "$st" -eq 0 ]; then
    EXPORT_OK=1
  fi
fi

# 1) Prefer local IPA with embedded provisioning (required for ITMS-90174-safe upload)
# NOTE: use method "app-store" only — "app-store-connect" yields
#   exportOptionsPlist error for key "method" expected one {} 
# when the archive has no distributable methods / on some Xcode versions.
if [ "$EXPORT_OK" -ne 1 ]; then
  for METHOD in app-store; do
    if run_export "$METHOD" "export"; then
      EXPORT_OK=1
      break
    fi
  done
fi

# 2) Fallback: Xcode uploads archive to ASC directly (still signs with Distribution profile)
if [ "$EXPORT_OK" -ne 1 ]; then
  echo "Local export failed — trying destination=upload (ASC direct)" | tee -a "$LOG"
  for METHOD in app-store; do
    if run_export "$METHOD" "upload"; then
      EXPORT_OK=1
      echo "uploaded-via-exportArchive" > "$UPLOAD_FLAG"
      echo "ASC_UPLOAD_VIA_EXPORT=1" >> "$GITHUB_ENV"
      break
    fi
  done
fi

if [ "$EXPORT_OK" -ne 1 ]; then
  echo "::error::exportArchive failed (local + upload). Payload zip is forbidden (ITMS-90174)."
  grep -E 'error:|Error |provision|Provisioning|Signing|IDEDistribution|TEAM|certificate|Authentication' "$LOG" | tail -n 120 || true
  exit 1
fi

IPA="$(find "$EXPORT_DIR" -type f -name '*.ipa' 2>/dev/null | head -n 1 || true)"
if [ -n "$IPA" ]; then
  cp -f "$IPA" "$OUT_IPA"
  echo "Copied signed IPA -> $OUT_IPA"
elif [ -f "$UPLOAD_FLAG" ]; then
  echo "destination=upload succeeded without local IPA — ASC already received the build"
  # Still try to produce a signed IPA for artifact/verification by re-exporting locally
  for METHOD in app-store; do
    if run_export "$METHOD" "export"; then
      IPA="$(find "$EXPORT_DIR" -type f -name '*.ipa' 2>/dev/null | head -n 1 || true)"
      if [ -n "$IPA" ]; then
        cp -f "$IPA" "$OUT_IPA"
        break
      fi
    fi
  done
  if [ ! -f "$OUT_IPA" ]; then
    echo "::warning::ASC upload OK but local IPA not produced — skipping IPA artifact checks"
    exit 0
  fi
else
  echo "::error::exportArchive OK but no .ipa in $EXPORT_DIR"
  ls -laR "$EXPORT_DIR" || true
  exit 1
fi

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
codesign -dv --verbose=2 "$APP_IN_IPA" 2>&1 | tee "${APP_DIR}/build/codesign-verify.log" | head -n 40 || true
ls -lh "$OUT_IPA"
echo "OK signed IPA $OUT_IPA with embedded.mobileprovision"
