@echo off
cd /d "%~dp0"
set "APP=%~dp0app"
if not exist "%APP%\server.mjs" set "APP=%~dp0"
set "NODE=%APP%\runtime\node.exe"
if not exist "%NODE%" (
  echo JARVIS could not find its bundled Node runtime.
  echo Re-download the zip from the latest GitHub release.
  pause
  exit /b 1
)
if not exist "%APP%\node_modules" (
  echo This download is missing its libraries.
  echo Re-download the zip from the latest GitHub release.
  pause
  exit /b 1
)

if not exist "%~dp0JARVIS.exe" if exist "%~dp0launcher.cs" if exist "%~dp0jarvis.ico" (
  where csc >nul 2>&1
  if not errorlevel 1 (
    csc /nologo /target:winexe /win32icon:"%~dp0jarvis.ico" /r:System.Windows.Forms.dll /out:"%~dp0JARVIS.exe" "%~dp0launcher.cs" >nul 2>&1
  )
)

if exist "%~dp0JARVIS.exe" (
  start "" "%~dp0JARVIS.exe"
  exit /b 0
)

if exist "%~dp0JARVIS.vbs" (
  wscript //nologo "%~dp0JARVIS.vbs"
  exit /b 0
)

start "" "http://127.0.0.1:4173"
cd /d "%APP%"
start "JARVIS" /min "%NODE%" server.mjs
