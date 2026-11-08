import type { RemoteKey } from '../remote-keys.ts';
import { localIPv4, safePointerURL, stableTvId } from './network.ts';
import { scheduler, type Scheduler } from './hold.ts';

type Json = Record<string, unknown>;
const record = (v: unknown): Json => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Json : {};
export type State = 'idle' | 'connecting' | 'pairing' | 'pin' | 'connected' | 'limited' | 'error';
export type Snapshot = { state: State; message: string; navigation: boolean; diagnostic?: string };
export type TvInput = { id: string; label: string; connected: boolean };
export type Socket = {
  readyState: number; send: (data: string) => void; close: () => void;
  onopen: null | (() => void);
  onerror: null | ((event?: { message?: string }) => void);
  onclose: null | ((event?: { code?: number; reason?: string }) => void);
  onmessage: null | ((event: { data: unknown }) => void);
};
export type Storage = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
};
export const INITIAL: Snapshot = { state: 'idle', message: 'Connectez une TV sur le même réseau.', navigation: false };
const permissions = ['CONTROL_AUDIO', 'CONTROL_POWER', 'CONTROL_INPUT_TV',
  'CONTROL_INPUT_MEDIA_PLAYBACK', 'READ_INPUT_DEVICE_LIST', 'CONTROL_MOUSE_AND_KEYBOARD'];
const pointer: Partial<Record<RemoteKey, string>> = {
  UP: 'UP', DOWN: 'DOWN', LEFT: 'LEFT', RIGHT: 'RIGHT', HOME: 'HOME', BACK: 'BACK',
  SETTINGS: 'MENU', EXIT: 'EXIT', INFO: 'INFO', RED: 'RED', GREEN: 'GREEN', YELLOW: 'YELLOW', BLUE: 'BLUE',
  N0: '0', N1: '1', N2: '2', N3: '3', N4: '4', N5: '5', N6: '6', N7: '7', N8: '8', N9: '9',
};
const commands: Partial<Record<RemoteKey, string>> = {
  VOLUME_UP: 'audio/volumeUp', VOLUME_DOWN: 'audio/volumeDown',
  CHANNEL_UP: 'tv/channelUp', CHANNEL_DOWN: 'tv/channelDown',
  PLAY: 'media.controls/play', PAUSE: 'media.controls/pause', STOP: 'media.controls/stop',
  REWIND: 'media.controls/rewind', FORWARD: 'media.controls/fastForward',
};
export function needsPointer(key: RemoteKey) { return key === 'OK' || key in pointer; }

/** UI-independent SSAP client. All I/O and time are injected for deterministic tests. */
export class WebOsClient {
  private socket?: Socket;
  private navigation?: Socket;
  private generation = 0;
  private sequence = 0;
  private host = '';
  private pairedId: string | null = null;
  private timer: unknown;
  private pointerTimer: unknown;
  private registered = false;
  private pointerReady = false;
  private awaitingPin = false;
  private pinPending = false;
  private pinRequestId: string | null = null;
  private pending = new Map<string, { resolve: (p: Json) => void; reject: (e: Error) => void; timer: unknown }>();
  private createSocket: (url: string) => Socket;
  private storage: Storage;
  private onState: (s: Snapshot) => void;
  private clock: Scheduler;
  constructor(options: { createSocket: (url: string) => Socket; storage: Storage;
    onState: (s: Snapshot) => void; clock?: Scheduler }) {
    this.createSocket = options.createSocket; this.storage = options.storage;
    this.onState = options.onState; this.clock = options.clock ?? scheduler;
  }
  private emit(state: State, message: string, diagnostic?: string) {
    this.onState({ state, message, navigation: this.pointerReady, ...(diagnostic ? { diagnostic } : {}) });
  }
  private key(ip = this.host) {
    // A stable SSDP identity survives DHCP changes and avoids keying solely on IP.
    return this.pairedId
      ? 'lg_webos_key_' + this.pairedId.replace(/[^a-z0-9]/gi, '_')
      : 'lg_key_' + ip.replace(/\./g, '_');
  }
  private clearSocket(socket?: Socket) {
    if (!socket) return;
    socket.onopen = socket.onclose = socket.onerror = socket.onmessage = null;
    try { socket.close(); } catch { /* already closed */ }
  }
  private reset() {
    this.generation++; this.clock.cancel(this.timer); this.clock.cancel(this.pointerTimer);
    this.registered = this.pointerReady = false;
    this.awaitingPin = this.pinPending = false;
    this.pinRequestId = null;
    this.pairedId = null;
    this.clearSocket(this.socket); this.clearSocket(this.navigation);
    this.socket = this.navigation = undefined;
    for (const p of this.pending.values()) { this.clock.cancel(p.timer); p.reject(new Error('Connexion fermée.')); }
    this.pending.clear();
  }
  disconnect() { this.reset(); this.emit('idle', 'Wi-Fi déconnecté.'); }
  private fail(message: string, diagnostic?: string) { this.reset(); this.emit('error', message, diagnostic); }

  async connect(value: string, deviceId?: string, pairingMode: 'PROMPT' | 'PIN' = 'PROMPT') {
    this.reset();
    this.pairedId = stableTvId(deviceId);
    const host = localIPv4(value);
    if (!host) { this.emit('error', 'Cette adresse réseau locale est invalide.', 'ADDR-INVALID'); return; }
    this.host = host;
    const generation = this.generation;
    const valid = () => generation === this.generation;
    this.emit('connecting', 'Connexion à la télévision…');
    let storedKey: string | null = null;
    try { storedKey = await this.storage.getItemAsync(this.key(host)); }
    catch { /* Pairing also works without local secure-storage access. */ }
    if (!valid()) return;

    // On older TVs the registered client key can become invalid after a reset.
    // Retry once without it only if the socket closes before approval or the TV
    // explicitly reports an invalid key. Never loop or silently bypass a denial.
    const launch = (clientKey: string | null, attempt: number): void => {
      if (!valid()) return;
      let ws: Socket;
      try { ws = this.createSocket(`ws://${host}:3000/`); }
      catch {
        this.fail('Télévision trouvée, mais le canal de commande ne s’ouvre pas. Vérifiez « LG Connect Apps » sur la TV.',
          'WS3000-OPEN');
        return;
      }
      this.socket = ws;
      let opened = false;
      const retryWithoutKey = (): boolean => {
        if (!valid() || ws !== this.socket || !clientKey || attempt !== 0 || this.registered) return false;
        this.clock.cancel(this.timer);
        this.clearSocket(ws);
        this.socket = undefined;
        this.emit('connecting', 'Ancienne association non reconnue. Nouvelle demande à accepter sur la TV…');
        launch(null, 1);
        return true;
      };
      const interrupted = (code?: number) => {
        if (!valid() || ws !== this.socket) return;
        // A 1008 policy rejection will not be fixed by retrying the same request.
        if (opened && code !== 1008 && !this.registered && retryWithoutKey()) return;
        const suffix = typeof code === 'number' && Number.isInteger(code) && code >= 1000 && code <= 4999
          ? String(code) : 'X';
        if (!opened) this.fail(
          'La TV apparaît dans la recherche, mais le service de télécommande ne répond pas (port 3000). Vérifiez « LG Connect Apps ».',
          'WS3000-OPEN-' + suffix);
        else if (!this.registered && code === 1008) this.fail(
          'La TV refuse la connexion de télécommande (1008). Vérifiez « LG Connect Apps » et les autorisations sur son écran.',
          'WS3000-PAIR-1008');
        else if (!this.registered) this.fail(
          'La TV a interrompu le jumelage. Vérifiez les demandes d’autorisation sur son écran, puis réessayez.',
          'WS3000-PAIR-' + suffix);
        else this.fail('TV déconnectée. Vérifiez le réseau et reconnectez-la, ou utilisez l’infrarouge.',
          'WS3000-ACTIVE-' + suffix);
      };
      this.timer = this.clock.after(() => {
        if (!valid() || ws !== this.socket) return;
        if (!opened) interrupted();
        else this.fail('La TV n’a pas confirmé l’association. Activez « LG Connect Apps » et acceptez sur son écran.',
          'WS3000-PAIR-TIMEOUT');
      }, 8000);

      ws.onopen = () => {
        if (!valid() || ws !== this.socket) return;
        opened = true;
        this.clock.cancel(this.timer);
        this.awaitingPin = pairingMode === 'PIN';
        this.emit(this.awaitingPin ? 'pin' : 'pairing',
          this.awaitingPin ? 'Entrez uniquement le code affiché sur la TV.' :
          'Acceptez la demande sur la TV. L’infrarouge peut servir à valider.');
        this.timer = this.clock.after(() => {
          if (valid() && ws === this.socket) this.fail(
            'Le délai de jumelage a expiré. Vérifiez « LG Connect Apps » et acceptez la demande sur la TV.',
            'WS3000-PAIR-TIMEOUT');
        }, 45000);
        try {
          ws.send(JSON.stringify({ id: 'register', type: 'register', payload: {
            pairingType: pairingMode, forcePairing: false,
            manifest: { manifestVersion: 1, appVersion: '1.2', permissions },
            ...(clientKey ? { 'client-key': clientKey } : {}),
          } }));
        } catch { this.fail('Impossible d’envoyer la demande d’association.', 'WS3000-SEND'); }
      };
      ws.onmessage = event => {
        if (!valid() || ws !== this.socket) return;
        this.message(event.data, generation, rawError => {
          if (!valid() || ws !== this.socket) return;
          const reason = typeof rawError === 'string' ? rawError.slice(0, 200).toLowerCase() : '';
          const code = /\b(401|403|404|500)\b/.exec(reason)?.[1] ?? 'ERR';
          const invalidKey = /invalid.*(key|token)|unauthorized|\b401\b/i.test(reason);
          if (invalidKey && retryWithoutKey()) return;
          if (/user denied|user rejected|access denied/i.test(reason))
            this.fail('Jumelage refusé sur la TV. Autorisez cette application dans « LG Connect Apps ».',
              'SSAP-' + code);
          else this.fail('Jumelage refusé. Vérifiez les autorisations de connexion sur la TV.',
            'SSAP-' + code);
        });
      };
      // Android can fire onerror before onclose. Keep the later close code when
      // available; otherwise report a bounded transport error after 250 ms.
      ws.onerror = () => {
        if (!valid() || ws !== this.socket) return;
        this.clock.cancel(this.timer);
        this.timer = this.clock.after(() => interrupted(), 250);
      };
      ws.onclose = event => interrupted(event?.code);
    };
    launch(storedKey && storedKey.length <= 2048 ? storedKey : null, 0);
  }

  private message(raw: unknown, generation: number, onRegisterError?: (error: unknown) => void) {
    if (typeof raw !== 'string' || raw.length > 65536) return;
    let msg: Json;
    try { msg = record(JSON.parse(raw)); } catch { return; }
    const payload = record(msg.payload);
    if (msg.type === 'registered' && !this.registered) {
      this.clock.cancel(this.timer); this.registered = true;
      this.awaitingPin = this.pinPending = false;
      this.pinRequestId = null;
      const host = this.host;
      const key = payload['client-key'];
      if (typeof key === 'string' && key.length <= 2048) {
        void this.storage.setItemAsync(this.key(host), key).catch(() => {});
      }
      void this.storage.setItemAsync('lg_tv_ip', host).catch(() => {});
      this.emit('limited', 'TV connectée. Préparation des flèches…');
      void this.request('com.webos.service.networkinput/getPointerInputSocket').then(p => {
        if (generation === this.generation) this.openPointer(p.socketPath, generation);
      }).catch(() => {
        if (generation === this.generation) this.emit('limited', 'Volume disponible. Flèches indisponibles : essayez un nouveau jumelage.');
      });
      return;
    }
    if (msg.id === 'register' && (msg.type === 'error' || payload.returnValue === false)) {
      onRegisterError?.(msg.error ?? payload.errorCode ?? '');
      return;
    }
    // Some older webOS TVs request a PIN rather than an on-screen acceptance.
    if (msg.id === 'register' && msg.type === 'response' && !this.registered) {
      const announced = typeof payload.pairingType === 'string' ? payload.pairingType.toUpperCase() : '';
      if (announced === 'PIN' || announced === 'COMBINED') {
        this.awaitingPin = true;
        this.emit('pin', 'La TV demande un code. Saisissez les chiffres affichés sur son écran.');
      }
      return;
    }
    if (typeof msg.id !== 'string') return;
    if (msg.id === this.pinRequestId && (msg.type === 'response' || msg.type === 'error')) {
      this.pinPending = false;
      this.pinRequestId = null;
      if (msg.type === 'error' || payload.returnValue === false) {
        this.awaitingPin = true;
        this.emit('pin', 'Code refusé. Vérifiez les chiffres indiqués sur la TV.');
      }
      return;
    }
    const pending = this.pending.get(msg.id);
    if (!pending || (msg.type !== 'response' && msg.type !== 'error')) return;
    this.clock.cancel(pending.timer); this.pending.delete(msg.id);
    if (msg.type === 'error' || payload.returnValue === false) pending.reject(new Error('Commande refusée par la TV. Vérifiez le jumelage.'));
    else pending.resolve(payload);
  }

  /** LG webOS PIN variant: send only an explicitly entered short numeric code. */
  sendPairingPin(value: string): void {
    const pin = value.trim();
    if (!/^\d{4,8}$/.test(pin)) throw new Error('Le code doit comporter 4 à 8 chiffres.');
    if (!this.awaitingPin || this.registered || this.socket?.readyState !== 1) {
      throw new Error('La TV ne demande pas de code. Lancez le jumelage par code.');
    }
    if (this.pinPending) throw new Error('Code déjà envoyé. Attendez la réponse de la TV.');
    const id = 'pairing-pin-' + (++this.sequence);
    this.pinPending = true;
    this.pinRequestId = id;
    try {
      this.socket.send(JSON.stringify({
        id, type: 'request', uri: 'ssap://pairing/setPin', payload: { pin },
      }));
      this.emit('pairing', 'Code envoyé. Autorisation en cours…');
    } catch {
      this.pinPending = false;
      this.pinRequestId = null;
      this.emit('pin', 'Envoi du code impossible, réessayez.');
      throw new Error('Envoi du code impossible.');
    }
  }

  private openPointer(url: unknown, generation: number) {
    if (!safePointerURL(url, this.host)) { this.emit('limited', 'Adresse de navigation non prise en charge. Volume disponible.'); return; }
    const valid = () => generation === this.generation;
    const unavailable = () => {
      if (!valid()) return;
      this.clock.cancel(this.pointerTimer); this.pointerReady = false;
      this.clearSocket(this.navigation); this.navigation = undefined;
      this.emit('limited', 'Volume disponible. Navigation indisponible sur cette TV.');
    };
    try {
      const nav = this.createSocket(url); this.navigation = nav;
      this.pointerTimer = this.clock.after(unavailable, 5000);
      nav.onopen = () => {
        if (!valid()) return;
        this.clock.cancel(this.pointerTimer); this.pointerReady = true;
        this.emit('connected', 'TV connectée en Wi-Fi.');
      };
      nav.onerror = unavailable; nav.onclose = unavailable;
    } catch { unavailable(); }
  }

  request(uri: string, payload: Json = {}): Promise<Json> {
    if (!this.registered || this.socket?.readyState !== 1) return Promise.reject(new Error('Connectez d’abord la TV.'));
    if (this.pending.size >= 16) return Promise.reject(new Error('La TV est occupée. Relâchez la touche.'));
    const id = String(++this.sequence);
    return new Promise((resolve, reject) => {
      const timer = this.clock.after(() => {
        this.pending.delete(id); reject(new Error('La TV ne répond pas à cette commande.'));
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      try { this.socket!.send(JSON.stringify({ id, type: 'request', uri: 'ssap://' + uri, payload })); }
      catch { this.clock.cancel(timer); this.pending.delete(id); reject(new Error('Envoi impossible. Reconnectez la TV.')); }
    });
  }

  async send(key: RemoteKey): Promise<void> {
    if (!this.registered) throw new Error('Connectez d’abord la TV ou choisissez Infrarouge.');
    if (key === 'MUTE') {
      const volume = await this.request('audio/getVolume');
      const muted = volume.muted ?? record(volume.volumeStatus).muted;
      if (typeof muted !== 'boolean') throw new Error('La TV ne renvoie pas son état sonore.');
      await this.request('audio/setMute', { mute: !muted }); return;
    }
    if (key === 'POWER') {
      // A shutdown may close the socket before an acknowledgement can arrive.
      this.socket?.send(JSON.stringify({ id: String(++this.sequence), type: 'request', uri: 'ssap://system/turnOff' }));
      return;
    }
    if (commands[key]) { await this.request(commands[key]); return; }
    if (key === 'SOURCE') throw new Error('Utilisez le sélecteur de sources.');
    if (!this.pointerReady || this.navigation?.readyState !== 1) throw new Error('Navigation indisponible. Utilisez l’infrarouge.');
    const frame = key === 'OK' ? 'type:click\n\n' : pointer[key] ? `type:button\nname:${pointer[key]}\n\n` : null;
    if (!frame) throw new Error('Commande non prise en charge.');
    this.navigation.send(frame);
  }
  async inputs(): Promise<TvInput[]> {
    const payload = await this.request('tv/getExternalInputList');
    if (!Array.isArray(payload.devices)) return [];
    return payload.devices.slice(0, 40).map(record).filter(v => typeof v.id === 'string').map(v => ({
      id: v.id as string, label: typeof v.label === 'string' ? v.label : v.id as string,
      connected: v.connected === true,
    }));
  }
  async switchInput(id: string) { await this.request('tv/switchInput', { inputId: id }); }
  async forget(value: string, deviceId?: string) {
    this.disconnect();
    const host = localIPv4(value);
    if (!host) return;
    const stableId = stableTvId(deviceId);
    // Clear the stable and any legacy IP-based key without destroying other TV keys.
    if (stableId) {
      await this.storage.deleteItemAsync('lg_webos_key_' + stableId.replace(/[^a-z0-9]/gi, '_'));
    }
    await this.storage.deleteItemAsync('lg_key_' + host.replace(/\./g, '_'));
  }
}
