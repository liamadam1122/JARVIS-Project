#!/bin/sh
set -e
cd "$(dirname "$0")"
mkdir -p JARVIS.app/Contents/MacOS JARVIS.app/Contents/Resources
cp Info.plist JARVIS.app/Contents/Info.plist
cp PrivacyInfo.xcprivacy JARVIS.app/Contents/Resources/PrivacyInfo.xcprivacy
swiftc -parse-as-library JarvisMain.swift -O -o JARVIS.app/Contents/MacOS/JARVIS -framework Cocoa -framework WebKit
rm -rf JARVIS.app/Contents/Resources/server
mkdir -p JARVIS.app/Contents/Resources/server
rsync -a --exclude macos --exclude test --exclude data --exclude .git \
  "$(cd .. && pwd)/" JARVIS.app/Contents/Resources/server/
# Ad-hoc signature only. The sandbox entitlement is not applied: a sandboxed
# App Store binary cannot launch Node, and this build has no Apple Team ID.
xattr -cr JARVIS.app
codesign --force --sign - JARVIS.app
mkdir -p dist
ditto -c -k --keepParent JARVIS.app dist/JARVIS-mac.zip
STAGE="$(mktemp -d)"
cp -R JARVIS.app "$STAGE/JARVIS.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "JARVIS" -srcfolder "$STAGE" -ov -format UDZO "dist/JARVIS.dmg" >/dev/null
rm -rf "$STAGE"
echo "Built macos/JARVIS.app, dist/JARVIS-mac.zip, and dist/JARVIS.dmg."
echo "Open the zip or the disk image, drag JARVIS to Applications, then open it from there."
