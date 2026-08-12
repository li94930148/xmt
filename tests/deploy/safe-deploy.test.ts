import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const script = fs.readFileSync(path.resolve('deploy/xmt-safe-deploy.sh'), 'utf8');
assert.match(script, /require_command sqlite3/);
assert.match(script, /sqlite3 "\$DB_PATH" "\.backup/);
assert.match(script, /PRAGMA quick_check/);
assert.match(script, /PREVIOUS_SHA="\$\(git rev-parse HEAD\)"/);
assert.match(script, /trap rollback_code ERR/);
assert.match(script, /git checkout --detach "\$PREVIOUS_SHA"/);
assert.match(script, /rollback_code 1/);
assert.doesNotMatch(script, /cp -p "\$DB_PATH"/);
console.log('safe deploy hardening static tests passed');
