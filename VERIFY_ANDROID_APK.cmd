@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo GreetSync - Verify and publish the already-built APK
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0VERIFY_ANDROID_APK.ps1" %*
set "RC=%ERRORLEVEL%"
pause
endlocal & exit /b %RC%
