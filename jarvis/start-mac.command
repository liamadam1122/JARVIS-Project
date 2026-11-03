#!/bin/sh
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 20 or newer from https://nodejs.org and run this file again."
  exit 1
fi
if [ ! -d node_modules ]; then
  npm install
fi
open "http://127.0.0.1:4173"
exec node server.mjs
