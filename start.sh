#!/usr/bin/env bash
# Family Tree Viewer launcher: start the Node server (if needed) and open the default browser.
set -euo pipefail
cd "$(dirname "$0")"
PORT=5180
URL="http://127.0.0.1:${PORT}/"
HEALTH="${URL}api/version"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required. Install it from https://nodejs.org then run ./start.sh again." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies (first run)..."
  npm install
fi

need_build=0
if [[ ! -f dist/index.html ]]; then
  need_build=1
elif find src -type f -newer dist/index.html -print -quit | grep -q .; then
  need_build=1
fi

if [[ ! -f sample/presidents/US_Presidents_2022-11-02.gramps ]]; then
  echo "Downloading public sample trees..."
  npm run fetch-samples || echo "Sample download failed; local tree still works if present." >&2
fi

if [[ "$need_build" -eq 1 ]]; then
  echo "Building app..."
  npm run build
fi

healthy() {
  node --input-type=module -e 'const r=await fetch(process.argv[1],{signal:AbortSignal.timeout(2000)}); const t=await r.text(); if(!r.ok||!t.includes("version")||!t.includes("ingest")) process.exit(1)' "$HEALTH" >/dev/null 2>&1
}

if ! healthy; then
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
  elif command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti tcp:"$PORT" -sTCP:LISTEN || true)
    if [[ -n "${pids}" ]]; then
      kill ${pids} >/dev/null 2>&1 || true
    fi
  fi
  sleep 0.3
  mkdir -p .cache
  nohup node server.mjs >.cache/server.out.log 2>.cache/server.err.log &
fi

ok=0
for _ in $(seq 1 60); do
  if healthy; then
    ok=1
    break
  fi
  sleep 0.25
done
if [[ "$ok" -ne 1 ]]; then
  echo "Family Tree server did not come up on $URL. See .cache/server.err.log." >&2
  exit 1
fi

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "$URL"
fi
echo "Family Tree at $URL"
