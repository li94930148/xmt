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
HEALTH_RETRY_ATTEMPTS="${HEALTH_RETRY_ATTEMPTS:-12}"
HEALTH_RETRY_DELAY_SECONDS="${HEALTH_RETRY_DELAY_SECONDS:-2}"
BRANCH="${BRANCH:-main}"
TARGET_SHA_EXPECTED="${TARGET_SHA_EXPECTED:-}"
PREVIOUS_SHA=""
TARGET_SHA=""
BACKUP_FILE=""
DEPLOY_STARTED=0
TOKEN_MIGRATION_RESTORE_REQUIRED=0
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
  if [ ! -f "$DB_PATH" ]; then
    log "ERROR: Database file not found; refusing deploy without backup: $DB_PATH"
    return 1
  fi

  if ! install -d -m 0750 "$BACKUP_DIR"; then
    log "ERROR: Unable to create database backup directory: $BACKUP_DIR"
    return 1
  fi
  local backup_file="$BACKUP_DIR/xmt-$(date +%Y%m%d-%H%M%S)-$$.db"

  log "Backing up database before deploy"
  local lock_directory="${BACKUP_LOCK_PATH}.d"
  if ! mkdir -m 0700 "$lock_directory" 2>/dev/null; then
    if [[ ! -d "$lock_directory" || -L "$lock_directory" ]]; then
      log "ERROR: Database backup lock is busy"
      return 1
    fi
    local owner="$(cat "$lock_directory/owner" 2>/dev/null || true)" owner_pid="" owner_start="" actual_start=""
    IFS=: read -r owner_pid owner_start <<< "$owner"; actual_start="$(process_start_time "$owner_pid")"
    if [[ "$owner_pid" =~ ^[0-9]+$ ]] && { ! kill -0 "$owner_pid" 2>/dev/null || { [[ -n "$owner_start" && -n "$actual_start" && "$owner_start" != "$actual_start" ]]; }; }; then
      if ! rm -rf "$lock_directory" || ! mkdir -m 0700 "$lock_directory"; then
        log "ERROR: Database backup lock recovery failed"
        return 1
      fi
    else
      log "ERROR: Database backup lock is busy"
      return 1
    fi
  fi
  trap 'rm -rf "$lock_directory"' RETURN
  if ! printf '%s:%s\n' "$$" "$(process_start_time "$$")" > "$lock_directory/owner"; then
    log "ERROR: Unable to write database backup lock owner"
    return 1
  fi
  if ! sqlite3 "$DB_PATH" ".backup '$backup_file'"; then
    rm -f "$backup_file"
    log "ERROR: Database backup failed"
    return 1
  fi

  if [ ! -s "$backup_file" ]; then
    rm -f "$backup_file"
    log "ERROR: Database backup is empty"
    return 1
  fi
  if ! sqlite3 "$backup_file" "PRAGMA quick_check;" | grep -qx "ok"; then
    rm -f "$backup_file"
    log "ERROR: Database backup quick_check failed"
    return 1
  fi
  if ! sqlite3 "$backup_file" "SELECT count(*) FROM sqlite_master;" >/dev/null; then
    rm -f "$backup_file"
    log "ERROR: Database backup cannot be opened"
    return 1
  fi
  log "Database backup created: $backup_file"
  BACKUP_FILE="$backup_file"
  rm -rf "$lock_directory"
  trap - RETURN
}

restore_database_backup() {
  if [ -z "$BACKUP_FILE" ] || [ ! -s "$BACKUP_FILE" ]; then
    log "ERROR: Verified rollback backup is unavailable"
    return 1
  fi
  if ! pm2 stop "$PM2_APP"; then
    log "ERROR: Unable to stop $PM2_APP before restoring the pre-migration database"
    return 1
  fi

  local restore_file="${DB_PATH}.rollback.$$"
  if [ -e "$restore_file" ]; then
    log "ERROR: Database restore path already exists: $restore_file"
    return 1
  fi
  if ! cp --preserve=mode -- "$BACKUP_FILE" "$restore_file"; then
    log "ERROR: Unable to stage the verified database rollback backup"
    return 1
  fi
  if [ -e "$DB_PATH" ] && { ! chown --reference="$DB_PATH" "$restore_file" || ! chmod --reference="$DB_PATH" "$restore_file"; }; then
    rm -f -- "$restore_file"
    log "ERROR: Unable to preserve database ownership and permissions during rollback restore"
    return 1
  fi
  if ! sqlite3 "$restore_file" "PRAGMA quick_check;" | grep -qx "ok"; then
    rm -f -- "$restore_file"
    log "ERROR: Staged database rollback backup failed quick_check"
    return 1
  fi
  if [ -n "$(sqlite3 "$restore_file" "PRAGMA foreign_key_check;")" ]; then
    rm -f -- "$restore_file"
    log "ERROR: Staged database rollback backup has foreign key violations"
    return 1
  fi
  if ! rm -f -- "$DB_PATH-wal" "$DB_PATH-shm"; then
    rm -f -- "$restore_file"
    log "ERROR: Unable to remove stopped database sidecars before rollback restore"
    return 1
  fi
  if ! mv -f -- "$restore_file" "$DB_PATH"; then
    rm -f -- "$restore_file"
    log "ERROR: Unable to restore the pre-migration database backup"
    return 1
  fi
  if ! sqlite3 "$DB_PATH" "PRAGMA quick_check;" | grep -qx "ok"; then
    log "ERROR: Restored database failed quick_check"
    return 1
  fi
  if [ -n "$(sqlite3 "$DB_PATH" "PRAGMA foreign_key_check;")" ]; then
    log "ERROR: Restored database has foreign key violations"
    return 1
  fi
  log "Pre-migration database backup restored and verified"
}

rollback_code() {
  local failed_status="${1:-$?}"
  if [ "$DEPLOY_STARTED" -ne 1 ] || [ -z "$PREVIOUS_SHA" ]; then
    exit "$failed_status"
  fi
  trap - ERR
  if [ "$TOKEN_MIGRATION_RESTORE_REQUIRED" -eq 1 ]; then
    log "Deploy failed after token migration; restoring database backup before the previous application"
    if ! restore_database_backup; then
      log "Database rollback failed; leaving $PM2_APP stopped for manual recovery"
      pm2 stop "$PM2_APP" || true
      exit "$failed_status"
    fi
    TOKEN_MIGRATION_RESTORE_REQUIRED=0
  fi
  log "Deploy failed; rolling application code back to $PREVIOUS_SHA"
  if ! git checkout --detach "$PREVIOUS_SHA"; then
    log "Application checkout rollback failed; leaving $PM2_APP stopped"
    pm2 stop "$PM2_APP" || true
    exit "$failed_status"
  fi
  if ! npm ci; then
    log "Application dependency rollback failed; leaving $PM2_APP stopped"
    pm2 stop "$PM2_APP" || true
    exit "$failed_status"
  fi
  if ! pm2 restart "$PM2_APP" --update-env; then
    log "Application restart rollback failed; manual intervention is required"
    exit "$failed_status"
  fi
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
  local health_body attempt
  for ((attempt = 1; attempt <= HEALTH_RETRY_ATTEMPTS; attempt++)); do
    if health_body="$(curl -fsS --max-time 10 "$HEALTH_URL")"; then
      log "Health check succeeded: $health_body"
      return 0
    fi
    if [ "$attempt" -lt "$HEALTH_RETRY_ATTEMPTS" ]; then
      log "Health check is not ready (attempt $attempt/$HEALTH_RETRY_ATTEMPTS); waiting ${HEALTH_RETRY_DELAY_SECONDS}s"
      sleep "$HEALTH_RETRY_DELAY_SECONDS"
    fi
  done

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

run_token_encryption_migration() {
  if ! node -e "const scripts=require('./package.json').scripts||{};process.exit(scripts['migrate:douyin-token-encryption']?0:1)"; then
    log "Target has no Douyin token encryption migration; skipping token migration"
    return 0
  fi

  local dry_run_result legacy_token_count
  log "Checking for legacy Douyin tokens before stopping the service"
  if ! dry_run_result="$(npm run --silent migrate:douyin-token-encryption)"; then
    log "ERROR: Douyin token migration dry-run failed"
    rollback_code 1
  fi
  log "Douyin token dry-run result: $dry_run_result"
  if ! legacy_token_count="$(printf '%s' "$dry_run_result" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const r=JSON.parse(s);if(!Number.isSafeInteger(r.encryptedTokens)||r.encryptedTokens<0)throw new Error();process.stdout.write(String(r.encryptedTokens))}catch{console.error('Invalid sanitized token dry-run result');process.exit(1)}})")"; then
    log "ERROR: Unable to read the sanitized token dry-run count"
    rollback_code 1
  fi
  if [ "$legacy_token_count" -eq 0 ]; then
    log "No legacy Douyin tokens need migration"
    return 0
  fi

  log "Stopping PM2 before the token migration"
  if ! pm2 stop "$PM2_APP"; then
    log "ERROR: Unable to stop $PM2_APP before the token migration"
    rollback_code 1
  fi
  if ! backup_database; then
    log "ERROR: Unable to create a quiesced database backup before the token migration"
    rollback_code 1
  fi
  log "Running Restore Drill on the quiesced token migration backup"
  if ! npm run ops:backup-restore-drill -- --backup="$BACKUP_FILE"; then
    log "ERROR: Quiesced token migration backup Restore Drill failed"
    rollback_code 1
  fi
  log "Rechecking token data after stopping the service"
  if ! dry_run_result="$(npm run --silent migrate:douyin-token-encryption)"; then
    log "ERROR: Quiesced Douyin token migration dry-run failed"
    rollback_code 1
  fi
  log "Quiesced Douyin token dry-run result: $dry_run_result"
  if ! legacy_token_count="$(printf '%s' "$dry_run_result" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const r=JSON.parse(s);if(!Number.isSafeInteger(r.encryptedTokens)||r.encryptedTokens<0)throw new Error();process.stdout.write(String(r.encryptedTokens))}catch{console.error('Invalid sanitized token dry-run result');process.exit(1)}})")"; then
    log "ERROR: Unable to read the quiesced token dry-run count"
    rollback_code 1
  fi
  if [ "$legacy_token_count" -eq 0 ]; then
    log "No legacy Douyin tokens remain after the quiesced dry-run"
    return 0
  fi

  TOKEN_MIGRATION_RESTORE_REQUIRED=1
  log "Applying the backup-protected Douyin token migration"
  if ! npm run migrate:douyin-token-encryption -- --apply --backup="$BACKUP_FILE"; then
    log "ERROR: Douyin token migration apply failed"
    rollback_code 1
  fi
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
[[ "$HEALTH_RETRY_ATTEMPTS" =~ ^[1-9][0-9]*$ ]] || fail "HEALTH_RETRY_ATTEMPTS must be a positive integer"
[[ "$HEALTH_RETRY_DELAY_SECONDS" =~ ^[0-9]+$ ]] || fail "HEALTH_RETRY_DELAY_SECONDS must be a non-negative integer"

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

if ! pm2 describe "$PM2_APP" >/dev/null; then
  log "ERROR: PM2 app not found: $PM2_APP"
  rollback_code 1
fi
run_token_encryption_migration

log "Restarting PM2 app: $PM2_APP"
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

log "Removing development-only dependencies after all build and runtime checks"
if ! npm prune --omit=dev; then rollback_code 1; fi
if ! npm ls --omit=dev --depth=0 >/dev/null; then rollback_code 1; fi

TOKEN_MIGRATION_RESTORE_REQUIRED=0
DEPLOY_STARTED=0
trap - ERR
log "Deploy completed successfully"
