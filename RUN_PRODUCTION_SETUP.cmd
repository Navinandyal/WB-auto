@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo GreetSync - Deploy Backend and Build APK Using Saved Railway Login
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SETUP_PRODUCTION_AND_BUILD.ps1" %*
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" (
  echo [ERROR] Setup stopped. Read the first error above.
) else (
  echo [SUCCESS] Setup completed.
)
pause
endlocal & exit /b %RC%
