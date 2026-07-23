const fs = require('node:fs');
const path = require('node:path');
const { launchChrome } = require('../dist-desktop/core/browser/chrome-launcher.js');
const { connectChrome, checkLogin } = require('../dist-desktop/core/browser/chrome-connector.js');
const { SystemChromeAdapter } = require('../dist-desktop/core/browser/systemChromeAdapter.js');
const { DouyinCreatorCollector } = require('../dist-desktop/core/collector/douyin.js');
const { CreatorDatabase } = require('../dist-desktop/core/database/creatorDatabase.js');

const root = path.join(process.env.APPDATA, 'XMT Creator Agent');
const profile = path.join(root, 'browser');
const data = path.resolve(__dirname, '..', 'data');
const discovery = path.join(data, 'douyin-api-discovery');
const endpoint = 'http://127.0.0.1:9222';

async function main() {
  const mode = process.argv[2] || '--launch';
  if (mode === '--launch') await launchChrome(profile, 9222);
  const connection = await connectChrome(endpoint);
  const loggedIn = await checkLogin(connection.page);
  const base = { chrome_launch: mode === '--launch' ? 'success' : 'reused', connect_over_cdp: 'success', logged_in: loggedIn };
  if (!loggedIn || mode !== '--collect') { console.log(JSON.stringify(base, null, 2)); process.exit(0); }
  process.env.XMT_DOUYIN_WORK_LIST_OBSERVE_MS = process.env.XMT_DOUYIN_WORK_LIST_OBSERVE_MS || '15000';
  fs.mkdirSync(data, { recursive: true });
  const snapshot = await new DouyinCreatorCollector(new SystemChromeAdapter(profile, endpoint), path.join(data, 'network-sample.json'), discovery).collect();
  fs.writeFileSync(path.join(data, 'snapshot-sample.json'), JSON.stringify(snapshot, null, 2));
  const database = new CreatorDatabase(path.join(data, 'creator-smoke.sqlite'));
  let local;
  try { local = database.save(snapshot); } finally { database.close(); }
  console.log(JSON.stringify({ ...base, xhr_count: snapshot.raw.captures.length, api_count: snapshot.raw.api_map.length, works: snapshot.works.length, database: local, discovery }, null, 2));
  process.exit(0);
}
main().catch((error) => { console.error(error instanceof Error ? error.stack : error); process.exitCode = 1; });
