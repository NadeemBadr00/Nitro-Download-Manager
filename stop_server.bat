@echo off
title ⚡ Nitro DM - Stop Server
color 0c
echo Stopping Nitro DM server processes...

for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Terminating PID: %%a
    taskkill /f /pid %%a >nul 2>nul
)

echo.
echo [SUCCESS] Nitro DM server stopped!
timeout /t 2 >nul
