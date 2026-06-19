#!/usr/bin/env bash
#
# apply-ios-config.sh — apply Blackout's native iOS configuration to the
# Capacitor-generated Info.plist (deep-link URL schemes, permission usage
# strings, and background modes for push).
#
# iOS projects can only be generated/built on macOS, so run this ONCE on a Mac
# (or in the macOS CI job) AFTER `pnpm add:ios` / `cap add ios`, then review and
# commit ios/App/App/Info.plist. The script is idempotent and macOS-only
# (it uses /usr/libexec/PlistBuddy).
#
set -euo pipefail

PLIST="${1:-ios/App/App/Info.plist}"
BUNDLE_ID="co.bmc.blackout"

if [ "$(uname)" != "Darwin" ]; then
  echo "This script requires macOS (PlistBuddy). Run it on a Mac after 'cap add ios'." >&2
  exit 1
fi
if [ ! -f "$PLIST" ]; then
  echo "Info.plist not found at: $PLIST" >&2
  echo "Generate the iOS project first: pnpm add:ios && pnpm sync:ios" >&2
  exit 1
fi

PB=/usr/libexec/PlistBuddy

add_string_if_missing() {
  local key="$1" val="$2"
  if $PB -c "Print :$key" "$PLIST" >/dev/null 2>&1; then
    echo "  :$key already present"
  else
    $PB -c "Add :$key string $val" "$PLIST"
    echo "  added :$key"
  fi
}

append_array_string_if_missing() {
  local key="$1" val="$2"
  $PB -c "Print :$key" "$PLIST" >/dev/null 2>&1 || $PB -c "Add :$key array" "$PLIST"
  if $PB -c "Print :$key" "$PLIST" 2>/dev/null | grep -qw "$val"; then
    echo "  :$key already contains $val"
    return 0
  fi
  local count=0
  while $PB -c "Print :$key:$count" "$PLIST" >/dev/null 2>&1; do count=$((count + 1)); done
  $PB -c "Add :$key:$count string $val" "$PLIST"
  echo "  appended $val to :$key"
}

add_url_scheme() {
  local scheme="$1"
  $PB -c "Print :CFBundleURLTypes" "$PLIST" >/dev/null 2>&1 || $PB -c "Add :CFBundleURLTypes array" "$PLIST"
  if $PB -c "Print :CFBundleURLTypes" "$PLIST" 2>/dev/null | grep -qw "$scheme"; then
    echo "  url scheme '$scheme' already present"
    return 0
  fi
  local count=0
  while $PB -c "Print :CFBundleURLTypes:$count" "$PLIST" >/dev/null 2>&1; do count=$((count + 1)); done
  $PB -c "Add :CFBundleURLTypes:$count dict" "$PLIST"
  $PB -c "Add :CFBundleURLTypes:$count:CFBundleURLName string ${BUNDLE_ID}.${scheme}" "$PLIST"
  $PB -c "Add :CFBundleURLTypes:$count:CFBundleURLSchemes array" "$PLIST"
  $PB -c "Add :CFBundleURLTypes:$count:CFBundleURLSchemes:0 string $scheme" "$PLIST"
  echo "  added url scheme '$scheme'"
}

echo "Applying Blackout iOS config to $PLIST"

echo "Deep-link URL schemes:"
add_url_scheme matrix
add_url_scheme blackout

echo "Permission usage strings:"
add_string_if_missing NSCameraUsageDescription "Blackout uses the camera to capture and share photos in chats."
add_string_if_missing NSMicrophoneUsageDescription "Blackout uses the microphone for voice and video calls."
add_string_if_missing NSPhotoLibraryUsageDescription "Blackout accesses your photo library to share images in chats."
add_string_if_missing NSPhotoLibraryAddUsageDescription "Blackout saves images you choose to your photo library."

echo "Background modes (push):"
append_array_string_if_missing UIBackgroundModes remote-notification

echo "Done. Review and commit $PLIST (and add the Push Notifications capability in Xcode)."
