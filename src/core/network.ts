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

/** SSDP USN: stable UDN + optional service suffix, not a LAN address. */
export function stableTvId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 200) return null;
  const match = /^uuid:([a-z0-9-]{1,96})(?:::.*)?$/i.exec(value.trim());
  return match ? 'uuid:' + match[1].toLowerCase() : null;
}

export function safePointerURL(value: unknown, host: string): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  // Legacy webOS socket only; never disable TLS validation or follow another host.
  return value.startsWith('ws://' + host + ':3000/') && !/[\s\\#]/.test(value);
}

export type TvDevice = { host: string; id: string; label: string; protocol: 'webos' | 'netcast' };
const WEBOS = 'urn:lge-com:service:webos-second-screen:1';
const NETCAST = 'urn:lge-com:service:netrcu:1';

/** Accept only typed LG responses, never generic UPnP renderers as confirmed LG. */
export function discoveredTVs(raw: unknown): TvDevice[] {
  if (!Array.isArray(raw)) return [];
  const byHost = new Map<string, TvDevice>();
  for (const item of raw.slice(0, 100)) {
    if (!item || typeof item !== 'object' || typeof item.host !== 'string') continue;
    const host = localIPv4(item.host);
    const service = typeof item.service === 'string' ? item.service.trim().toLowerCase() : '';
    const protocol = service === WEBOS ? 'webos' : service === NETCAST ? 'netcast' : null;
    if (!host || !protocol || (byHost.get(host)?.protocol === 'webos' && protocol === 'netcast')) continue;
    const id = stableTvId(item.id) ?? host;
    byHost.set(host, {
      id, host, protocol,
      label: protocol === 'webos' ? 'Téléviseur LG · webOS' : 'Téléviseur LG · NetCast',
    });
  }
  // SSDP can report the same UDN on wireless and wired interfaces. Prefer one per TV.
  const byId = new Map<string, TvDevice>();
  for (const device of byHost.values()) {
    const existing = byId.get(device.id);
    if (!existing || (device.protocol === 'webos' && existing.protocol !== 'webos')) {
      byId.set(device.id, device);
    }
  }
  return [...byId.values()].sort((a, b) => a.host.localeCompare(b.host));
}
