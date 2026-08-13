#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/xmt}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/xmt}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATABASE="${XMT_DB_PATH:-$PROJECT_DIR/data/xmt.db}"
LOCK_PATH="${XMT_BACKUP_LOCK_PATH:-$(dirname "$DATABASE")/.xmt-backup.lock}.d"

if [[ ! -f "$DATABASE" ]]; then
  echo "Database not found: $DATABASE" >&2
  exit 1
fi

install -d -m 0750 "$BACKUP_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)-$$"
temporary="$BACKUP_DIR/.xmt-$timestamp.db"
destination="$BACKUP_DIR/xmt-$timestamp.db.gz"

cleanup() {
  rm -f "$temporary"
  rm -rf "$LOCK_PATH"
}
trap cleanup EXIT

if ! mkdir "$LOCK_PATH" 2>/dev/null; then
  owner="$(cat "$LOCK_PATH/owner" 2>/dev/null || true)"
  if [[ "$owner" =~ ^[0-9]+$ ]] && ! kill -0 "$owner" 2>/dev/null; then rm -rf "$LOCK_PATH"; mkdir "$LOCK_PATH" || exit 75; else
    echo '{"decision":"FAIL","reason":"LOCK_BUSY"}' >&2
    exit 75
  fi
fi
printf '%s\n' "$$" > "$LOCK_PATH/owner"

sqlite3 "$DATABASE" ".timeout 10000" ".backup '$temporary'"
gzip -c "$temporary" > "$destination"
chmod 0640 "$destination"

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'xmt-*.db.gz' \
  -mtime "+$RETENTION_DAYS" -delete

echo "Backup created: $destination"
