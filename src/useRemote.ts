import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { canTransmitIR, transmitIR } from '../modules/lg-infrared';
import { IR_CODES, type RemoteKey } from './remote-keys';
import { INITIAL, WebOsClient, needsPointer, type Socket, type TvInput } from './core/webos';
import { localIPv4, type TvDevice } from './core/network';
import { cancelDiscovery, discoverTVs, openWifiSettings } from './native';

export type Mode = 'ir' | 'wifi';
export type Panel = 'connection' | 'numbers' | 'media' | 'more' | 'inputs' | null;
export function useRemote() {
  const [irReady] = useState(canTransmitIR);
  const [mode, setMode] = useState<Mode>(irReady ? 'ir' : 'wifi');
  const [ip, setIp] = useState('');
  const [haptics, setHaptics] = useState(true);
  const [snapshot, setSnapshot] = useState(INITIAL);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<Panel>(null);
  const [devices, setDevices] = useState<TvDevice[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [inputs, setInputs] = useState<TvInput[]>([]);
  const [loadingInputs, setLoadingInputs] = useState(false);
  const mounted = useRef(true);
  const scanId = useRef(0);
  const commandBusy = useRef(false);
  const resumeWifi = useRef(false);
  const stateRef = useRef({ mode, snapshot, ip });
  stateRef.current = { mode, snapshot, ip };
  const [client] = useState(() => new WebOsClient({
    storage: SecureStore,
    createSocket: url => new WebSocket(url) as unknown as Socket,
    onState: value => { if (mounted.current) setSnapshot(value); },
  }));
  const report = (e: unknown) => { if (mounted.current) setError(e instanceof Error ? e.message : 'Une erreur est survenue.'); };

  useEffect(() => {
    mounted.current = true;
    let alive = true;
    void Promise.all([
      SecureStore.getItemAsync('lg_tv_ip'), SecureStore.getItemAsync('lg_mode'), SecureStore.getItemAsync('lg_haptics'),
    ]).then(([host, savedMode, feedback]) => {
      if (!alive) return;
      if (host && localIPv4(host)) setIp(host);
      if (savedMode === 'wifi' || (savedMode === 'ir' && irReady)) setMode(savedMode);
      if (feedback === 'off') setHaptics(false);
    }).catch(() => { /* controls still work without saved preferences */ });
    const subscription = AppState.addEventListener('change', state => {
      const current = stateRef.current;
      if (state !== 'active') {
        resumeWifi.current = resumeWifi.current || current.mode === 'wifi' && ['connected', 'limited'].includes(current.snapshot.state);
        scanId.current++; cancelDiscovery(); setScanning(false); client.disconnect();
      } else if (resumeWifi.current) {
        resumeWifi.current = false;
        void client.connect(current.ip).catch(report);
      }
    });
    return () => {
      alive = false; mounted.current = false; subscription.remove(); scanId.current++;
      cancelDiscovery(); client.disconnect();
    };
  }, [client, irReady]);

  const chooseMode = (next: Mode) => {
    setMode(next); setError('');
    void SecureStore.setItemAsync('lg_mode', next).catch(() => {});
    if (next === 'wifi' && !['connected', 'limited', 'pairing'].includes(snapshot.state)) setPanel('connection');
  };
  const toggleHaptics = (enabled: boolean) => {
    setHaptics(enabled);
    void SecureStore.setItemAsync('lg_haptics', enabled ? 'on' : 'off').catch(() => {});
  };
  const stopScan = () => { scanId.current++; cancelDiscovery(); setScanning(false); };
  const scan = async () => {
    const id = ++scanId.current;
    setError(''); setScanning(true); setScanned(false); setDevices([]);
    try {
      const values = await discoverTVs();
      if (mounted.current && scanId.current === id) { setDevices(values); setScanned(true); }
    } catch (e) { if (scanId.current === id) report(e); }
    finally { if (mounted.current && scanId.current === id) setScanning(false); }
  };
  const connect = (host = ip) => {
    stopScan(); setError(''); setIp(host); setMode('wifi');
    void SecureStore.setItemAsync('lg_mode', 'wifi').catch(() => {});
    void client.connect(host).catch(report);
  };
  const wifiReady = ['connected', 'limited'].includes(snapshot.state);
  const available = (key: RemoteKey) => mode === 'ir' ? irReady : wifiReady && (!needsPointer(key) || snapshot.navigation);
  const showInputs = async () => {
    setPanel('inputs'); setInputs([]); setLoadingInputs(true);
    try { const values = await client.inputs(); if (mounted.current) setInputs(values); }
    catch (e) { report(e); }
    finally { if (mounted.current) setLoadingInputs(false); }
  };
  const send = async (key: RemoteKey) => {
    if (commandBusy.current) return; // Drop repeat overload; never build a queue of volume commands.
    commandBusy.current = true;
    try {
      if (mode === 'ir') await transmitIR(IR_CODES[key]);
      else if (key === 'SOURCE') { await showInputs(); return; }
      else await client.send(key);
      // Tactile feedback belongs to touch-down, not completion of an IR/Wi-Fi command.
      if (mounted.current) setError('');
    } catch (e) { report(e); }
    finally { commandBusy.current = false; }
  };
  return { mode, chooseMode, ip, setIp, irReady, haptics, toggleHaptics, snapshot, error, clearError: () => setError(''),
    panel, setPanel, devices, scanning, scanned, scan, stopScan, connect, wifiReady, available, send, inputs, loadingInputs,
    disconnect: () => client.disconnect(),
    forget: () => { void client.forget(ip).catch(report); },
    settings: () => { try { openWifiSettings(); } catch (e) { report(e); } },
    switchInput: async (id: string) => {
      try { await client.switchInput(id); if (mounted.current) setPanel(null); } catch (e) { report(e); }
    },
  };
}
