/** One deterministic, testable gate for foreground-only multicast discovery. */
export type DiscoveryContext = {
  foreground: boolean;
  restored: boolean;
  panel: string | null;
  mode: 'ir' | 'wifi';
  scanned: boolean;
  scanning: boolean;
  wifiReady: boolean;
  connectionState: string;
};

export function shouldBeginDiscovery(c: DiscoveryContext): boolean {
  return c.foreground && c.restored && c.panel === 'connection' && c.mode === 'wifi' &&
    !c.scanned && !c.scanning && !c.wifiReady &&
    !['connecting', 'pairing', 'pin'].includes(c.connectionState);
}
