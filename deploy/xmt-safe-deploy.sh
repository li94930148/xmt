#!/usr/bin/env bash
set -Eeuo pipefail

# XMT safe deploy template.
# Repository template path: deploy/xmt-safe-deploy.sh
# Production install path: /usr/local/bin/xmt-safe-deploy
# Installation requires root privileges.
# Keep production secrets, .env.production, ecosystem.config.cjs, and database backups out of Git.

APP_DIR="${APP_DIR:-/www/wwwroot/xmt}"
DB_PATH="${DB_PATH:-$APP_DIR/data/xmt.db}"
BACKUP_DIR="${BACKUP_DIR:-$APP_DIR/emergency-backup}"
BACKUP_LOCK_PATH="${XMT_BACKUP_LOCK_PATH:-$(dirname "$DB_PATH")/.xmt-backup.lock}"
PM2_APP="${PM2_APP:-xmt-api}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/api/health}"
HOME_URL="${HOME_URL:-http://127.0.0.1:3001/}"
PORT="${PORT:-3001}"
BRANCH="${BRANCH:-main}"
TARGET_SHA_EXPECTED="${TARGET_SHA_EXPECTED:-}"
PREVIOUS_SHA=""
TARGET_SHA=""
BACKUP_FILE=""
DEPLOY_STARTED=0
RUNTIME_ENV_SOURCE=""

log() {
  printf '[xmt-safe-deploy] %s\n' "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

print_diagnostics() {
  log "Diagnostics: PM2 status"
  pm2 status || true

  log "Diagnostics: recent PM2 logs"
  pm2 logs "$PM2_APP" --lines 80 --nostream || true

  log "Diagnostics: port listening on $PORT"
  if command -v ss >/dev/null 2>&1; then
    ss -lntp || true
  else
    netstat -lntp 2>/dev/null || true
  fi

  log "Diagnostics: backend direct health result"
  curl -i -sS --max-time 10 "$HEALTH_URL" || true
  printf '\n'

  log "Diagnostics: backend direct home result"
  curl -i -sS --max-time 10 "$HOME_URL" || true
  printf '\n'
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

process_start_time() {
  awk '{print $22}' "/proc/$1/stat" 2>/dev/null || true
}

backup_database() {
  [ -f "$DB_PATH" ] || fail "Database file not found; refusing deploy without backup: $DB_PATH"

  install -d -m 0750 "$BACKUP_DIR"
  local backup_file="$BACKUP_DIR/xmt-$(date +%Y%m%d-%H%M%S)-$$.db"

  log "Backing up database before deploy"
  local lock_directory="${BACKUP_LOCK_PATH}.d"
  if ! mkdir -m 0700 "$lock_directory" 2>/dev/null; then
    [[ -d "$lock_directory" && ! -L "$lock_directory" ]] || fail "Database backup lock is busy"
    local owner="$(cat "$lock_directory/owner" 2>/dev/null || true)" owner_pid owner_start actual_start
    IFS=: read -r owner_pid owner_start <<< "$owner"; actual_start="$(process_start_time "$owner_pid")"
    if [[ "$owner_pid" =~ ^[0-9]+$ ]] && { ! kill -0 "$owner_pid" 2>/dev/null || { [[ -n "$owner_start" && -n "$actual_start" && "$owner_start" != "$actual_start" ]]; }; }; then rm -rf "$lock_directory"; mkdir -m 0700 "$lock_directory" || fail "Database backup lock recovery failed"; else fail "Database backup lock is busy"; fi
  fi
  trap 'rm -rf "$lock_directory"' RETURN
  printf '%s:%s\n' "$$" "$(process_start_time "$$")" > "$lock_directory/owner"
  sqlite3 "$DB_PATH" ".backup '$backup_file'" || fail "Database backup failed"

  [ -s "$backup_file" ] || fail "Database backup is empty: $backup_file"
  sqlite3 "$backup_file" "PRAGMA quick_check;" | grep -qx "ok" || fail "Database backup quick_check failed: $backup_file"
  sqlite3 "$backup_file" "SELECT count(*) FROM sqlite_master;" >/dev/null || fail "Database backup cannot be opened: $backup_file"
  log "Database backup created: $backup_file"
  BACKUP_FILE="$backup_file"
  rm -rf "$lock_directory"
  trap - RETURN
}

rollback_code() {
  local failed_status="${1:-$?}"
  if [ "$DEPLOY_STARTED" -ne 1 ] || [ -z "$PREVIOUS_SHA" ]; then
    exit "$failed_status"
  fi
  trap - ERR
  log "Deploy failed; rolling application code back to $PREVIOUS_SHA (database is intentionally not rolled back)"
  git checkout --detach "$PREVIOUS_SHA" || true
  npm ci || true
  pm2 restart "$PM2_APP" --update-env || true
  pm2 save || true
  if check_health && check_home_fallback; then
    log "Application code rollback completed and health checks passed"
  else
    log "Application rollback could not be verified; manual intervention is required"
  fi
  exit "$failed_status"
}

restore_worktree_without_restart() {
  log "Preparation failed; restoring checked-out files to $PREVIOUS_SHA without restarting the live application"
  git checkout --detach "$PREVIOUS_SHA" || true
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

check_home_fallback() {
  log "Checking backend home fallback: $HOME_URL"
  curl -fsS --max-time 10 "$HOME_URL" >/dev/null
}

prepare_runtime_environment() {
  local runtime_env_file node_env
  runtime_env_file="$(pm2 jlist | node -e "let s='';const n='$PM2_APP';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s).find(x=>x.name===n);process.stdout.write(String(p?.pm2_env?.env?.XMT_RUNTIME_ENV_FILE||''))})")"
  node_env="$(pm2 jlist | node -e "let s='';const n='$PM2_APP';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s).find(x=>x.name===n);process.stdout.write(String(p?.pm2_env?.env?.NODE_ENV||''))})")"
  if [ "$node_env" = "production" ] && [ -z "$runtime_env_file" ]; then fail "Production requires XMT_RUNTIME_ENV_FILE as the authoritative runtime configuration source"; fi
  [ -n "$runtime_env_file" ] || return 0
  export XMT_RUNTIME_ENV_FILE="$runtime_env_file"
  RUNTIME_ENV_SOURCE="runtime_env_file"
}

require_command git
require_command npm
require_command pm2
require_command curl
require_command systemctl
require_command sqlite3

[ "$(id -u)" -eq 0 ] || fail "Run as root so the production script can manage app files and PM2 safely"
[ -d "$APP_DIR" ] || fail "APP_DIR does not exist: $APP_DIR"
[ -d "$APP_DIR/.git" ] || fail "APP_DIR is not a Git checkout: $APP_DIR"
[[ "$TARGET_SHA_EXPECTED" =~ ^[0-9a-f]{40}$ ]] || fail "Set TARGET_SHA_EXPECTED to the exact 40-character target commit"

cd "$APP_DIR"
pm2 jlist | node -e "let s='';const n='$PM2_APP';process.stdin.on('data',d=>s+=d).on('end',()=>{const p=JSON.parse(s).filter(x=>x.name===n);if(p.length!==1){console.error('Expected exactly one PM2 app instance, found '+p.length);process.exit(1)}})" || fail "Single-instance runtime gate failed"
backup_database

PREVIOUS_SHA="$(git rev-parse HEAD)"
log "Previous application commit: $PREVIOUS_SHA"

log "Fetching and updating code"
git fetch origin "$BRANCH" || fail "Unable to fetch target branch"
RESOLVED_TARGET_SHA="$(git rev-parse "origin/$BRANCH")"
[ "$RESOLVED_TARGET_SHA" = "$TARGET_SHA_EXPECTED" ] || fail "Target branch does not match TARGET_SHA_EXPECTED"
git checkout "$BRANCH" || fail "Unable to check out target branch"
if ! git merge --ff-only "$RESOLVED_TARGET_SHA"; then restore_worktree_without_restart; fail "Unable to fast-forward target branch"; fi
TARGET_SHA="$(git rev-parse HEAD)"
[ "$TARGET_SHA" = "$TARGET_SHA_EXPECTED" ] || { restore_worktree_without_restart; fail "Checked-out target does not match TARGET_SHA_EXPECTED"; }
log "Target application commit: $TARGET_SHA"

log "Installing target dependencies without restarting the live application"
if ! npm ci; then restore_worktree_without_restart; fail "Dependency installation failed"; fi

log "Checking target version consistency before service restart"
if ! npm run version:check; then restore_worktree_without_restart; fail "Version consistency gate failed"; fi

log "Checking authoritative runtime environment before service restart"
prepare_runtime_environment
if ! npm run ops:runtime-env-check; then restore_worktree_without_restart; fail "Runtime environment gate failed"; fi

log "Running non-destructive restore drill for deployment backup"
if ! npm run ops:backup-restore-drill -- --backup="$BACKUP_FILE"; then restore_worktree_without_restart; fail "Deployment backup restore drill failed"; fi

log "Checking migration rollback compatibility before service restart"
if ! npm run migration:check; then restore_worktree_without_restart; fail "Migration compatibility gate did not return GO"; fi

log "Running target verification before service restart"
if ! npm run check || ! npm run build; then restore_worktree_without_restart; fail "Target verification failed"; fi

DEPLOY_STARTED=1
trap rollback_code ERR

log "Restarting PM2 app: $PM2_APP"
pm2 describe "$PM2_APP" >/dev/null || fail "PM2 app not found: $PM2_APP"
pm2 restart "$PM2_APP" --update-env
pm2 save

log "Reloading Caddy"
systemctl reload caddy

log "Waiting for backend restart"
sleep 3

if ! check_health; then
  log "Deploy failed because /api/health did not pass"
  rollback_code 1
fi

if ! check_home_fallback; then
  log "Deploy failed because backend home fallback did not pass"
  rollback_code 1
fi

log "Reading back effective runtime configuration after restart"
if ! XMT_EXPECTED_RUNTIME_SOURCE="$RUNTIME_ENV_SOURCE" npm run ops:runtime-env-readback; then rollback_code 1; fi

log "Checking public internal route exposure"
if ! npm run ops:internal-exposure-check; then rollback_code 1; fi

log "Deploy completed successfully"
