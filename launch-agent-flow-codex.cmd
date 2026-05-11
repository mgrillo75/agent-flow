@echo off
setlocal

title Agent Flow - Codex Only

cd /d "%~dp0"

set "AGENT_FLOW_TELEMETRY=false"
set "AGENT_FLOW_RUNTIME=codex"
set "AGENT_FLOW_CODEX_WORKSPACE=all"
set "CODEX_HOME=C:\Users\MiguelGrillo\.codex"
set "AGENT_FLOW_URL=http://127.0.0.1:3002"

if not exist "app\dist\app.js" (
  echo Agent Flow has not been built yet.
  echo Run this from the repo first:
  echo   corepack.cmd pnpm run build:app
  echo.
  pause
  exit /b 1
)

where node.exe >nul 2>nul
if errorlevel 1 (
  echo node.exe was not found on PATH.
  echo Install Node.js or add it to PATH, then try again.
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue; if ($listener) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  echo Agent Flow is already running at %AGENT_FLOW_URL%
  start "" "%AGENT_FLOW_URL%"
  exit /b 0
)

echo Starting Agent Flow in Codex-only mode...
echo URL: %AGENT_FLOW_URL%
echo CODEX_HOME: %CODEX_HOME%
echo Codex workspace scope: %AGENT_FLOW_CODEX_WORKSPACE%
echo.
echo Close this window to stop Agent Flow.
echo.

start "" /b powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process '%AGENT_FLOW_URL%'"
node.exe app\dist\app.js --port 3002 --no-open

echo.
echo Agent Flow stopped.
pause
