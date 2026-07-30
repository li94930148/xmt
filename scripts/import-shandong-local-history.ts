import path from 'node:path';
import { getDatabasePath } from '../api/database/path';
import { rollbackBatch, runShandongImport } from './resource-import/shandong-import';

function parseArgs(argv: string[]) {
  const result: Record<string, string | boolean> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`Unknown argument: ${argument}`);
    const key = argument.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) { result[key] = next; index += 1; }
    else result[key] = true;
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const databasePath = getDatabasePath();
const storageRoot = path.resolve(process.env.XMT_RESOURCE_STORAGE_PATH || path.join(process.cwd(), 'data', 'resources'));
const manifestRoot = path.resolve(process.env.XMT_RESOURCE_MANIFEST_PATH || path.join(process.cwd(), 'data', 'resource-import', 'manifests'));

if (args['rollback-batch']) {
  const batchId = Number(args['rollback-batch']);
  if (!Number.isInteger(batchId) || batchId <= 0) throw new Error('--rollback-batch requires a positive batch ID');
  console.log(JSON.stringify(await rollbackBatch(databasePath, storageRoot, batchId), null, 2));
} else {
  if (!args.source || args.source === true) throw new Error('--source requires a ZIP path');
  const limit = args.limit === undefined ? undefined : Number(args.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) throw new Error('--limit requires a positive integer');
  let resumeBatchId: number | true | undefined;
  if (args.resume === true) resumeBatchId = true;
  else if (args.resume) {
    resumeBatchId = Number(args.resume);
    if (!Number.isInteger(resumeBatchId) || resumeBatchId <= 0) throw new Error('--resume requires a positive batch ID when a value is supplied');
  }
  const output = await runShandongImport({
    source: String(args.source), databasePath, storageRoot, manifestRoot,
    dryRun: args['dry-run'] === true, limit, resumeBatchId,
  });
  console.log(JSON.stringify({ manifestPath: output.manifestPath, manifestStats: output.manifest.stats, result: output.result }, null, 2));
}
