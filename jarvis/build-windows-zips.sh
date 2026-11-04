#!/bin/sh
set -e
cd "$(dirname "$0")"
ROOT="$(pwd)"
NODE_VERSION="${JARVIS_NODE_VERSION:-v26.13.0}"
CACHE="$ROOT/macos/.node-cache"
DIST="$ROOT/macos/dist"
mkdir -p "$CACHE" "$DIST"
WIN_DIR="$CACHE/node-${NODE_VERSION}-win-x64"
WIN_ZIP="$CACHE/node-${NODE_VERSION}-win-x64.zip"
if [ ! -f "$WIN_DIR/node.exe" ]; then
  if [ ! -f "$WIN_ZIP" ]; then
    curl -fL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-win-x64.zip" -o "$WIN_ZIP"
  fi
  rm -rf "$WIN_DIR"
  unzip -q "$WIN_ZIP" -d "$CACHE"
fi
if [ ! -d "$ROOT/node_modules/systeminformation" ]; then
  npm install
fi

pack_one() {
  name="$1"
  stage="$(mktemp -d)"
  root="$stage/$name"
  mkdir -p "$root/runtime"
  rsync -a \
    --exclude macos \
    --exclude test \
    --exclude data \
    --exclude .git \
    --exclude xcode \
    --exclude '.*' \
    --exclude Dockerfile \
    --exclude README.md \
    --exclude build-windows-zips.sh \
    --exclude pnpm-lock.yaml \
    --exclude pnpm-workspace.yaml \
    "$ROOT/" "$root/"
  cp "$WIN_DIR/node.exe" "$root/runtime/node.exe"
  cat > "$root/START.txt" <<EOF
Double-click start-windows.bat.

Node is already inside this folder. You do not install Node.js separately.

This is the same JARVIS app as the other Windows downloads. It names the busy app, not a website or a file.
EOF
  out="$DIST/${name}.zip"
  rm -f "$out"
  (
    cd "$stage"
    zip -qr "$out" "$name"
  )
  rm -rf "$stage"
  ls -lh "$out"
}

pack_one JARVIS-gaming-pc
pack_one JARVIS-gaming-laptop
pack_one JARVIS-windows-computer
echo "Built Windows zips with Node inside macos/dist/."
