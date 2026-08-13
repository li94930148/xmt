import assert from 'node:assert/strict';
import { resolveServerBinding } from '../../api/config/server-bind.js';

assert.equal(resolveServerBinding({ NODE_ENV: 'production' }).host, '127.0.0.1');
assert.equal(resolveServerBinding({ NODE_ENV: 'development' }).host, '0.0.0.0');
assert.equal(resolveServerBinding({ NODE_ENV: 'production', HOST: '0.0.0.0' }).host, '0.0.0.0');
assert.throws(() => resolveServerBinding({ PORT: '0' }), /Invalid PORT/);
console.log('production bind contract tests passed');
