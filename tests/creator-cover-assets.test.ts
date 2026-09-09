import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { validatedCoverAsset } from '../api/services/douyinDataCenter.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const valid = { mime_type: 'image/png', sha256: crypto.createHash('sha256').update(png).digest('hex'), size_bytes: png.byteLength, data_base64: png.toString('base64') };
assert.deepEqual(validatedCoverAsset(valid)?.bytes, png);
assert.equal(validatedCoverAsset({ ...valid, mime_type: 'text/html' }), null);
assert.equal(validatedCoverAsset({ ...valid, sha256: '0'.repeat(64) }), null);
assert.equal(validatedCoverAsset({ ...valid, size_bytes: valid.size_bytes + 1 }), null);
assert.equal(validatedCoverAsset({ ...valid, data_base64: Buffer.from('<html>').toString('base64'), size_bytes: 6, sha256: crypto.createHash('sha256').update('<html>').digest('hex') }), null);
console.log('Creator cover asset validation tests passed');
