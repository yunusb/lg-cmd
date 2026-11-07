import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { canTransmitIR, transmitIR } from '../modules/lg-infrared';
import { IR_CODES, type RemoteKey } from './remote-keys';
import { INITIAL, WebOsClient, needsPointer, type Socket, type TvInput } from './core/webos';
import { localIPv4, stableTvId, type TvDevice } from './core/network';
import { findPreferredTv, loadPreferredTv, rememberTv, PREFERRED_TV_KEY, type PreferredTv } from './core/tvMemory';
import { cancelDiscovery, discoverTVs, openWifiSettings } from './native';

export type Mode = 'ir' | 'wifi';
export type Panel = 'connection' | 'numbers' | 'media' | 'more' | 'inputs' | null;

/**
 * The IR remote remains usable without any network. Wi-Fi discovery is strictly
 * foreground, user-visible and automatically started on entering the Wi-Fi flow.
 */
export function useRemote() {
  const [irReady] = useState(canTransmitIR);
  const [mode, setMode] = useState<Mode>(irReady ? 'ir' : 'wifi');
  const [ip, setIp] = useState('');
  const [pairingPin, setPairingPin] = useState('');
  const [haptics, setHaptics] = useState(true);
  const [snapshot, setSnapshot] = useState(INITIAL);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [devices, setDevices] = useState<TvDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [scanCancelled, setScanCancelled] = useState(false);
  const [restored, setRestored] = useState(false);
  const [inputs, setInputs] = useState<TvInput[]>([]);
  const [loadingInputs, setLoadingInputs] = useState(false);
  const mounted = useRef(true);
  const preferred = useRef<PreferredTv | null>(null);
  const pendingChoice = useRef<TvDevice | null>(null);
  const scanId = useRef(0);
  const scanActive = useRef(false);
  const commandBusy = useRef(false);
  const resumeWifi = useRef(false);
  const stateRef = useRef({ mode, snapshot, ip });
  stateRef.current = { mode, snapshot, ip };

  const [client] = useState(() => new WebOsClient({
    storage: SecureStore,
    createSocket: url => new WebSocket(url) as unknown as Socket,
    onState: value => {
      if (!mounted.current) return;
      setSnapshot(value);
      const device = pendingChoice.current;
      if (device && (value.state === 'connected' || value.state === 'limited')) {
        const saved = rememberTv(device);
        preferred.current = saved;
        // Save only after the TV approved the registration; never save devices
        // merely because they responded to an unauthenticated SSDP query.
        void SecureStore.setItemAsync(PREFERRED_TV_KEY, JSON.stringify(saved)).catch(() => {});
      }
      if (value.state === 'connected') {
        if (device) setPanel(null);
        pendingChoice.current = null;
      }
      if (value.state === 'error') pendingChoice.current = null;
    },
  }));
  const report = (e: unknown) => {
    if (mounted.current) setError(e instanceof Error ? e.message : 'Une erreur est survenue.');
  };

  const stopScan = (userCancelled = false) => {
    scanId.current++;
    scanActive.current = false;
    cancelDiscovery();
    setScanning(false);
    if (userCancelled) {
      setScanned(true);
      setScanCancelled(true);
    }
  };

  const connectDevice = (device: TvDevice, pairingMode: 'PROMPT' | 'PIN' = 'PROMPT') => {
    if (device.protocol !== 'webos') return;
    stopScan();
    setError('');
    setIp(device.host);
    setMode('wifi');
    pendingChoice.current = device;
    setPairingPin('');
    void SecureStore.setItemAsync('lg_mode', 'wifi').catch(() => {});
    void client.connect(device.host, stableTvId(device.id) ?? undefined, pairingMode).catch(report);
  };

  const scan = async (autoConnectRemembered = false) => {
    if (scanActive.current) return; // Avoid overlapping Android multicast locks.
    scanActive.current = true;
    const id = ++scanId.current;
    setError(''); setScanning(true); setScanned(false); setScanCancelled(false); setDevices([]);
    try {
      const available = await discoverTVs(autoConnectRemembered ? preferred.current?.id : undefined);
      if (!mounted.current || scanId.current !== id) return;
      setDevices(available);
      setScanned(true);
      const known = autoConnectRemembered ? findPreferredTv(preferred.current, available) : null;
      if (known) connectDevice(known);
    } catch (e) {
      if (mounted.current && scanId.current === id) {
        report(e); setScanned(true);
      }
    } finally {
      if (mounted.current && scanId.current === id) {
        scanActive.current = false;
        setScanning(false);
      }
    }
  };

  useEffect(() => {
    mounted.current = true;
    let alive = true;
    void Promise.all([
      SecureStore.getItemAsync('lg_tv_ip'), SecureStore.getItemAsync('lg_mode'),
      SecureStore.getItemAsync('lg_haptics'), SecureStore.getItemAsync(PREFERRED_TV_KEY),
    ]).then(([host, savedMode, feedback, savedDevice]) => {
      if (!alive) return;
      const selected = loadPreferredTv(savedDevice);
      preferred.current = selected;
      if (selected) setIp(selected.host);
      else if (host && localIPv4(host)) setIp(host);
      if (feedback === 'off') setHaptics(false);
      // Previous Wi-Fi users reconnect automatically; IR remains the safe
      // default on a POCO F3 with a physical emitter.
      if (savedMode === 'wifi' || (!irReady && savedMode !== 'ir')) {
        setMode('wifi'); setScanned(false); setPanel('connection');
      } else if (savedMode === 'ir' && irReady) {
        setMode('ir');
      }
    }).catch(() => {
      if (alive && !irReady) { setMode('wifi'); setPanel('connection'); }
    }).finally(() => { if (alive) setRestored(true); });

    const subscription = AppState.addEventListener('change', state => {
      const current = stateRef.current;
      if (state === 'background') {
        resumeWifi.current = current.mode === 'wifi' && ['connected', 'limited', 'pairing', 'pin'].includes(current.snapshot.state);
        stopScan();
        client.disconnect();
      } else if (state === 'active' && resumeWifi.current) {
        resumeWifi.current = false;
        if (current.mode === 'wifi') {
          setScanned(false);
          setPanel('connection'); // Re-discover the same TV before sending the key.
        }
      }
    });
    return () => {
      alive = false; mounted.current = false; subscription.remove(); stopScan(); client.disconnect();
    };
  }, [client, irReady]);

  const wifiReady = ['connected', 'limited'].includes(snapshot.state);
  useEffect(() => {
    if (restored && panel === 'connection' && mode === 'wifi' && !scanned && !scanning &&
      !wifiReady && snapshot.state !== 'connecting' && snapshot.state !== 'pairing' && snapshot.state !== 'pin') {
      void scan(true);
    }
  }, [restored, panel, mode, scanned, scanning, wifiReady, snapshot.state]);

  const openConnection = () => {
    setMode('wifi');
    setError('');
    setScanned(false); setScanCancelled(false);
    setPanel('connection');
    void SecureStore.setItemAsync('lg_mode', 'wifi').catch(() => {});
  };
  const chooseMode = (next: Mode) => {
    setMode(next);
    setError('');
    void SecureStore.setItemAsync('lg_mode', next).catch(() => {});
    if (next === 'wifi' && !wifiReady) {
      setScanned(false);
      setPanel('connection');
    }
    if (next === 'ir') {
      stopScan();
      setPanel(null);
      // Do NOT disconnect pairing: the user may need the IR remote to
      // accept the initial permission prompt shown on the TV.
    }
  };
  const toggleHaptics = (enabled: boolean) => {
    setHaptics(enabled);
    void SecureStore.setItemAsync('lg_haptics', enabled ? 'on' : 'off').catch(() => {});
  };
  const manualConnect = () => {
    const host = localIPv4(ip);
    if (!host) { setError('Cette adresse locale n’est pas valide.'); return; }
    const found = devices.find(v => v.host === host && v.protocol === 'webos');
    const saved = preferred.current?.host === host ? preferred.current : null;
    const device = found ?? {
      host, id: saved?.id ?? host, protocol: 'webos' as const, label: 'Téléviseur LG',
    };
    connectDevice(device);
  };
  const retryPreferred = () => {
    const saved = preferred.current;
    if (!saved) return;
    // Explicit fallback when the router filters SSDP. Never send a stored key
    // to a stale IP silently; let the user choose this one-tap recovery.
    connectDevice({ id: saved.id, host: saved.host, protocol: 'webos', label: 'TV LG enregistrée' });
  };
  const startPinPairing = () => {
    const host = localIPv4(ip);
    if (!host) { setError('Sélectionnez une TV avant de demander un code.'); return; }
    const remembered = preferred.current?.host === host ? preferred.current : null;
    const choice = pendingChoice.current ?? {
      host, id: remembered?.id ?? host, protocol: 'webos' as const, label: 'Téléviseur LG',
    };
    connectDevice(choice, 'PIN');
  };
  const submitPin = () => {
    try { client.sendPairingPin(pairingPin); setPairingPin(''); setError(''); }
    catch (e) { report(e); }
  };
  const closeConnection = () => { stopScan(); setPanel(null); };
  const available = (key: RemoteKey) => mode === 'ir' ? irReady : wifiReady && (!needsPointer(key) || snapshot.navigation);
  const showInputs = async () => {
    setPanel('inputs'); setInputs([]); setLoadingInputs(true);
    try { const values = await client.inputs(); if (mounted.current) setInputs(values); }
    catch (e) { report(e); }
    finally { if (mounted.current) setLoadingInputs(false); }
  };
  const send = async (key: RemoteKey) => {
    if (commandBusy.current) return;
    commandBusy.current = true;
    try {
      if (mode === 'ir') await transmitIR(IR_CODES[key]);
      else if (key === 'SOURCE') { await showInputs(); return; }
      else await client.send(key);
      if (mounted.current) setError('');
    } catch (e) { report(e); }
    finally { commandBusy.current = false; }
  };
  const forget = () => {
    const toForget = preferred.current;
    stopScan();
    preferred.current = null;
    void SecureStore.deleteItemAsync(PREFERRED_TV_KEY).catch(report);
    void client.forget(ip, toForget?.id).catch(report);
    setScanned(false);
  };
  return {
    mode, chooseMode, openConnection, closeConnection, ip, setIp, irReady, haptics, toggleHaptics,
    snapshot, error, clearError: () => setError(''), panel, setPanel,
    devices, scanning, scanned, scanCancelled, scan, stopScan, connectDevice, manualConnect,
    hasSavedTv: restored && preferred.current !== null, retryPreferred,
    pairingPin, setPairingPin, startPinPairing, submitPin,
    wifiReady, available, send, inputs, loadingInputs, disconnect: () => client.disconnect(),
    forget, settings: () => { try { openWifiSettings(); } catch (e) { report(e); } },
    switchInput: async (id: string) => {
      try { await client.switchInput(id); if (mounted.current) setPanel(null); } catch (e) { report(e); }
    },
  };
}
