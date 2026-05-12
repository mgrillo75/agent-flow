@echo off
REM Double-click launcher: prepares the latest viewer from this repo folder, opens it in your browser, and shuts down when you close this window.

setlocal EnableExtensions

title Agent Flow

cd /d "%~dp0"

set "AGENT_FLOW_TELEMETRY=false"
set "AGENT_FLOW_RUNTIME=codex"
set "AGENT_FLOW_CODEX_WORKSPACE=all"
set "CODEX_HOME=%USERPROFILE%\.codex"
set "AGENT_FLOW_URL=http://127.0.0.1:3002"
set "AF_PORT=3002"

where.exe node.exe >nul 2>nul
if errorlevel 1 (
  echo Install Node.js from https://nodejs.org/ ^(tick "Add to PATH"^)^, sign out/in if prompted^, then double-click again.
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort %AF_PORT% -State Listen -ErrorAction SilentlyContinue; if ($listener) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  echo Already running — bringing it to front in your browser.
  start "" "%AGENT_FLOW_URL%"
  exit /b 0
)

where.exe corepack.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js Corepack wasn't found — reinstall/update Node.js, then double-click again.
  echo.
  pause
  exit /b 1
)

call corepack.cmd enable pnpm >nul 2>nul
if errorlevel 1 (
  echo Couldn't prepare the package manager. Try reopening Command Prompt once, then double-click again.
  echo.
  pause
  exit /b 1
)

echo Updating Agent Flow...
echo.
if not exist "node_modules" (
  call corepack.cmd pnpm install
  if errorlevel 1 (
    echo Installing dependencies didn't finish — fix any errors shown above, then double-click again.
    echo.
    pause
    exit /b 1
  )
)

call corepack.cmd pnpm run build:app
if errorlevel 1 (
  echo Build stopped with an error — fix any messages shown above, then double-click again.
  echo.
  pause
  exit /b 1
)

if not exist "app\dist\app.js" (
  echo Build finished but didn't produce app\dist\app.js — check errors above or open an issue with the Agent Flow repo.
  echo.
  pause
  exit /b 1
)

echo.
echo Starting Agent Flow — your browser will open in a moment.
echo Keep this black window open; closing it stops Agent Flow.
echo.

start "" /b powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process \"%AGENT_FLOW_URL%\""
node.exe app\dist\app.js --port %AF_PORT% --no-open

echo.
echo Agent Flow stopped.
pause
exit /b 0
