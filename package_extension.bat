@echo off
title ⚡ Package Nitro DM Extension for Chrome Web Store
color 0b
echo =======================================================
echo    ⚡ NITRO DM - CHROME WEB STORE PACKAGER ⚡
echo =======================================================
echo.

set "SOURCE_DIR=%~dp0extension"
set "OUTPUT_ZIP=%~dp0Nitro-DM-Extension.zip"

if exist "%OUTPUT_ZIP%" del "%OUTPUT_ZIP%"

echo Compressing extension folder into ZIP...
powershell -Command "Compress-Archive -Path '%SOURCE_DIR%\*' -DestinationPath '%OUTPUT_ZIP%' -Force"

echo.
echo =======================================================
echo [SUCCESS] Chrome Extension Packaged Successfully!
echo Location: %OUTPUT_ZIP%
echo =======================================================
echo.
pause
