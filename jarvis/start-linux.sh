#!/bin/sh
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Install Node.js 20 or newer from https://nodejs.org and run this file again."
  exit 1
fi
if [ ! -d node_modules ]; then
  npm install
fi
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://127.0.0.1:4173" >/dev/null 2>&1 &
fi
exec node server.mjs
