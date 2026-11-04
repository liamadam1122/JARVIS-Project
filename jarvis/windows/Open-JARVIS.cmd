@echo off
setlocal EnableExtensions
title Open JARVIS
echo.
echo  This helper unpacks JARVIS from your Downloads folder and starts it.
echo.

set "DEST=%LOCALAPPDATA%\JARVIS\gaming-pc"
set "ZIP="

call :FIND_ZIP "%USERPROFILE%\Downloads"
if not defined ZIP call :FIND_ZIP "%USERPROFILE%\Desktop"
if not defined ZIP call :FIND_ZIP "%USERPROFILE%\OneDrive\Downloads"
if not defined ZIP call :FIND_ZIP "%~dp0"

if not defined ZIP (
  echo  Could not find JARVIS-gaming-pc.zip in Downloads.
  echo  Download it from the GitHub release, then run this file again.
  echo.
  pause
  exit /b 1
)

echo  Found: %ZIP%
echo  Unpacking to: %DEST%
echo.
if exist "%DEST%" rmdir /s /q "%DEST%" 2>nul
mkdir "%DEST%" 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%ZIP%' -DestinationPath '%DEST%' -Force"
if errorlevel 1 (
  echo  Unpack failed.
  pause
  exit /b 1
)

set "LAUNCH="
if exist "%DEST%\JARVIS.cmd" set "LAUNCH=%DEST%\JARVIS.cmd"
for /d %%D in ("%DEST%\*") do if exist "%%~D\JARVIS.cmd" set "LAUNCH=%%~D\JARVIS.cmd"

if not defined LAUNCH (
  echo  Unpack finished but JARVIS.cmd was not found.
  pause
  exit /b 1
)

echo  Starting...
call "%LAUNCH%"
exit /b %ERRORLEVEL%

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
