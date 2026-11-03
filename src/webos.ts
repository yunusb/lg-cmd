import * as SecureStore from 'expo-secure-store';
import type { RemoteKey } from './remote-keys';

export type TvInput = { id: string; label: string; connected: boolean };
export type ConnectionState = 'disconnected' | 'connecting' | 'connected';
export type WebOsEvents = {
  status: (message: string) => void;
  state: (value: ConnectionState) => void;
  inputs: (values: TvInput[]) => void;
};

export function isLocalIPv4(input: string): boolean {
  const parts = input.trim().split('.');
  if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p))) return false;
  const n = parts.map(Number);
  if (n.some(x => x > 255) || n[3] === 0 || n[3] === 255) return false;
  return n[0] === 10 || (n[0] === 172 && n[1] >= 16 && n[1] <= 31) ||
    (n[0] === 192 && n[1] === 168) || (n[0] === 169 && n[1] === 254);
}

const permissions = [
  'LAUNCH', 'CONTROL_AUDIO', 'CONTROL_POWER', 'CONTROL_INPUT_TV',
  'CONTROL_INPUT_MEDIA_PLAYBACK', 'CONTROL_DISPLAY', 'READ_INPUT_DEVICE_LIST',
  'READ_CURRENT_CHANNEL', 'CONTROL_MOUSE_AND_KEYBOARD', 'CONTROL_INPUT_TEXT',
];

const pointerKeys: Partial<Record<RemoteKey, string>> = {
  UP: 'UP', DOWN: 'DOWN', LEFT: 'LEFT', RIGHT: 'RIGHT', OK: 'ENTER',
  BACK: 'BACK', HOME: 'HOME', SETTINGS: 'MENU', EXIT: 'EXIT', INFO: 'INFO',
  PLAY: 'PLAY', PAUSE: 'PAUSE', STOP: 'STOP', REWIND: 'REWIND', FORWARD: 'FASTFORWARD',
  RED: 'RED', GREEN: 'GREEN', YELLOW: 'YELLOW', BLUE: 'BLUE',
  N0: '0', N1: '1', N2: '2', N3: '3', N4: '4', N5: '5',
  N6: '6', N7: '7', N8: '8', N9: '9',
};
type Message = Record<string, any>;

export class WebOsClient {
  private control: WebSocket | null = null;
  private pointer: WebSocket | null = null;
  private host = '';
  private seq = 0;
  private epoch = 0;
  private connected = false;
  private pointerReady = false;

  constructor(private events: WebOsEvents) {}
  private status(s: string) { this.events.status(s); }
  private state(s: ConnectionState) { this.events.state(s); }

  async connect(ipText: string): Promise<void> {
    const ip = ipText.trim();
    if (!isLocalIPv4(ip)) {
      this.status('Adresse IP locale invalide (ex. 192.168.1.20).');
      return;
    }
    this.disconnect(false);
    const epoch = this.epoch;
    this.host = ip;
    this.state('connecting');
    this.status('Connexion à ' + ip + '…');
    try {
      await SecureStore.setItemAsync('lg_tv_ip', ip);
      const key = await SecureStore.getItemAsync('lg_key_' + ip.replace(/\./g, '_'));
      if (this.epoch !== epoch) return;
      const ws = new WebSocket('ws://' + ip + ':3000/');
      this.control = ws;
      ws.onopen = () => {
        if (this.epoch !== epoch) return;
        ws.send(JSON.stringify({
          id: 'register_0', type: 'register',
          payload: {
            forcePairing: false, pairingType: 'PROMPT',
            manifest: { manifestVersion: 1, appVersion: '1.0', permissions },
            ...(key ? { 'client-key': key } : {}),
          },
        }));
        this.status('Accepte la demande sur l’écran de ta télévision LG.');
      };
      ws.onmessage = event => {
        if (this.epoch === epoch) void this.handleMessage(String(event.data), epoch);
      };
      ws.onerror = () => {
        if (this.epoch === epoch) {
          this.connected = false; this.pointerReady = false;
          this.state('disconnected');
          this.status('Connexion impossible : vérifie le Wi-Fi, l’IP et LG Connect Apps.');
        }
      };
      ws.onclose = () => {
        if (this.epoch === epoch) {
          this.connected = false; this.pointerReady = false;
          this.state('disconnected'); this.status('La télévision est déconnectée.');
        }
      };
    } catch (err) {
      if (this.epoch === epoch) {
        this.state('disconnected'); this.status('Erreur : ' + String(err));
      }
    }
  }

  private async handleMessage(raw: string, epoch: number): Promise<void> {
    let msg: Message;
    try { msg = JSON.parse(raw); } catch { return; }
    const payload: Message = msg.payload ?? {};
    const id = String(msg.id ?? '');
    if (msg.type === 'registered') {
      const key = payload['client-key'];
      if (typeof key === 'string' && key) {
        try { await SecureStore.setItemAsync('lg_key_' + this.host.replace(/\./g, '_'), key); }
        catch { /* current session still works */ }
      }
      if (this.epoch !== epoch) return;
      this.connected = true;
      this.state('connected');
      this.status('Connexion réussie. Préparation de la navigation…');
      this.request('pointer', 'ssap://com.webos.service.networkinput/getPointerInputSocket');
      return;
    }
    if (msg.type === 'error') {
      if (id === 'register_0') {
        this.state('disconnected'); this.status('Jumelage refusé sur la TV.');
      } else if (id.startsWith('pointer_')) {
        this.status('Connectée : navigation indisponible sur cette TV.');
      } else if (id.startsWith('inputs_')) {
        this.status('Impossible de récupérer les entrées HDMI.');
      } else if (id.startsWith('getMute_')) this.pointerButton('MUTE');
      return;
    }
    if (msg.type !== 'response') return;
    if (id.startsWith('pointer_')) {
      const url = payload.socketPath;
      if (typeof url === 'string') this.openPointer(url, epoch);
    } else if (id.startsWith('inputs_')) {
      const devices: Message[] = Array.isArray(payload.devices) ? payload.devices : [];
      this.events.inputs(devices.filter(v => typeof v.id === 'string').map(v => ({
        id: String(v.id), label: String(v.label || v.id), connected: Boolean(v.connected),
      })));
    } else if (id.startsWith('getMute_')) {
      const muted = payload.muted ?? payload.volumeStatus?.muted ?? false;
      this.request('mute', 'ssap://audio/setMute', { mute: !Boolean(muted) });
    }
  }

  private openPointer(url: string, epoch: number) {
    // Never connect to an unrelated host supplied in a TV response.
    const match = /^wss?:\/\/([^/:]+)(?::\d+)?(?:\/|$)/i.exec(url);
    if (!match || match[1] !== this.host) {
      this.status('Adresse de navigation refusée.');
      return;
    }
    try {
      this.pointer?.close();
      const ws = new WebSocket(url);
      this.pointer = ws;
      ws.onopen = () => {
        if (this.epoch === epoch) {
          this.pointerReady = true;
          this.status('Télécommande Wi-Fi prête.');
        }
      };
      ws.onerror = () => {
        if (this.epoch === epoch) {
          this.pointerReady = false;
          this.status('Wi-Fi connecté, mais la navigation est indisponible.');
        }
      };
      ws.onclose = () => { if (this.epoch === epoch) this.pointerReady = false; };
    } catch { this.status('Navigation indisponible.'); }
  }

  private request(prefix: string, uri: string, payload?: Message) {
    if (!this.control || this.control.readyState !== WebSocket.OPEN) {
      this.status('Connecte d’abord la télévision.'); return;
    }
    this.control.send(JSON.stringify({
      id: prefix + '_' + (++this.seq), type: 'request', uri,
      ...(payload ? { payload } : {}),
    }));
  }

  private pointerButton(key: string) {
    if (!this.pointer || !this.pointerReady || this.pointer.readyState !== WebSocket.OPEN) {
      this.status('Les flèches ne sont pas encore disponibles.'); return;
    }
    this.pointer.send('type:button\nname:' + key + '\n\n');
  }

  send(key: RemoteKey) {
    if (!this.connected) { this.status('Connecte la TV en Wi-Fi.'); return; }
    switch (key) {
      case 'POWER': this.request('off', 'ssap://system/turnOff'); return;
      case 'SOURCE': this.request('inputs', 'ssap://tv/getExternalInputList'); return;
      case 'VOLUME_UP': this.request('volumeUp', 'ssap://audio/volumeUp'); return;
      case 'VOLUME_DOWN': this.request('volumeDown', 'ssap://audio/volumeDown'); return;
      case 'CHANNEL_UP': this.request('channelUp', 'ssap://tv/channelUp'); return;
      case 'CHANNEL_DOWN': this.request('channelDown', 'ssap://tv/channelDown'); return;
      case 'MUTE': this.request('getMute', 'ssap://audio/getVolume'); return;
    }
    const mapped = pointerKeys[key];
    if (mapped) this.pointerButton(mapped);
    else this.status('Commande indisponible sur cette TV.');
  }

  switchInput(id: string) {
    if (this.connected) this.request('input', 'ssap://tv/switchInput', { inputId: id });
  }

  async forgetPairing(ipText: string) {
    this.disconnect(false);
    const ip = ipText.trim();
    if (isLocalIPv4(ip)) await SecureStore.deleteItemAsync('lg_key_' + ip.replace(/\./g, '_'));
    this.status('Jumelage oublié. Accepte de nouveau sur la TV.');
  }

  disconnect(announce = true) {
    this.epoch++;
    this.connected = false; this.pointerReady = false;
    if (this.control) {
      const socket = this.control; this.control = null;
      socket.onerror = null; socket.onclose = null;
      try { socket.close(); } catch {}
    }
    if (this.pointer) {
      const socket = this.pointer; this.pointer = null;
      socket.onerror = null; socket.onclose = null;
      try { socket.close(); } catch {}
    }
    this.state('disconnected');
    if (announce) this.status('Télévision déconnectée.');
  }
}
