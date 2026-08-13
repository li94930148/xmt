import fs from 'node:fs';
import path from 'node:path';
import { config as loadDotenv, parse as parseDotenv } from 'dotenv';

export type RuntimeEnvironmentSource = 'runtime_env_file' | 'pm2_process_env' | 'development_env';

export type RuntimeEnvironmentMetadata = {
  source: RuntimeEnvironmentSource;
  loadedAt: string;
  runtimeEnvFile: string | null;
};

const RUNTIME_ENV_KEYS = /^(XMT_[A-Z0-9_]+|ALLOWED_ORIGINS|CORS_ORIGINS|NODE_ENV|HOST|PORT|TRUST_PROXY)$/;
let metadata: RuntimeEnvironmentMetadata | null = null;

function defaultSource(env: NodeJS.ProcessEnv): RuntimeEnvironmentSource {
  return env.NODE_ENV === 'production' ? 'pm2_process_env' : 'development_env';
}

function fail(message: string): never {
  throw new Error(`[RuntimeEnv] ${message}`);
}

function validateEnvFile(file: string): fs.Stats {
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(file);
  } catch {
    return fail(`Configured XMT_RUNTIME_ENV_FILE is not readable: ${file}`);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(`Configured XMT_RUNTIME_ENV_FILE must be a regular non-symlink file: ${file}`);
  if ((stat.mode & 0o022) !== 0) fail(`Configured XMT_RUNTIME_ENV_FILE must not be group/world writable: ${file}`);
  try {
    fs.accessSync(file, fs.constants.R_OK);
  } catch {
    fail(`Configured XMT_RUNTIME_ENV_FILE is not readable: ${file}`);
  }
  return stat;
}

function parseRuntimeFile(file: string): Record<string, string> {
  const content = fs.readFileSync(file, 'utf8');
  for (const [index, line] of content.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || /^export\s+[A-Za-z_][A-Za-z0-9_]*=/.test(trimmed)) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*=/.test(trimmed)) fail(`Invalid runtime env syntax at ${file}:${index + 1}`);
  }
  const parsed = parseDotenv(content);
  for (const key of Object.keys(parsed)) {
    if (!RUNTIME_ENV_KEYS.test(key)) fail(`Runtime env key is not allowed: ${key}`);
  }
  return parsed;
}

export function loadRuntimeEnvironment(env: NodeJS.ProcessEnv = process.env): RuntimeEnvironmentMetadata {
  // Preserve the existing development ergonomics. dotenv never overrides PM2
  // values; an explicitly configured runtime file below is the only authority
  // allowed to override application configuration at startup.
  if (env === process.env) loadDotenv({ quiet: true });
  const configuredPath = env.XMT_RUNTIME_ENV_FILE?.trim();
  const loadedAt = new Date().toISOString();
  if (!configuredPath) {
    metadata = { source: defaultSource(env), loadedAt, runtimeEnvFile: null };
    return metadata;
  }

  const resolvedPath = path.resolve(configuredPath);
  validateEnvFile(resolvedPath);
  const parsed = parseRuntimeFile(resolvedPath);
  // The file is the authoritative source for application keys. Do not replace
  // unrelated process state such as PATH, HOME, or PM2 bookkeeping variables.
  for (const [key, value] of Object.entries(parsed)) env[key] = value;
  env.XMT_RUNTIME_ENV_FILE = resolvedPath;
  metadata = { source: 'runtime_env_file', loadedAt, runtimeEnvFile: resolvedPath };
  return metadata;
}

export function getRuntimeEnvironmentMetadata(env: NodeJS.ProcessEnv = process.env): RuntimeEnvironmentMetadata {
  return metadata ?? { source: defaultSource(env), loadedAt: new Date().toISOString(), runtimeEnvFile: null };
}

export function inspectRuntimeEnvironment(env: NodeJS.ProcessEnv = process.env) {
  const configuredPath = env.XMT_RUNTIME_ENV_FILE?.trim();
  if (!configuredPath) return { source: defaultSource(env), runtimeEnvFile: null, secure: true, variables: env };
  const resolvedPath = path.resolve(configuredPath);
  validateEnvFile(resolvedPath);
  const variables = { ...env, ...parseRuntimeFile(resolvedPath), XMT_RUNTIME_ENV_FILE: resolvedPath };
  return { source: 'runtime_env_file' as const, runtimeEnvFile: resolvedPath, secure: true, variables };
}
