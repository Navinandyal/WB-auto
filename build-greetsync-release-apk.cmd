@echo off
setlocal EnableExtensions
cd /d "%~dp0"
rem Legacy release command now uses the same verified, account-free APK workflow.
set "BUILD_API_URL=%~1"
if not defined BUILD_API_URL if defined API_BASE_URL set "BUILD_API_URL=%API_BASE_URL%"
if defined BUILD_API_URL (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SETUP_PRODUCTION_AND_BUILD.ps1" -SkipRailwayDeploy -KnownBackendUrl "%BUILD_API_URL%"
) else (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SETUP_PRODUCTION_AND_BUILD.ps1" -SkipRailwayDeploy
)
set "RC=%ERRORLEVEL%"
pause
endlocal & exit /b %RC%
