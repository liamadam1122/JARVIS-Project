@echo off
setlocal EnableExtensions
title JARVIS
echo.
echo  JARVIS uitpakken en starten...
echo.

set "DEST=%LOCALAPPDATA%\JARVIS\gaming-pc"
set "ZIP="

call :FIND_ZIP "%USERPROFILE%\Downloads"
if not defined ZIP call :FIND_ZIP "%USERPROFILE%\Desktop"
if not defined ZIP call :FIND_ZIP "%USERPROFILE%\OneDrive\Downloads"
if not defined ZIP call :FIND_ZIP "%~dp0"

if not defined ZIP (
  echo  Kon JARVIS-gaming-pc.zip niet vinden in Downloads.
  echo  Download die eerst, laat hem in Downloads staan, en start dit bestand opnieuw.
  echo.
  pause
  exit /b 1
)

echo  Gevonden: %ZIP%
echo  Uitpakken naar: %DEST%
echo.
if exist "%DEST%" rmdir /s /q "%DEST%" 2>nul
mkdir "%DEST%" 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%DEST%' -Force"
if errorlevel 1 (
  echo  Uitpakken mislukt.
  pause
  exit /b 1
)

if exist "%DEST%\JARVIS.exe" (
  start "" "%DEST%\JARVIS.exe"
  exit /b 0
)
for /d %%D in ("%DEST%\*") do if exist "%%~D\JARVIS.exe" (
  start "" "%%~D\JARVIS.exe"
  exit /b 0
)
if exist "%DEST%\START-JARVIS.cmd" (
  call "%DEST%\START-JARVIS.cmd"
  exit /b %ERRORLEVEL%
)

echo  Uitpakken klaar, maar JARVIS.exe ontbreekt.
pause
exit /b 1

:FIND_ZIP
set "DIR=%~1"
if not exist "%DIR%" exit /b 0
if exist "%DIR%\JARVIS-gaming-pc.zip" set "ZIP=%DIR%\JARVIS-gaming-pc.zip" & exit /b 0
if exist "%DIR%\JARVIS-gaming-laptop.zip" set "ZIP=%DIR%\JARVIS-gaming-laptop.zip" & exit /b 0
if exist "%DIR%\JARVIS-windows-computer.zip" set "ZIP=%DIR%\JARVIS-windows-computer.zip" & exit /b 0
for %%F in ("%DIR%\JARVIS-gaming-pc*.zip") do if exist "%%~F" set "ZIP=%%~F" & exit /b 0
for %%F in ("%DIR%\JARVIS-gaming-laptop*.zip") do if exist "%%~F" set "ZIP=%%~F" & exit /b 0
for %%F in ("%DIR%\JARVIS-windows-computer*.zip") do if exist "%%~F" set "ZIP=%%~F" & exit /b 0
exit /b 0
