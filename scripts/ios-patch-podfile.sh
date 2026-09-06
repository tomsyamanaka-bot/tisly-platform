#!/usr/bin/env bash
# Append / refresh Podfile post_install for CI-safe signing (Pods unsigned).
set -euo pipefail
PODFILE="${1:-ios/App/Podfile}"
if [ ! -f "$PODFILE" ]; then
  echo "No Podfile at $PODFILE — skip"
  exit 0
fi

MARKER="# TISLY_CI_POST_INSTALL"
if grep -q "$MARKER" "$PODFILE"; then
  echo "Podfile already has CI post_install"
  exit 0
fi

cat >> "$PODFILE" <<'RUBY'

# TISLY_CI_POST_INSTALL
post_install do |installer|
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO'
      config.build_settings['CODE_SIGNING_REQUIRED'] = 'NO'
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '14.0'
      config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
    end
  end
  installer.pods_project.build_configurations.each do |config|
    config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
  end
end
RUBY

echo "Appended CI post_install to $PODFILE"
