# Production Runtime Environment

Production uses one authoritative, root-owned runtime environment file, normally
`/etc/xmt/xmt.production.env`. It is not committed to Git and must be a regular,
non-symlink file with mode `0600` (or stricter).

Set `XMT_RUNTIME_ENV_FILE=/etc/xmt/xmt.production.env` in the PM2 application
definition. On startup, XMT loads this file before importing the application and
overrides only application configuration keys: `XMT_*`, `ALLOWED_ORIGINS`,
`CORS_ORIGINS`, `NODE_ENV`, `HOST`, `PORT`, and `TRUST_PROXY`. It never replaces
system values such as `PATH`, `HOME`, or PM2 internals.

For production, the runtime file is mandatory for `xmt-safe-deploy`. If the file
is missing, unsafe, unreadable, malformed, or contains a non-whitelisted key,
startup and deployment fail closed. `.env` remains a development convenience;
do not use it as a production authority. PM2 environment variables take
precedence in dotenv and can otherwise leave a worker with stale configuration.

Production must include an independent `XMT_TOKEN_ENCRYPTION_KEY`: canonical
Base64 for exactly 32 random bytes. Generate it with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
Do not reuse `JWT_SECRET` or `DOUYIN_CLIENT_SECRET`. `api/server.ts` validates
the key after loading the authoritative runtime file and before importing the
application; a missing or malformed key prevents startup.

For first configuration or key rotation, create and verify a SQLite backup,
stop the XMT service so no OAuth token writes occur, then run
`npm run migrate:douyin-token-encryption` for a read-only dry-run. Review only
the sanitized counts. Apply with
`npm run migrate:douyin-token-encryption -- --apply --backup=/absolute/path/to/verified-backup.db`.
The script validates the backup with SQLite `quick_check`, resolves the prior
key source from the current process or the `xmt-api` PM2 environment, migrates
all encrypted token columns in one SQLite write transaction, verifies each
token after encryption, and never prints token or key values. If the legacy
source cannot be read, it refuses to guess. Use
`--legacy-key-source=development-fallback` only after confirming the old
service actually used that exact fallback. If application fails, the transaction rolls back;
if later verification fails, keep the service stopped and restore the verified
pre-migration backup before restarting the previous version. Do not deploy the
new server until the dry-run and migration both pass with the final runtime key.

Use these commands during a controlled deployment, without printing secrets:

```bash
npm run ops:runtime-env-check
npm run ops:runtime-env-readback
npm run ops:internal-exposure-check
```

The first validates the source and sanitized values, the second confirms the
restarted worker's effective configuration through direct loopback, and the last
requires all public `/internal/*` routes to return `404`.

The first Mobile gray user must be a non-admin internal test user. An admin can
only be selected after explicit human approval; automation must not select one.

For Android Capacitor production access, configure the exact origins below; do
not include development ports, LAN addresses, or wildcards:

```bash
ALLOWED_ORIGINS=https://lanyaomedia.com,http://localhost,https://localhost
```
