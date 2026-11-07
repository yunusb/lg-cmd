import { localIPv4, stableTvId, type TvDevice } from './network.ts';

export const PREFERRED_TV_KEY = 'lg_preferred_tv_v1';
export type PreferredTv = { id: string; host: string };

/** A selection is remembered only after the TV has approved registration. */
export function loadPreferredTv(raw: unknown): PreferredTv | null {
  if (typeof raw !== 'string' || raw.length > 512) return null;
  try {
    const obj: unknown = JSON.parse(raw);
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const input = obj as Record<string, unknown>;
    const host = typeof input.host === 'string' ? localIPv4(input.host) : null;
    const id = stableTvId(input.id) ?? (input.id === host && host ? host : null);
    return host && id ? { host, id } : null;
  } catch { return null; }
}

export function rememberTv(device: TvDevice): PreferredTv {
  return { id: device.id, host: device.host };
}

/** Reconcile a remembered TV after DHCP changes; never auto-select a stranger. */
export function findPreferredTv(preferred: PreferredTv | null, devices: TvDevice[]): TvDevice | null {
  if (!preferred) return null;
  return devices.find(device => device.protocol === 'webos' && device.id === preferred.id) ?? null;
}
