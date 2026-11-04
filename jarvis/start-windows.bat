@echo off
cd /d "%~dp0"
set "NODE_BIN="
if exist "%~dp0runtime\node.exe" set "NODE_BIN=%~dp0runtime\node.exe"
if not defined NODE_BIN (
  where node >nul 2>&1
  if errorlevel 1 (
    echo JARVIS could not find Node. Re-download the zip from the latest GitHub release.
    pause
    exit /b 1
  )
  set "NODE_BIN=node"
)
if not exist node_modules (
  echo This download is missing its libraries. Re-download the zip from the latest GitHub release.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:4173"
"%NODE_BIN%" server.mjs
pause
