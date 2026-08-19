@echo off
title ⚡ Nitro Download Manager (NDM Pro)
color 0b
echo =======================================================
echo    ⚡ NITRO DOWNLOAD MANAGER (NDM PRO) SERVER ⚡
echo =======================================================
echo.
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% equ 0 (
    echo Starting NDM server on http://localhost:3000 ...
    node server/server.js
) else (
    if exist "C:\Program Files\Microsoft Visual Studio\18\Insiders\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe" (
        echo Starting NDM server using Visual Studio Node.js ...
        "C:\Program Files\Microsoft Visual Studio\18\Insiders\MSBuild\Microsoft\VisualStudio\NodeJs\node.exe" server/server.js
    ) else (
        echo [ERROR] Node.js not found! Please install Node.js.
        pause
    )
)
pause
