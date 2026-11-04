@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title JARVIS

set "ROOT=%~dp0"
set "APP=%ROOT%app"
set "NODE=%APP%\runtime\node.exe"

if exist "%NODE%" goto :LAUNCH
if exist "%ROOT%runtime\node.exe" (
  set "APP=%ROOT%"
  set "NODE=%ROOT%runtime\node.exe"
  goto :LAUNCH
)

echo.
echo  JARVIS needs a full extract. Trying to unpack the zip automatically...
echo.

set "DEST=%LOCALAPPDATA%\JARVIS\gaming-pc"
set "ZIP="

call :FIND_ZIP "%USERPROFILE%\Downloads"
if not defined ZIP call :FIND_ZIP "%USERPROFILE%\Desktop"
if not defined ZIP call :FIND_ZIP "%USERPROFILE%\OneDrive\Downloads"
if not defined ZIP call :FIND_ZIP "%USERPROFILE%\OneDrive\Desktop"
if not defined ZIP call :FIND_ZIP "%ROOT%.."
if not defined ZIP call :FIND_ZIP "%ROOT%"

if not defined ZIP goto :NEED_EXTRACT

echo  Found zip:
echo  %ZIP%
echo  Unpacking to:
echo  %DEST%
echo.

if exist "%DEST%" rmdir /s /q "%DEST%" 2>nul
mkdir "%DEST%" 2>nul

powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%DEST%' -Force"
if errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Add-Type -AssemblyName System.IO.Compression.FileSystem; if (Test-Path '%DEST%') { Remove-Item -LiteralPath '%DEST%' -Recurse -Force }; New-Item -ItemType Directory -Path '%DEST%' | Out-Null; [System.IO.Compression.ZipFile]::ExtractToDirectory('%ZIP%', '%DEST%')"
)

set "APP="
set "NODE="
set "ROOT="

if exist "%DEST%\app\runtime\node.exe" (
  set "ROOT=%DEST%\"
  set "APP=%DEST%\app"
  set "NODE=%DEST%\app\runtime\node.exe"
)

if not defined NODE (
  for /d %%D in ("%DEST%\*") do (
    if exist "%%~D\app\runtime\node.exe" (
      set "ROOT=%%~D\"
      set "APP=%%~D\app"
      set "NODE=%%~D\app\runtime\node.exe"
    )
  )
)

if not defined NODE goto :NEED_EXTRACT
if not exist "%NODE%" goto :NEED_EXTRACT
echo  Unpack OK.
echo.
goto :LAUNCH

:NEED_EXTRACT
echo.
echo  ============================================================
echo   STOP - do not open JARVIS from inside the zip window.
echo  ============================================================
echo.
echo   1. Close this window.
echo   2. Go to Downloads.
echo   3. Right-click JARVIS-gaming-pc.zip
echo   4. Click "Extract All..." / "Alles uitpakken..."
echo   5. Click Extract / Uitpakken
echo   6. Open the NEW folder that appears
echo   7. Double-click JARVIS.cmd
echo.
echo   NIET openen vanuit het zip-venster.
echo   Eerst rechtsklikken op de zip - Alles uitpakken.
echo.
pause
exit /b 1

:LAUNCH
if not exist "%APP%\server.mjs" (
  echo JARVIS files are incomplete.
  echo Re-download from the latest GitHub release.
  pause
  exit /b 1
)
if not exist "%APP%\node_modules" (
  echo This download is missing its libraries.
  echo Re-download from the latest GitHub release.
  pause
  exit /b 1
)

cd /d "%APP%"
start "" "http://127.0.0.1:4173"
echo  Starting JARVIS...
echo  Leave this window open while you use the app.
echo.
"%NODE%" server.mjs
echo.
echo  JARVIS stopped.
pause
exit /b 0

:FIND_ZIP
set "DIR=%~1"
if not exist "%DIR%" exit /b 0
if exist "%DIR%\JARVIS-gaming-pc.zip" set "ZIP=%DIR%\JARVIS-gaming-pc.zip" & exit /b 0
if exist "%DIR%\JARVIS-gaming-laptop.zip" set "ZIP=%DIR%\JARVIS-gaming-laptop.zip" & exit /b 0
if exist "%DIR%\JARVIS-windows-computer.zip" set "ZIP=%DIR%\JARVIS-windows-computer.zip" & exit /b 0
for %%F in ("%DIR%\JARVIS-gaming-pc*.zip") do (
  if exist "%%~F" set "ZIP=%%~F" & exit /b 0
)
for %%F in ("%DIR%\JARVIS-gaming-laptop*.zip") do (
  if exist "%%~F" set "ZIP=%%~F" & exit /b 0
)
for %%F in ("%DIR%\JARVIS-windows-computer*.zip") do (
  if exist "%%~F" set "ZIP=%%~F" & exit /b 0
)
exit /b 0
