import { requireOptionalNativeModule } from 'expo';
import { discoveredTVs } from './core/network';

type Discovery = { discover: (preferredId: string) => Promise<unknown>; cancel: () => void; openWifiSettings: () => void };
const discovery = requireOptionalNativeModule<Discovery>('LgDiscovery');

/** Discover on the existing Wi-Fi network, never configure or join one. */
export async function discoverTVs(preferredId?: string) {
  if (!discovery) throw new Error('La recherche nécessite un APK Android récent, pas Expo Go.');
  return discoveredTVs(await discovery.discover(preferredId ?? ''));
}
export function cancelDiscovery() { discovery?.cancel(); }
export function openWifiSettings() {
  if (!discovery) throw new Error('Ouvrez les réglages Wi-Fi dans Android.');
  discovery.openWifiSettings();
}
