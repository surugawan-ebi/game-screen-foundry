@echo off
setlocal

cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo npm was not found. Install Node.js 20 or newer, then open this file again.
  pause
  exit /b 1
)

node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1);"
if errorlevel 1 (
  echo The desktop app requires Node.js 22.12 or newer because Electron 43 requires it.
  node -v
  pause
  exit /b 1
)

if not exist "node_modules\electron" (
  echo Installing desktop dependencies. This is only needed the first time...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

start "Game Screen Foundry" /min cmd /c "npm run desktop"
exit /b 0
