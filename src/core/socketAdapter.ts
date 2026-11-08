import type { Socket } from './webos.ts';
import { localIPv4 } from './network.ts';

export type NativeSocketEvent = {
  id: number;
  type: 'open' | 'message' | 'error' | 'close';
  data?: string;
  code?: number;
  reason?: string;
};
export type NativeSocketBridge = {
  open: (id: number, url: string) => void;
  send: (id: number, data: string) => boolean;
  close: (id: number) => void;
  addListener: (event: 'onSocketEvent', listener: (e: NativeSocketEvent) => void) => { remove: () => void };
};

let nextSocketId = 1;

/** Validates both the SSAP control and the returned pointer-input URL. */
export function allowedSocketUrl(url: string): boolean {
  if (typeof url !== 'string' || url.length > 2048) return false;
  const match = /^ws:\/\/((?:\d{1,3}\.){3}\d{1,3}):3000\/[^\s\\#]*$/.exec(url);
  return !!match && localIPv4(match[1]) !== null;
}

/**
 * Small WebSocket-shaped adapter. The native module creates OkHttp handshakes
 * with NO Origin header; unlike React Native WebSocket, the TV can accept them.
 * Listener registration precedes native open so fast onOpen is never lost.
 */
export class NativeTvSocket implements Socket {
  readonly id: number;
  readyState = 0;
  onopen: null | (() => void) = null;
  onmessage: null | ((event: { data: unknown }) => void) = null;
  onerror: null | (() => void) = null;
  onclose: null | ((event?: { code?: number; reason?: string }) => void) = null;
  private readonly listener: { remove: () => void };
  private readonly bridge: NativeSocketBridge;

  constructor(bridge: NativeSocketBridge, url: string) {
    if (!allowedSocketUrl(url)) throw new Error('Connexion réseau non locale refusée.');
    this.bridge = bridge;
    this.id = nextSocketId++;
    this.listener = bridge.addListener('onSocketEvent', event => this.handle(event));
    try { bridge.open(this.id, url); }
    catch (e) { this.listener.remove(); this.readyState = 3; throw e; }
  }

  private handle(event: NativeSocketEvent) {
    if (event.id !== this.id || this.readyState === 3) return;
    switch (event.type) {
      case 'open':
        if (this.readyState === 0) { this.readyState = 1; this.onopen?.(); }
        break;
      case 'message':
        if (this.readyState === 1 && typeof event.data === 'string')
          this.onmessage?.({ data: event.data });
        break;
      case 'error':
        this.onerror?.();
        break;
      case 'close':
        this.readyState = 3;
        this.listener.remove();
        this.onclose?.({ code: event.code, reason: event.reason });
        break;
    }
  }

  send(frame: string) {
    if (this.readyState !== 1 || !this.bridge.send(this.id, frame))
      throw new Error('Connexion WebSocket fermée.');
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.listener.remove();
    try { this.bridge.close(this.id); } catch { /* already closed */ }
  }
}
