/**
 * The production chain is client -> Caddy -> Node. Only a bounded hop count is
 * accepted so malformed configuration can never enable blanket proxy trust.
 */
export function parseTrustProxy(value: string | undefined) {
  if (!value || !/^\d+$/.test(value.trim())) return 1;
  const hops = Number(value);
  return Number.isSafeInteger(hops) && hops >= 0 && hops <= 10 ? hops : 1;
}
