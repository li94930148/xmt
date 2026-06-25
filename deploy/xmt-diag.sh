#!/usr/bin/env bash
set -uo pipefail

# XMT production diagnostics template.
# Repository template path: deploy/xmt-diag.sh
# Production install path: /usr/local/bin/xmt-diag
# Installation requires root privileges.
# This script is read-only: it must not modify code, database, PM2, Caddy, or files.
# Do not print .env.production, real secrets, database contents, or private user data.

APP_DIR="${APP_DIR:-/www/wwwroot/xmt}"
DB_PATH="${DB_PATH:-$APP_DIR/data/xmt.db}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/emergency-backup}"
PM2_APP="${PM2_APP:-xmt-api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/health}"
HOME_URL="${HOME_URL:-http://127.0.0.1:3001/}"

section() {
  printf '\n[xmt-diag] %s\n' "$*"
}

run() {
  "$@" || printf '[xmt-diag] command failed: %s\n' "$*"
}

section "Current time"
date -Is || date

section "Git status"
if [ -d "$APP_DIR/.git" ]; then
  (
    cd "$APP_DIR" || exit 1
    run git branch --show-current
    run git log -1 --oneline
    run git status --short
  )
else
  printf 'Git checkout not found: %s\n' "$APP_DIR"
fi

section "PM2 status"
run pm2 status

section "Recent xmt-api PM2 logs"
run pm2 logs "$PM2_APP" --lines 80 --nostream

section "Listening ports 80 / 443 / 3001"
if command -v ss >/dev/null 2>&1; then
  ss -lntp 2>/dev/null | awk 'NR == 1 || /:80[[:space:]]/ || /:443[[:space:]]/ || /:3001[[:space:]]/' || true
else
  netstat -lntp 2>/dev/null | awk 'NR == 1 || /:80[[:space:]]/ || /:443[[:space:]]/ || /:3001[[:space:]]/' || true
fi

section "Backend direct home"
run curl -i -sS --max-time 10 "$HOME_URL"
printf '\n'

section "Backend direct health"
run curl -i -sS --max-time 10 "$HEALTH_URL"
printf '\n'

section "Caddy status"
run systemctl status caddy --no-pager

section "Recent Caddy logs"
run journalctl -u caddy -n 80 --no-pager

section "Database file"
if [ -f "$DB_PATH" ]; then
  ls -lh "$DB_PATH" 2>/dev/null || stat "$DB_PATH"
else
  printf 'Database file not found: %s\n' "$DB_PATH"
fi

section "Recent database backups"
if [ -d "$BACKUP_DIR" ]; then
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'xmt-*.db*' -printf '%TY-%Tm-%Td %TH:%TM %s %p\n' 2>/dev/null |
    sort -r |
    head -n 10 || true
else
  printf 'Backup directory not found: %s\n' "$BACKUP_DIR"
fi

section "Diagnostics completed"