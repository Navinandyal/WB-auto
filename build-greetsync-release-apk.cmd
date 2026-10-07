@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "ROOT=%CD%"
set "MOBILE=%ROOT%\mobile"
set "BUILD_API_URL=%~1"

if not defined BUILD_API_URL if defined API_BASE_URL set "BUILD_API_URL=%API_BASE_URL%"

if not defined BUILD_API_URL (
  echo.
  echo ============================================================
  echo   GreetSync - Release APK Builder
  echo ============================================================
  echo.
  echo Release builds keep Android cleartext HTTP disabled for security.
  echo Enter the public HTTPS URL of the GreetSync backend.
  echo Example: https://api.yourdomain.com
  echo.
  set /p "BUILD_API_URL=Backend HTTPS URL: "
)

if not defined BUILD_API_URL (
  echo [ERROR] A backend HTTPS URL is required for a release APK.
  pause
  exit /b 1
)

echo "%BUILD_API_URL%" | findstr /B /I /C:"https://" >nul
if errorlevel 1 (
  echo [ERROR] Release API_BASE_URL must start with https://
  echo For local USB development use run-greetsync-android-dev.cmd instead.
  pause
  exit /b 1
)

where flutter >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Flutter is not in PATH.
  pause
  exit /b 1
)

if not exist "%MOBILE%\pubspec.yaml" (
  echo [ERROR] Mobile project not found at %MOBILE%
  pause
  exit /b 1
)

pushd "%MOBILE%"

echo [1/5] Stopping old Gradle processes...
if exist "android\gradlew.bat" call android\gradlew.bat --stop >nul 2>&1

echo [2/5] Removing stale project build caches...
if exist "build" rmdir /s /q "build"
if exist "android\.gradle" rmdir /s /q "android\.gradle"
call flutter clean
if errorlevel 1 goto :fail

echo [3/5] Resolving Flutter dependencies...
call flutter pub get
if errorlevel 1 goto :fail

echo [4/5] Building release APK for %BUILD_API_URL%...
call flutter build apk --release --dart-define=API_BASE_URL=%BUILD_API_URL%
if errorlevel 1 goto :fail

echo [5/5] Build complete.
echo.
echo APK:
echo %MOBILE%\build\app\outputs\flutter-apk\app-release.apk
echo.
popd
pause
exit /b 0

:fail
echo.
echo [ERROR] Release build failed. Scroll above for the first error line.
popd
pause
exit /b 1
