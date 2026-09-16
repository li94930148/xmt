import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getBackupSources, listBackupInventory, resolveInventoryBackup } from '../../api/services/backupInventory.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xmt-backup-inventory-'));
const dataDir = path.join(root, 'data');
const application = path.join(dataDir, 'backups');
const emergency = path.join(root, 'emergency');
const scheduled = path.join(root, 'scheduled');
const extra = path.join(root, 'extra');
for (const directory of [application, emergency, scheduled, extra]) fs.mkdirSync(directory, { recursive: true });

fs.writeFileSync(path.join(application, 'xmt-2026-09-15-09-00-00.db'), 'application');
fs.writeFileSync(path.join(emergency, 'xmt-20260915-090100-42.db'), 'emergency');
fs.writeFileSync(path.join(scheduled, 'xmt-20260915-090200-43.db.gz'), 'scheduled');
fs.writeFileSync(path.join(extra, 'xmt-auth-gray-20260915.db'), 'extra');
fs.writeFileSync(path.join(extra, 'notes.txt'), 'ignore');
fs.symlinkSync(path.join(application, 'xmt-2026-09-15-09-00-00.db'), path.join(extra, 'xmt-linked.db'));

const sources = getBackupSources(path.join(dataDir, 'xmt.db'), {
  XMT_EMERGENCY_BACKUP_DIR: emergency,
  XMT_SCHEDULED_BACKUP_DIR: scheduled,
  XMT_BACKUP_EXTRA_DIRS: `${extra}${path.delimiter}${path.join(root, 'missing')}`,
});
const inventory = listBackupInventory(sources);

assert.equal(inventory.files.length, 4);
assert.deepEqual(new Set(inventory.files.map((file) => file.source)), new Set(['application', 'emergency', 'scheduled', 'extra-1']));
assert.equal(inventory.files.find((file) => file.source === 'scheduled')?.compressed, true);
assert.equal(inventory.files.find((file) => file.source === 'emergency')?.deletable, false);
assert.equal(inventory.files.find((file) => file.source === 'application')?.deletable, true);
assert.equal(inventory.sources.find((source) => source.id === 'extra-2')?.available, false);
assert.equal(resolveInventoryBackup(sources, 'scheduled', 'xmt-20260915-090200-43.db.gz'), path.join(scheduled, 'xmt-20260915-090200-43.db.gz'));
assert.equal(resolveInventoryBackup(sources, 'scheduled', '../xmt.db'), null);
assert.equal(resolveInventoryBackup(sources, 'extra-1', 'xmt-linked.db'), null);
assert.equal(JSON.stringify(inventory).includes(root), false, 'API inventory must not expose server paths');

fs.rmSync(root, { recursive: true, force: true });
console.log('backup inventory tests passed');
