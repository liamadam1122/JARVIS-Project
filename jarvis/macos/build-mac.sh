#!/bin/sh
set -e
cd "$(dirname "$0")"
NODE_VERSION="${JARVIS_NODE_VERSION:-v26.13.0}"
SDK="$(xcrun --show-sdk-path)"
CACHE=".node-cache"
mkdir -p JARVIS.app/Contents/MacOS JARVIS.app/Contents/Resources "$CACHE"
cp Info.plist JARVIS.app/Contents/Info.plist
cp PrivacyInfo.xcprivacy JARVIS.app/Contents/Resources/PrivacyInfo.xcprivacy
swiftc -parse-as-library JarvisMain.swift -O -target arm64-apple-macosx13.0 -sdk "$SDK" -o "$CACHE/JARVIS.arm64" -framework Cocoa -framework WebKit
swiftc -parse-as-library JarvisMain.swift -O -target x86_64-apple-macosx13.0 -sdk "$SDK" -o "$CACHE/JARVIS.x64" -framework Cocoa -framework WebKit
lipo -create -output JARVIS.app/Contents/MacOS/JARVIS "$CACHE/JARVIS.arm64" "$CACHE/JARVIS.x64"

fetch_node() {
  arch="$1"
  dir="$CACHE/node-${NODE_VERSION}-darwin-${arch}"
  tarball="$CACHE/node-${NODE_VERSION}-darwin-${arch}.tar.gz"
  if [ ! -x "$dir/bin/node" ]; then
    if [ ! -f "$tarball" ]; then
      curl -fL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-darwin-${arch}.tar.gz" -o "$tarball"
    fi
    rm -rf "$dir"
    tar -xzf "$tarball" -C "$CACHE" "node-${NODE_VERSION}-darwin-${arch}/bin/node"
  fi
}
fetch_node arm64
fetch_node x64
lipo -create -output JARVIS.app/Contents/MacOS/node \
  "$CACHE/node-${NODE_VERSION}-darwin-arm64/bin/node" \
  "$CACHE/node-${NODE_VERSION}-darwin-x64/bin/node"
chmod 755 JARVIS.app/Contents/MacOS/node

rm -rf JARVIS.app/Contents/Resources/server
mkdir -p JARVIS.app/Contents/Resources/server
rsync -a --exclude macos --exclude test --exclude data --exclude .git --exclude xcode \
  "$(cd .. && pwd)/" JARVIS.app/Contents/Resources/server/
# Ad-hoc signature only. The sandbox entitlement is not applied: a sandboxed
# App Store binary cannot launch Node, and this build has no Apple Team ID.
# Node ships inside the app, so the Mac does not need a separate Node install.
# Sign outside Documents. iCloud adds Finder info there, and codesign rejects it.
SIGN_DIR="$(mktemp -d)"
ditto --norsrc --noextattr JARVIS.app "$SIGN_DIR/JARVIS.app"
find "$SIGN_DIR/JARVIS.app" -name .DS_Store -delete
xattr -cr "$SIGN_DIR/JARVIS.app" || true
codesign --force --sign - "$SIGN_DIR/JARVIS.app/Contents/MacOS/node"
codesign --force --sign - "$SIGN_DIR/JARVIS.app"
codesign --verify --strict "$SIGN_DIR/JARVIS.app"
rm -rf JARVIS.app
ditto --norsrc --noextattr "$SIGN_DIR/JARVIS.app" JARVIS.app
mkdir -p dist
ditto -c -k --keepParent "$SIGN_DIR/JARVIS.app" dist/JARVIS-mac.zip
STAGE="$(mktemp -d)"
ditto --norsrc --noextattr "$SIGN_DIR/JARVIS.app" "$STAGE/JARVIS.app"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "JARVIS" -srcfolder "$STAGE" -ov -format UDZO "dist/JARVIS.dmg" >/dev/null
rm -rf "$STAGE" "$SIGN_DIR"
echo "Built macos/JARVIS.app, dist/JARVIS-mac.zip, and dist/JARVIS.dmg."
echo "Open the zip or the disk image, drag JARVIS to Applications, then open it from there."
