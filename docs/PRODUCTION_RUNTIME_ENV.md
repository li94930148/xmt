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
