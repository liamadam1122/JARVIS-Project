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
  app="$root/app"
  mkdir -p "$app/runtime" "$root"
  rsync -a \
    --exclude macos \
    --exclude test \
    --exclude data \
    --exclude .git \
    --exclude xcode \
    --exclude windows \
    --exclude '.*' \
    --exclude Dockerfile \
    --exclude README.md \
    --exclude build-windows-zips.sh \
    --exclude start-mac.command \
    --exclude start-linux.sh \
    --exclude start-windows.bat \
    --exclude pnpm-lock.yaml \
    --exclude pnpm-workspace.yaml \
    --exclude 'assets/jarvis-orb-source.jpg' \
    --exclude 'assets/jarvis-orb.png' \
    --exclude 'assets/jarvis-orb-1024.png' \
    "$ROOT/" "$app/"
  cp "$WIN_DIR/node.exe" "$app/runtime/node.exe"
  # Only clear launch files at the root — nothing confusing to open.
  cp "$ROOT/windows/JARVIS.cmd" "$root/JARVIS.cmd"
  cp "$ROOT/windows/EXTRACT-ALL-FIRST.txt" "$root/EXTRACT-ALL-FIRST.txt"
  cat > "$root/Double-click-JARVIS-cmd.txt" <<EOF
After Extract All, double-click JARVIS.cmd

Do not open files from inside the zip window.
Right-click the zip → Extract All / Alles uitpakken.
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
echo "Built Windows zips with auto-extract launcher in macos/dist/."
