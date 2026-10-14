@echo off
setlocal EnableExtensions
cd /d "%~dp0"
where railway.cmd >nul 2>&1
if errorlevel 1 (
  call npm install -g @railway/cli
  if errorlevel 1 exit /b 1
)
echo This one-time login is only needed on a new PC or after login expires.
call railway.cmd login
set "RC=%ERRORLEVEL%"
pause
endlocal & exit /b %RC%
