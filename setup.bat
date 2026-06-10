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

:: ── Write .env ───────────────────────────────────────────────────────────────

if "%FLIC_IP%"=="" (
    echo DEMO_MODE=true> .env
    set MODE_LABEL=DEMO MODE
) else (
    echo FLIC_HUB_HOST=%FLIC_IP%> .env
    set MODE_LABEL=Flic Hub at %FLIC_IP%
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
