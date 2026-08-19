@echo off
title Nitro Download Manager (NDM Pro)
color 0b
echo =======================================================
echo    ⚡ NITRO DOWNLOAD MANAGER (NDM PRO) SERVER ⚡
echo =======================================================
echo.
cd /d "%~dp0"
echo Starting NDM server on http://localhost:3000 ...
node server/server.js
pause
