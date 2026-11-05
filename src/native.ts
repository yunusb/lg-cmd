import { requireOptionalNativeModule } from 'expo';
import { discoveredTVs } from './core/network';

type Discovery = { discover: () => Promise<unknown>; cancel: () => void; openWifiSettings: () => void };
const discovery = requireOptionalNativeModule<Discovery>('LgDiscovery');
export async function discoverTVs() {
  if (!discovery) throw new Error('La détection nécessite le nouvel APK, pas Expo Go.');
  return discoveredTVs(await discovery.discover());
}
export function cancelDiscovery() { discovery?.cancel(); }
export function openWifiSettings() {
  if (!discovery) throw new Error('Les réglages Wi-Fi sont accessibles dans les paramètres Android.');
  discovery.openWifiSettings();
}
