#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/opt/xmt}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/xmt}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATABASE="${XMT_DB_PATH:-$PROJECT_DIR/data/xmt.db}"

if [[ ! -f "$DATABASE" ]]; then
  echo "Database not found: $DATABASE" >&2
  exit 1
fi

install -d -m 0750 "$BACKUP_DIR"

timestamp="$(date +%Y%m%d-%H%M%S)"
temporary="$BACKUP_DIR/.xmt-$timestamp.db"
destination="$BACKUP_DIR/xmt-$timestamp.db.gz"

cleanup() {
  rm -f "$temporary"
}
trap cleanup EXIT

sqlite3 "$DATABASE" ".timeout 10000" ".backup '$temporary'"
gzip -c "$temporary" > "$destination"
chmod 0640 "$destination"

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'xmt-*.db.gz' \
  -mtime "+$RETENTION_DAYS" -delete

echo "Backup created: $destination"
