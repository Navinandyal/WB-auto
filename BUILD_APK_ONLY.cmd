@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo GreetSync APK Build Only - No Railway Login Required
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SETUP_PRODUCTION_AND_BUILD.ps1" -SkipRailwayDeploy %*
set "RC=%ERRORLEVEL%"
pause
endlocal & exit /b %RC%
