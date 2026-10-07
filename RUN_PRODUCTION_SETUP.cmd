@echo off
setlocal
cd /d "%~dp0"
echo.
echo ============================================================
echo  GreetSync Production Setup
echo ============================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0SETUP_PRODUCTION_AND_BUILD.ps1"
set "RC=%ERRORLEVEL%"
echo.
if not "%RC%"=="0" (
  echo [ERROR] Production setup stopped with exit code %RC%.
  echo Read the first error above, fix it, then run this file again.
) else (
  echo [SUCCESS] Production backend and APK setup completed.
)
echo.
pause
exit /b %RC%
