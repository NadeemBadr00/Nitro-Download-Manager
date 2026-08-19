@echo off
title ⚡ Nitro DM - Auto-Start Setup
color 0a
echo =======================================================
echo    ⚡ NITRO DOWNLOAD MANAGER - AUTO-START SETUP ⚡
echo =======================================================
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "TARGET_VBS=%~dp0start_silent.vbs"
set "SHORTCUT_VBS=%TEMP%\CreateShortcut.vbs"

echo Creating Auto-Start shortcut in Windows Startup folder...
echo.

echo Set oWS = WScript.CreateObject("WScript.Shell") > "%SHORTCUT_VBS%"
echo sLinkFile = "%STARTUP_FOLDER%\NitroDownloadManager.lnk" >> "%SHORTCUT_VBS%"
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> "%SHORTCUT_VBS%"
echo oLink.TargetPath = "wscript.exe" >> "%SHORTCUT_VBS%"
echo oLink.Arguments = """%TARGET_VBS%""" >> "%SHORTCUT_VBS%"
echo oLink.WorkingDirectory = "%~dp0" >> "%SHORTCUT_VBS%"
echo oLink.Description = "Nitro Download Manager Background Engine" >> "%SHORTCUT_VBS%"
echo oLink.Save >> "%SHORTCUT_VBS%"

cscript /nologo "%SHORTCUT_VBS%"
del "%SHORTCUT_VBS%"

echo [SUCCESS] Nitro DM will now start automatically whenever you turn on Windows!
echo [INFO] It runs silently in the background with 0 windows and 0 clutter.
echo.
pause
