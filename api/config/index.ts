import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const configDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.resolve(configDirectory, '..', '..', 'package.json');

export function readAppVersion() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { version: string };
  return packageJson.version;
}

export const appVersion = readAppVersion();
