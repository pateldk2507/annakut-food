#!/usr/bin/env bash

set -Eeuo pipefail

APP_NAME="annakut"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLIENT_ENV="$ROOT_DIR/client/.env"
SERVER_ENV="$ROOT_DIR/server/.env"

fail() {
  printf 'Deployment error: %s\n' "$1" >&2
  exit 1
}

command -v node >/dev/null 2>&1 || fail "Node.js is not installed."
command -v npm >/dev/null 2>&1 || fail "npm is not installed."
command -v pm2 >/dev/null 2>&1 || fail "PM2 is not installed. Run: sudo npm install -g pm2"
command -v curl >/dev/null 2>&1 || fail "curl is not installed."

[[ -f "$CLIENT_ENV" ]] || fail "Missing client/.env"
[[ -f "$SERVER_ENV" ]] || fail "Missing server/.env"

for variable in VITE_FIREBASE_API_KEY VITE_FIREBASE_AUTH_DOMAIN VITE_FIREBASE_PROJECT_ID VITE_FIREBASE_APP_ID; do
  grep -Eq "^${variable}=.+" "$CLIENT_ENV" || fail "Missing ${variable} in client/.env"
done

for variable in FIREBASE_DATABASE_URL FIREBASE_PROJECT_ID FIREBASE_CLIENT_EMAIL FIREBASE_PRIVATE_KEY; do
  grep -Eq "^${variable}=.+" "$SERVER_ENV" || fail "Missing ${variable} in server/.env"
done

printf 'Installing client dependencies...\n'
npm ci --prefix "$ROOT_DIR/client"

printf 'Building React client...\n'
npm run build --prefix "$ROOT_DIR/client"
[[ -f "$ROOT_DIR/client/dist/index.html" ]] || fail "The React build did not create client/dist/index.html"

printf 'Installing production server dependencies...\n'
npm ci --omit=dev --prefix "$ROOT_DIR/server"

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  printf 'Replacing the existing %s process to enforce the correct working directory...\n' "$APP_NAME"
  pm2 delete "$APP_NAME"
fi

printf 'Starting %s...\n' "$APP_NAME"
pm2 start src/index.js --name "$APP_NAME" --cwd "$ROOT_DIR/server"

pm2 save

PORT_VALUE="$(sed -n 's/^PORT=//p' "$SERVER_ENV" | tail -n 1 | tr -d '"\r')"
PORT_VALUE="${PORT_VALUE:-3001}"
LOCAL_URL="http://127.0.0.1:${PORT_VALUE}"

printf 'Checking Node server health...\n'
server_ready=false
for _attempt in {1..10}; do
  if curl --fail --silent --show-error --max-time 5 "$LOCAL_URL/api/health" >/dev/null; then
    server_ready=true
    break
  fi
  sleep 2
done
[[ "$server_ready" == "true" ]] || fail "PM2 is running, but $LOCAL_URL/api/health is not responding. Run: pm2 logs $APP_NAME"

printf 'Checking Firebase menu access...\n'
MENU_RESPONSE="$(curl --fail --silent --show-error --max-time 30 "$LOCAL_URL/api/menu")" || fail "The menu API could not reach Firebase. Run: pm2 logs $APP_NAME"
[[ "$MENU_RESPONSE" == *'"categories"'* ]] || fail "The menu API returned an unexpected response instead of menu JSON."

printf 'Deployment complete.\n'
pm2 status "$APP_NAME"
