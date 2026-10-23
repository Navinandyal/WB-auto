@echo off
call "%~dp0BUILD_APK_ONLY.cmd" %*
exit /b %ERRORLEVEL%
