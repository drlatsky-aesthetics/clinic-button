@echo off
setlocal enabledelayedexpansion
title Clinic Button System — Setup

echo.
echo  ============================================================
echo   Treasury Aesthetics — Clinic Button System Setup
echo  ============================================================
echo.

:: ── Check Node.js ────────────────────────────────────────────────────────────

node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Node.js is not installed.
    echo      Downloading installer — please complete the install, then re-run this script.
    echo.
    start https://nodejs.org/en/download
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER% found

:: ── Install dependencies ──────────────────────────────────────────────────────

echo  [..] Installing dependencies...
call npm install --omit=optional >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] npm install failed. Check your internet connection and try again.
    pause
    exit /b 1
)
echo  [OK] Dependencies installed

:: ── Flic Hub IP ──────────────────────────────────────────────────────────────

echo.
echo  ── Flic Hub Configuration ─────────────────────────────────
echo.
echo  Leave blank to run in DEMO MODE (simulates button presses).
echo  Enter your Flic Hub LR's IP address to connect to real buttons.
echo  (Find the IP in your router's device list or the Flic app.)
echo.
set /p FLIC_IP="  Flic Hub IP (or press Enter for demo): "

:: ── OSCAR EMR Configuration ───────────────────────────────────────────────────

echo.
echo  ── OSCAR Pro EMR Integration (optional) ───────────────────
echo.
echo  Leave blank to skip OSCAR integration.
echo  If configured, enables patient lookup by health card and
echo  saving vitals directly to OSCAR measurements.
echo.
set /p OSCAR_BASE_URL="  OSCAR Base URL (or press Enter to skip): "

if not "%OSCAR_BASE_URL%"=="" (
    set /p OSCAR_CLIENT_ID="  OSCAR Client ID: "
    set /p OSCAR_CLIENT_SECRET="  OSCAR Client Secret: "
    set /p OSCAR_PROVIDER_NO="  Provider Number (default 1): "
    if "!OSCAR_PROVIDER_NO!"=="" set OSCAR_PROVIDER_NO=1
)

:: ── Write .env ───────────────────────────────────────────────────────────────

if "%FLIC_IP%"=="" (
    echo DEMO_MODE=true> .env
    set MODE_LABEL=DEMO MODE
) else (
    echo FLIC_HUB_HOST=%FLIC_IP%> .env
    set MODE_LABEL=Flic Hub at %FLIC_IP%
)

if not "%OSCAR_BASE_URL%"=="" (
    echo OSCAR_BASE_URL=%OSCAR_BASE_URL%>> .env
    echo OSCAR_CLIENT_ID=%OSCAR_CLIENT_ID%>> .env
    echo OSCAR_CLIENT_SECRET=%OSCAR_CLIENT_SECRET%>> .env
    echo OSCAR_PROVIDER_NO=%OSCAR_PROVIDER_NO%>> .env
    echo  [OK] OSCAR config saved to .env
) else (
    echo  [--] OSCAR integration skipped
)

echo  [OK] Config saved to .env

:: ── Create start.bat ─────────────────────────────────────────────────────────

echo @echo off> start.bat
echo title Clinic Button Server>> start.bat
echo for /f "tokens=1,2 delims==" %%%%a in (.env) do set "%%%%a=%%%%b">> start.bat
echo node server.js>> start.bat
echo pause>> start.bat

echo  [OK] start.bat created (run this to launch the server)

:: ── Find local IP for dashboard URL ──────────────────────────────────────────

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    set RAW_IP=%%a
    goto :got_ip
)
:got_ip
set LOCAL_IP=%RAW_IP: =%

:: ── Done ─────────────────────────────────────────────────────────────────────

echo.
echo  ============================================================
echo   Setup complete!
echo  ============================================================
echo.
echo   Mode       : %MODE_LABEL%
echo   Dashboard  : http://%LOCAL_IP%:3000
echo              : http://localhost:3000
echo.
echo   To start the server, run:   start.bat
echo   To open the dashboard, visit the URL above in any browser
echo   on this computer or any device on the same WiFi.
echo.
echo   To change the Flic Hub IP later, edit .env and restart.
echo.
pause
