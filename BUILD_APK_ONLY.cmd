@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo GreetSync - Build APK against the verified Render and Supabase deployment
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SETUP_PRODUCTION_AND_BUILD.ps1" -SkipRenderDeploy %*
set "RC=%ERRORLEVEL%"
pause
endlocal & exit /b %RC%
