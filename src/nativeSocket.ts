import { requireOptionalNativeModule } from 'expo';
import { NativeTvSocket, type NativeSocketBridge } from './core/socketAdapter';
import type { Socket } from './core/webos';

const nativeBridge = requireOptionalNativeModule<NativeSocketBridge>('LgWebSocket');

/** Native Android transport avoids the Origin header rejected by some LG TVs. */
export function createTvSocket(url: string): Socket {
  if (!nativeBridge) throw new Error('Installez le nouvel APK pour connecter la TV en Wi-Fi.');
  return new NativeTvSocket(nativeBridge, url);
}
