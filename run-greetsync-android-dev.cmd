@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem ============================================================
rem GreetSync - One Click Android Development Runner
rem Place this file in the PROJECT ROOT (same folder as package.json)
rem and double-click it, or run it from CMD.
rem ============================================================

cd /d "%~dp0"
set "ROOT=%CD%"
set "MOBILE=%ROOT%\mobile"
set "BACKEND_PORT=3000"
set "API_BASE_URL=http://127.0.0.1:3000"

echo.
echo ============================================================
echo   GreetSync Android Development Runner
echo ============================================================
echo Project: %ROOT%
echo.

rem ---------- Validate project structure ----------
if not exist "%ROOT%\package.json" (
  echo [ERROR] package.json was not found in:
  echo         %ROOT%
  echo.
  echo Put this CMD file in the GreetSync project root folder.
  pause
  exit /b 1
)

if not exist "%MOBILE%\pubspec.yaml" (
  echo [ERROR] Flutter mobile project was not found at:
  echo         %MOBILE%
  pause
  exit /b 1
)

rem ---------- Find required commands ----------
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  echo Install Node.js and reopen this terminal.
  pause
  exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found in PATH.
  pause
  exit /b 1
)

where flutter >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Flutter was not found in PATH.
  echo Add C:\flutter\bin to PATH and try again.
  pause
  exit /b 1
)

set "ADB="
for /f "delims=" %%A in ('where adb 2^>nul') do (
  if not defined ADB set "ADB=%%A"
)

if not defined ADB (
  if exist "%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe" (
    set "ADB=%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe"
  )
)

if not defined ADB (
  echo [ERROR] adb.exe was not found.
  echo Expected it in PATH or:
  echo %LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe
  pause
  exit /b 1
)

echo [OK] ADB: %ADB%

rem ---------- Install backend dependencies if needed ----------
if not exist "%ROOT%\node_modules" (
  echo.
  echo [1/6] Installing backend dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
) else (
  echo.
  echo [1/6] Backend dependencies already installed.
)

rem ---------- Start backend only if port 3000 is not already responding ----------
echo.
echo [2/6] Checking backend on port %BACKEND_PORT%...
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:%BACKEND_PORT%/api/health' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }"
if errorlevel 1 (
  echo Backend is not running. Starting it in a new window...
  start "GreetSync Backend" cmd /k "cd /d ""%ROOT%"" ^&^& set NODE_ENV=development ^&^& npm run dev"

  echo Waiting for backend to become ready...
  set "BACKEND_READY=0"
  for /L %%I in (1,1,30) do (
    if "!BACKEND_READY!"=="0" (
      powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:%BACKEND_PORT%/api/health' -TimeoutSec 2; if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
      if not errorlevel 1 (
        set "BACKEND_READY=1"
      ) else (
        timeout /t 1 /nobreak >nul
      )
    )
  )

  if "!BACKEND_READY!"=="0" (
    echo.
    echo [ERROR] Backend did not become ready within 30 seconds.
    echo Check the "GreetSync Backend" window for the actual backend/database error.
    pause
    exit /b 1
  )
) else (
  echo Backend is already running.
)

echo [OK] Backend is reachable at %API_BASE_URL%

rem ---------- Optional Meta/Facebook HTTPS tunnel ----------
echo.
echo [META] Checking local HTTPS tunnel for Meta Embedded Signup...
set "META_TUNNEL_URL="
set "NGROK_EXE="
for /f "delims=" %%N in ('where ngrok 2^>nul') do (
  if not defined NGROK_EXE set "NGROK_EXE=%%N"
)

if defined NGROK_EXE (
  for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; try { $j=Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 2; $u=($j.tunnels ^| Where-Object { $_.public_url -like 'https://*' } ^| Select-Object -First 1).public_url; if($u){Write-Output $u} } catch {}"`) do set "META_TUNNEL_URL=%%U"

  if not defined META_TUNNEL_URL (
    echo Starting ngrok HTTPS tunnel for backend port %BACKEND_PORT%...
    start "GreetSync Meta Tunnel" /min "%NGROK_EXE%" http %BACKEND_PORT%
    for /L %%I in (1,1,20) do (
      if not defined META_TUNNEL_URL (
        timeout /t 1 /nobreak >nul
        for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "$ErrorActionPreference='SilentlyContinue'; try { $j=Invoke-RestMethod 'http://127.0.0.1:4040/api/tunnels' -TimeoutSec 2; $u=($j.tunnels ^| Where-Object { $_.public_url -like 'https://*' } ^| Select-Object -First 1).public_url; if($u){Write-Output $u} } catch {}"`) do set "META_TUNNEL_URL=%%U"
      )
    )
  )

  if defined META_TUNNEL_URL (
    echo [OK] Meta HTTPS tunnel: !META_TUNNEL_URL!
    echo      GreetSync backend auto-detects this URL from ngrok.
  ) else (
    echo [WARN] ngrok is installed but no HTTPS tunnel was detected.
    echo        Run: ngrok http %BACKEND_PORT%
  )
) else (
  echo [WARN] ngrok is not installed/in PATH.
  echo        Normal GreetSync app development will still run.
  echo        Meta/Facebook Embedded Signup requires HTTPS.
  echo        Install ngrok once, authenticate it, then run this CMD again.
  echo        After installation, this runner starts and detects the tunnel automatically.
)

rem ---------- Detect connected Android device ----------
echo.
echo [3/6] Detecting connected Android device...
"%ADB%" start-server >nul 2>&1

set "DEVICE_ID="
set "ADB_LIST_FILE=%TEMP%\greetsync_adb_devices_%RANDOM%.txt"
"%ADB%" devices > "%ADB_LIST_FILE%" 2>nul

for /f "usebackq skip=1 tokens=1,2" %%A in ("%ADB_LIST_FILE%") do (
  if /I "%%B"=="device" (
    if not defined DEVICE_ID set "DEVICE_ID=%%A"
  )
)

if exist "%ADB_LIST_FILE%" del /q "%ADB_LIST_FILE%" >nul 2>&1

if not defined DEVICE_ID (
  echo [ERROR] No authorized Android device was found.
  echo.
  "%ADB%" devices
  echo.
  echo Connect the phone by USB, enable USB debugging, and accept the RSA prompt.
  pause
  exit /b 1
)

echo [OK] Device: %DEVICE_ID%

rem ---------- ADB reverse ----------
echo.
echo [4/6] Forwarding phone localhost:%BACKEND_PORT% to PC localhost:%BACKEND_PORT%...
"%ADB%" -s "%DEVICE_ID%" reverse tcp:%BACKEND_PORT% tcp:%BACKEND_PORT%
if errorlevel 1 (
  echo [ERROR] adb reverse failed.
  pause
  exit /b 1
)

echo [OK] ADB reverse configured.

rem ---------- Flutter dependencies / stale Kotlin cache cleanup ----------
echo.
echo [5/6] Preparing Flutter application...
pushd "%MOBILE%"

rem Stop any Gradle daemon left by an interrupted build.
if exist "android\gradlew.bat" call android\gradlew.bat --stop >nul 2>&1

rem The Kotlin incremental-cache error in url_launcher/flutter_contacts/webview builds
rem is caused by stale project build caches on Windows. Remove only project-local
rem generated caches; the global Gradle/Pub download caches are preserved.
if exist "build" rmdir /s /q "build"
if exist "android\.gradle" rmdir /s /q "android\.gradle"
call flutter clean
if errorlevel 1 (
  popd
  echo [ERROR] flutter clean failed.
  pause
  exit /b 1
)

call flutter pub get
if errorlevel 1 (
  popd
  echo [ERROR] flutter pub get failed.
  pause
  exit /b 1
)

rem ---------- Run app ----------
echo.
echo [6/6] Starting GreetSync on %DEVICE_ID%...
echo API: %API_BASE_URL%
echo.
echo Keep this window open while Flutter is running.
echo Press Ctrl+C to stop Flutter. The backend runs in its own window.
echo.

call flutter run -d "%DEVICE_ID%" --dart-define=API_BASE_URL=%API_BASE_URL%
set "FLUTTER_EXIT=%ERRORLEVEL%"
popd

if not "%FLUTTER_EXIT%"=="0" (
  echo.
  echo [ERROR] Flutter exited with code %FLUTTER_EXIT%.
  pause
  exit /b %FLUTTER_EXIT%
)

endlocal
