/** Only canonical private IPv4 literals. No DNS, URLs or remote endpoints. */
export function localIPv4(value: string): string | null {
  const ip = value.trim();
  const parts = ip.split('.');
  if (parts.length !== 4 || parts.some(p => !/^(0|[1-9]\d{0,2})$/.test(p))) return null;
  const n = parts.map(Number);
  if (n.some(v => v > 255)) return null;
  return n[0] === 10 || (n[0] === 172 && n[1] >= 16 && n[1] <= 31) ||
    (n[0] === 192 && n[1] === 168) || (n[0] === 169 && n[1] === 254) ? ip : null;
}

export function safePointerURL(value: unknown, host: string): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  // Legacy webOS socket only; never disable TLS validation or follow another host.
  return value.startsWith(`ws://${host}:3000/`) && !/[\s\\#]/.test(value);
}

export type TvDevice = { host: string; id: string; label: string; protocol: 'webos' | 'netcast' };
export function discoveredTVs(raw: unknown): TvDevice[] {
  if (!Array.isArray(raw)) return [];
  const found = new Map<string, TvDevice>();
  for (const item of raw.slice(0, 100)) {
    if (!item || typeof item !== 'object' || typeof item.host !== 'string') continue;
    const host = localIPv4(item.host);
    const st = typeof item.service === 'string' ? item.service.toLowerCase() : '';
    const protocol = st.includes('webos-second-screen') ? 'webos' : st.includes('netrcu') ? 'netcast' : null;
    if (!host || !protocol || found.get(host)?.protocol === 'webos') continue;
    found.set(host, { host, protocol, id: typeof item.id === 'string' ? item.id.slice(0, 200) : host,
      label: `${protocol === 'webos' ? 'LG webOS' : 'LG NetCast'} · ${host}` });
  }
  return [...found.values()].sort((a, b) => a.host.localeCompare(b.host));
}
