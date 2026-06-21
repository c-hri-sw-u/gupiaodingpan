@echo off
title Star Trails Stock Monitor Launcher

echo ==============================================
echo       Starting Star Trails Stock Monitor...
echo ==============================================

:: Check if the Windows execution file exists.
:: If not, it means we need to install/rebuild dependencies for Windows.
if not exist "node_modules\.bin\vite.cmd" (
    echo [System] First launch or platform change detected.
    echo [System] Installing required Windows components, please wait 1-2 minutes...
    call npm install
    echo [System] Components installed successfully!
)

echo [System] Launching local server and browser...
call npm run dev -- --open
pause
