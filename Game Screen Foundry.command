#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="${HOME}/Library/Logs/Game Screen Foundry"
LOG_FILE="${LOG_DIR}/launcher.log"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:${PATH}"
cd "${ROOT_DIR}"
mkdir -p "${LOG_DIR}"

trap 'code=$?; if [ "${code}" -ne 0 ]; then echo "Game Screen Foundry failed to start. See ${LOG_FILE} for details."; read -r -p "Press Return to close this window." _; fi' EXIT

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js 20 or newer, then open this file again."
  exit 1
fi

if ! node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1);"; then
  echo "The desktop app requires Node.js 22.12 or newer because Electron 43 requires it."
  echo "Current Node.js: $(node -v)"
  exit 1
fi

if [ ! -d "node_modules/electron" ]; then
  echo "Installing desktop dependencies. This is only needed the first time..."
  npm install
fi

echo "Starting Game Screen Foundry..."
nohup npm run desktop >> "${LOG_FILE}" 2>&1 &
echo "Game Screen Foundry is starting. You can close this window."
