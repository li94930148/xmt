#!/usr/bin/env bash
set -Eeuo pipefail

# XMT safe deploy template.
# Production path: /usr/local/bin/xmt-safe-deploy
# Installing or syncing this script to production requires root privileges.
# Keep production secrets, .env.production, ecosystem.config.cjs, and database backups out of Git.

APP_DIR="${APP_DIR:-/www/wwwroot/xmt}"
DB_PATH="${DB_PATH:-$APP_DIR/data/xmt.db}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/emergency-backup}"
PM2_APP="${PM2_APP:-xmt-api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/health}"
HOME_URL="${HOME_URL:-http://127.0.0.1:3001/}"
PORT="${PORT:-3001}"
BRANCH="${BRANCH:-main}"

log() {
  printf '[xmt-safe-deploy] %s\n' "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

print_diagnostics() {
  log "Diagnostics: PM2 status"
  pm2 status "$PM2_APP" || true

  log "Diagnostics: recent PM2 logs"
  pm2 logs "$PM2_APP" --lines 80 --nostream || true

  log "Diagnostics: port listening"
  if command -v ss >/dev/null 2>&1; then
    ss -lntp | grep ":$PORT" || true
  else
    netstat -lntp 2>/dev/null | grep ":$PORT" || true
  fi

  log "Diagnostics: backend direct home fallback"
  curl -fsS --max-time 5 "$HOME_URL" >/dev/null && log "Home fallback succeeded" || log "Home fallback failed"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

backup_database() {
  [ -f "$DB_PATH" ] || fail "Database file not found; refusing deploy without backup: $DB_PATH"

  install -d -m 0750 "$BACKUP_DIR"
  local backup_file="$BACKUP_DIR/xmt-$(date +%Y%m%d-%H%M%S).db"

  log "Backing up database before deploy"
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$DB_PATH" ".backup '$backup_file'"
  else
    cp -p "$DB_PATH" "$backup_file"
  fi

  [ -s "$backup_file" ] || fail "Database backup is empty: $backup_file"
  log "Database backup created: $backup_file"
}

check_health() {
  log "Checking API health: $HEALTH_URL"
  local health_body
  if health_body="$(curl -fsS --max-time 10 "$HEALTH_URL")"; then
    log "Health check succeeded: $health_body"
    return 0
  fi

  log "Health check failed; collecting diagnostics"
  print_diagnostics
  return 1
}

require_command git
require_command npm
require_command pm2
require_command curl

[ "$(id -u)" -eq 0 ] || fail "Run as root so the production script can manage app files and PM2 safely"
[ -d "$APP_DIR" ] || fail "APP_DIR does not exist: $APP_DIR"
[ -d "$APP_DIR/.git" ] || fail "APP_DIR is not a Git checkout: $APP_DIR"

cd "$APP_DIR"
backup_database

log "Fetching and updating code"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

log "Installing dependencies"
npm ci

log "Running local verification"
npm run check
npm run build

log "Restarting PM2 app: $PM2_APP"
pm2 describe "$PM2_APP" >/dev/null || fail "PM2 app not found: $PM2_APP"
pm2 reload "$PM2_APP" --update-env || pm2 restart "$PM2_APP" --update-env

log "Waiting for backend restart"
sleep 3

if ! check_health; then
  fail "Deploy failed because /api/health did not pass"
fi

log "Deploy completed successfully"