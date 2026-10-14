@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo GreetSync - Install verified APK and report the Android error
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALL_ANDROID_USB.ps1" %*
set "RC=%ERRORLEVEL%"
pause
endlocal & exit /b %RC%
