#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

npm run build
npx electron-builder --mac dir

APP_NAME="Critical Points Worksheet Filler"
VERSION="$(node -p "require('./package.json').version")"
APP_DIR="$ROOT/release/mac-arm64/${APP_NAME}.app"

if [[ ! -d "$APP_DIR" ]]; then
  # Intel Macs use release/mac instead of release/mac-arm64
  APP_DIR="$ROOT/release/mac/${APP_NAME}.app"
fi

if [[ ! -d "$APP_DIR" ]]; then
  echo "Packaged app not found under release/" >&2
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) ARCH_LABEL="arm64" ;;
  x86_64) ARCH_LABEL="x64" ;;
  *) ARCH_LABEL="$ARCH" ;;
esac

STAGE="$ROOT/release/dmg-stage"
DMG="$ROOT/release/${APP_NAME}-${VERSION}-${ARCH_LABEL}.dmg"

rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$APP_DIR" "$STAGE/"
ln -s /Applications "$STAGE/Applications"

rm -f "$DMG"
hdiutil create -volname "$APP_NAME" -srcfolder "$STAGE" -ov -format UDZO "$DMG"
rm -rf "$STAGE"

echo ""
echo "DMG ready: $DMG"
echo "Note: unsigned build — right-click Open the first time (or System Settings → Privacy & Security)."
