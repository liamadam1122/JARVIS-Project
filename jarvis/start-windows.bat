@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 20 or newer from https://nodejs.org and run this file again.
  pause
  exit /b 1
)
if not exist node_modules npm install
start "" "http://127.0.0.1:4173"
node server.mjs
pause
