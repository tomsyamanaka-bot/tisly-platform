#!/usr/bin/env bash
# Make Capacitor Podfile CI-safe.
# CocoaPods allows only ONE post_install — never append a second block.
# Usage: bash scripts/ios-patch-podfile.sh ios/App/Podfile
set -euo pipefail

PODFILE="${1:-ios/App/Podfile}"
if [ ! -f "$PODFILE" ]; then
  echo "No Podfile at $PODFILE — skip"
  exit 0
fi

MARKER="# TISLY_CI_POST_INSTALL"
if grep -q "$MARKER" "$PODFILE"; then
  echo "Podfile already patched ($MARKER)"
  exit 0
fi

python3 - "$PODFILE" <<'PY'
from pathlib import Path
import re
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")

combined = """
# TISLY_CI_POST_INSTALL
post_install do |installer|
  begin
    assertDeploymentTarget(installer)
  rescue NameError
  end
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
      config.build_settings['CODE_SIGNING_REQUIRED'] = 'NO'
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '14.0'
      config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
      config.build_settings['SKIP_INSTALL'] = 'YES'
    end
  end
  installer.pods_project.build_configurations.each do |config|
    config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
  end
end
"""

# Strip every existing post_install ... end block (top-level), then append one combined hook.
# Capacitor templates end with a single post_install; duplicates break `pod install`.
pattern = re.compile(
    r"(?ms)^[ \t]*post_install[ \t]+do[ \t]*\|[^|\n]+\|[ \t]*\n.*?^[ \t]*end[ \t]*\n?"
)
cleaned, n = pattern.subn("", text)
if n:
    print(f"Removed {n} existing post_install block(s)")
else:
    print("No existing post_install found — appending")

cleaned = cleaned.rstrip() + "\n" + combined.lstrip()
path.write_text(cleaned, encoding="utf-8")
print(f"Wrote single post_install to {path}")
PY

# Guard: still only one post_install
COUNT="$(grep -c 'post_install do' "$PODFILE" || true)"
if [ "$COUNT" -ne 1 ]; then
  echo "::error::Podfile must have exactly 1 post_install (found ${COUNT})"
  cat "$PODFILE"
  exit 1
fi

echo "===== Podfile (tail) ====="
tail -n 50 "$PODFILE"
