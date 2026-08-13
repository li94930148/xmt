export function resolveServerBinding(env: NodeJS.ProcessEnv = process.env) {
  const production = env.NODE_ENV === 'production';
  const host = env.HOST?.trim() || (production ? '127.0.0.1' : '0.0.0.0');
  const port = Number.parseInt(env.PORT || '3001', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`Invalid PORT value: ${env.PORT}`);
  return { host, port };
}
