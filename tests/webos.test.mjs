import test from 'node:test';
import assert from 'node:assert/strict';
import { WebOsClient, needsPointer } from '../src/core/webos.ts';

class Clock {
  tasks = new Map(); next = 0; now = 0;
  after = (fn, ms) => { const id = ++this.next; this.tasks.set(id, { at: this.now + ms, fn }); return id; };
  cancel = id => this.tasks.delete(id);
  advance(ms) {
    const end = this.now + ms;
    while (true) {
      const entry = [...this.tasks].sort((a, b) => a[1].at - b[1].at).find(([, v]) => v.at <= end);
      if (!entry) break;
      this.tasks.delete(entry[0]); this.now = entry[1].at; entry[1].fn();
    }
    this.now = end;
  }
}
class FakeSocket {
  readyState = 0; frames = []; closed = false;
  onopen = null; onmessage = null; onerror = null; onclose = null;
  send = frame => this.frames.push(frame);
  close = () => { this.closed = true; this.readyState = 3; };
  open() { this.readyState = 1; this.onopen?.(); }
  message(msg) { this.onmessage?.({ data: JSON.stringify(msg) }); }
  last() { return JSON.parse(this.frames.at(-1)); }
  respond(payload) { this.message({ id: this.last().id, type: 'response', payload }); }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function setup(t, overrides = {}) {
  const states = [], sockets = [], values = new Map(); const clock = new Clock();
  const storage = {
    getItemAsync: async key => values.get(key) ?? null,
    setItemAsync: async (key, value) => { values.set(key, value); },
    deleteItemAsync: async key => { values.delete(key); }, ...overrides,
  };
  const client = new WebOsClient({ storage, clock, onState: s => states.push(s), createSocket: url => {
    const socket = new FakeSocket(); socket.url = url; sockets.push(socket); return socket;
  } });
  t.after(() => client.disconnect());
  return { client, states, sockets, values, clock, lastState: () => states.at(-1) };
}
async function ready(h, navigation = true) {
  await h.client.connect('192.168.1.2'); const ws = h.sockets[0]; ws.open();
  ws.message({ id: 'register', type: 'registered', payload: { 'client-key': 'private-key' } });
  ws.respond({ socketPath: 'ws://192.168.1.2:3000/resources/input' }); await flush();
  if (navigation) h.sockets[1].open();
  return ws;
}
test('manual connection uses only local IP and sends pairing permissions', async t => {
  const h = setup(t); await h.client.connect('192.168.1.2'); assert.equal(h.lastState().state, 'connecting');
  h.sockets[0].open(); assert.equal(h.lastState().state, 'pairing');
  const request = h.sockets[0].last(); assert.equal(request.type, 'register');
  assert.equal(request.payload.pairingType, 'PROMPT'); assert.ok(request.payload.manifest.permissions.includes('CONTROL_POWER'));
});
test('a nonlocal address never opens a socket', async t => {
  const h = setup(t); await h.client.connect('example.com'); assert.equal(h.sockets.length, 0); assert.equal(h.lastState().state, 'error');
});
test('a saved key is reused but never included in UI messages', async t => {
  const h = setup(t); h.values.set('lg_key_192_168_1_2', 'secret');
  await h.client.connect('192.168.1.2'); h.sockets[0].open();
  assert.equal(h.sockets[0].last().payload['client-key'], 'secret'); assert.ok(!JSON.stringify(h.states).includes('secret'));
});
test('storage read errors do not block an otherwise valid pairing', async t => {
  const h = setup(t, { getItemAsync: async () => { throw Error('locked'); } });
  await h.client.connect('192.168.1.2'); h.sockets[0].open(); assert.equal(h.lastState().state, 'pairing');
});
test('pairing persists the key and prepares navigation', async t => {
  const h = setup(t); await ready(h); assert.equal(h.lastState().state, 'connected'); assert.equal(h.lastState().navigation, true);
  assert.equal(h.values.get('lg_key_192_168_1_2'), 'private-key'); assert.equal(h.values.get('lg_tv_ip'), '192.168.1.2');
});
test('storage write errors do not destroy the connected session', async t => {
  const h = setup(t, { setItemAsync: async () => { throw Error('full'); } }); await ready(h); assert.equal(h.lastState().state, 'connected');
});
test('connection times out after 8 seconds and closes socket', async t => {
  const h = setup(t); await h.client.connect('192.168.1.2'); h.clock.advance(8000);
  assert.equal(h.lastState().state, 'error'); assert.equal(h.sockets[0].closed, true);
});
test('pairing expires instead of leaving a spinner forever', async t => {
  const h = setup(t); await h.client.connect('192.168.1.2'); h.sockets[0].open(); h.clock.advance(45000);
  assert.equal(h.lastState().state, 'error'); assert.match(h.lastState().message, /expiré/);
});
test('registration rejection is actionable', async t => {
  const h = setup(t); await h.client.connect('192.168.1.2'); h.sockets[0].open();
  h.sockets[0].message({ id: 'register', type: 'error', error: '403' }); assert.match(h.lastState().message, /Jumelage refusé/);
});
test('malformed, oversized and unrelated messages cannot crash the client', async t => {
  const h = setup(t); await h.client.connect('192.168.1.2'); const ws = h.sockets[0]; ws.open();
  for (const data of ['no-json', 'null', '42', '[]', 'a'.repeat(65537), { unsafe: true }]) ws.onmessage({ data });
  ws.message({ id: 'unrelated', type: 'response' }); assert.equal(h.lastState().state, 'pairing');
});
test('old callbacks cannot mutate a newer connection', async t => {
  const h = setup(t); await h.client.connect('192.168.1.2'); const old = h.sockets[0]; const onopen = old.onopen;
  await h.client.connect('192.168.1.3'); onopen(); assert.equal(old.frames.length, 0);
  assert.equal(h.sockets[1].url, 'ws://192.168.1.3:3000/');
});
test('disconnect cancels a delayed storage lookup', async t => {
  let resolve; const h = setup(t, { getItemAsync: () => new Promise(r => { resolve = r; }) });
  const pending = h.client.connect('192.168.1.2'); h.client.disconnect(); resolve(null); await pending;
  assert.equal(h.sockets.length, 0); assert.equal(h.lastState().state, 'idle');
});
test('foreign pointer host is rejected without making a connection', async t => {
  const h = setup(t); await h.client.connect('192.168.1.2'); const ws = h.sockets[0]; ws.open();
  ws.message({ type: 'registered', payload: {} }); ws.respond({ socketPath: 'ws://8.8.8.8:3000/x' }); await flush();
  assert.equal(h.sockets.length, 1); assert.equal(h.lastState().state, 'limited');
});
test('pointer connection timeout preserves audio and disables navigation', async t => {
  const h = setup(t); await ready(h, false); h.clock.advance(5000);
  assert.equal(h.lastState().state, 'limited'); assert.equal(h.lastState().navigation, false);
  assert.equal(h.sockets[1].closed, true);
});
test('OK uses the webOS click frame, arrows use button frames', async t => {
  const h = setup(t); await ready(h); await h.client.send('OK'); await h.client.send('UP');
  assert.deepEqual(h.sockets[1].frames, ['type:click\n\n', 'type:button\nname:UP\n\n']);
});
test('volume uses SSAP and waits for its acknowledgement', async t => {
  const h = setup(t); const ws = await ready(h); const action = h.client.send('VOLUME_UP');
  assert.equal(ws.last().uri, 'ssap://audio/volumeUp'); ws.respond({ returnValue: true }); await action;
});
test('mute uses the actual TV state, including nested replies', async t => {
  const h = setup(t); const ws = await ready(h); const action = h.client.send('MUTE');
  ws.respond({ volumeStatus: { muted: true } }); await flush();
  assert.equal(ws.last().uri, 'ssap://audio/setMute'); assert.equal(ws.last().payload.mute, false);
  ws.respond({ returnValue: true }); await action;
});
test('unknown mute state fails rather than guessing', async t => {
  const h = setup(t); const ws = await ready(h); const action = h.client.send('MUTE'); ws.respond({});
  await assert.rejects(action, /état sonore/);
});
test('command rejection propagates to the UI', async t => {
  const h = setup(t); const ws = await ready(h); const action = h.client.send('VOLUME_DOWN'); ws.respond({ returnValue: false });
  await assert.rejects(action, /refusée/);
});
test('request timeout rejects and does not leak timers', async t => {
  const h = setup(t); await ready(h); const action = h.client.send('PLAY');
  const rejection = assert.rejects(action, /répond pas/); h.clock.advance(5000); await rejection;
  assert.equal(h.clock.tasks.size, 0);
});
test('shutdown is sent without waiting for an acknowledgement from a TV going off', async t => {
  const h = setup(t); const ws = await ready(h); await h.client.send('POWER'); assert.equal(ws.last().uri, 'ssap://system/turnOff');
});
test('inputs discard malformed devices and send the selected input ID', async t => {
  const h = setup(t); const ws = await ready(h); const inputs = h.client.inputs();
  ws.respond({ devices: [{ id: 'HDMI_1', label: 'Console', connected: true }, null, { label: 'bad' }] });
  assert.deepEqual(await inputs, [{ id: 'HDMI_1', label: 'Console', connected: true }]);
  const action = h.client.switchInput('HDMI_1'); assert.equal(ws.last().payload.inputId, 'HDMI_1');
  ws.respond({ returnValue: true }); await action;
});
test('disconnect rejects in-flight requests and closes both sockets', async t => {
  const h = setup(t); await ready(h); const action = h.client.send('STOP');
  const rejection = assert.rejects(action, /fermée/); h.client.disconnect(); await rejection;
  assert.ok(h.sockets.every(s => s.closed)); assert.equal(h.clock.tasks.size, 0);
});
test('forget deletes only the selected TV key', async t => {
  const h = setup(t); await ready(h); h.values.set('lg_key_192_168_1_3', 'keep');
  await h.client.forget('192.168.1.2'); assert.equal(h.values.has('lg_key_192_168_1_2'), false);
  assert.equal(h.values.get('lg_key_192_168_1_3'), 'keep');
});
test('pointer loss does not claim the full remote is still connected', async t => {
  const h = setup(t); await ready(h); h.sockets[1].onclose(); assert.equal(h.lastState().state, 'limited');
  await assert.rejects(h.client.send('UP'), /Navigation indisponible/);
});
test('commands while disconnected fail clearly', async t => {
  const h = setup(t); await assert.rejects(h.client.send('POWER'), /Connectez/);
  await assert.rejects(h.client.request('audio/getVolume'), /Connectez/);
});
test('navigation capability is explicit', () => {
  assert.equal(needsPointer('OK'), true); assert.equal(needsPointer('N1'), true);
  assert.equal(needsPointer('VOLUME_UP'), false); assert.equal(needsPointer('POWER'), false);
});
test('closed navigation sockets reject commands before sending', async t => {
  const h = setup(t); await ready(h); h.sockets[1].readyState = 3;
  await assert.rejects(h.client.send('BACK'), /Navigation/);
});
test('control socket errors clear pending work', async t => {
  const h = setup(t); const ws = await ready(h); ws.onerror();
  h.clock.advance(250);
  assert.equal(h.lastState().state, 'error'); assert.ok(h.sockets.every(s => s.closed));
});
test('control closure offers a reconnection instead of stale connected status', async t => {
  const h = setup(t); const ws = await ready(h); ws.onclose(); assert.match(h.lastState().message, /déconnectée/);
});
test('pointer request refusal keeps the audio connection available', async t => {
  const h = setup(t); await h.client.connect('192.168.1.2'); const ws = h.sockets[0]; ws.open();
  ws.message({ type: 'registered', payload: {} }); ws.message({ id: ws.last().id, type: 'error' }); await flush();
  assert.equal(h.lastState().state, 'limited'); assert.match(h.lastState().message, /Volume disponible/);
});
test('repeat overload is bounded to sixteen requests', async t => {
  const h = setup(t); await ready(h);
  const pending = Array.from({ length: 16 }, () => h.client.request('audio/volumeUp'));
  const finished = Promise.allSettled(pending);
  await assert.rejects(h.client.request('audio/volumeUp'), /occupée/);
  h.client.disconnect(); assert.ok((await finished).every(v => v.status === 'rejected'));
});
test('synchronous send failure is rejected and its timer is removed', async t => {
  const h = setup(t); const ws = await ready(h); ws.send = () => { throw Error('offline'); };
  await assert.rejects(h.client.send('PLAY'), /Envoi impossible/); assert.equal(h.clock.tasks.size, 0);
});
test('empty input responses are safe and source is not a hidden navigation key', async t => {
  const h = setup(t); const ws = await ready(h); const inputs = h.client.inputs(); ws.respond({});
  assert.deepEqual(await inputs, []); await assert.rejects(h.client.send('SOURCE'), /sélecteur/);
});
test('all exposed pointer buttons use an explicit safe whitelist', async t => {
  const h = setup(t); await ready(h);
  for (const key of ['DOWN','LEFT','RIGHT','HOME','BACK','SETTINGS','EXIT','INFO','RED','GREEN','YELLOW','BLUE',
    'N0','N1','N2','N3','N4','N5','N6','N7','N8','N9']) await h.client.send(key);
  assert.equal(h.sockets[1].frames.length, 22);
  await assert.rejects(h.client.send('INJECT\nname:POWER'), /non prise en charge/);
});

test('stored key follows a stable SSDP UUID when the TV DHCP address changes', async t => {
  const h = setup(t);
  await h.client.connect('192.168.1.12', 'uuid:ABCDEF::urn:lge-com:service:webos-second-screen:1');
  const ws = h.sockets[0]; ws.open();
  ws.message({ id: 'register', type: 'registered', payload: { 'client-key': 'private-token' } });
  await flush();
  assert.equal(h.values.get('lg_webos_key_uuid_abcdef'), 'private-token');
  h.client.disconnect();
  await h.client.connect('192.168.1.88', 'uuid:abcdef');
  h.sockets[1].open();
  assert.equal(h.sockets[1].last().payload['client-key'], 'private-token');
  assert.equal(h.sockets[1].url, 'ws://192.168.1.88:3000/');
});

test('stored key is never reused for an unrelated SSDP identity on the same IP', async t => {
  const h = setup(t);
  h.values.set('lg_webos_key_uuid_oldtv', 'keep-for-old-tv');
  h.values.set('lg_key_192_168_1_12', 'legacy-key');
  await h.client.connect('192.168.1.12', 'uuid:NEWTV');
  h.sockets[0].open();
  assert.equal(h.sockets[0].last().payload['client-key'], undefined);
});

test('forgetting a paired TV deletes stable and legacy keys, not other TVs', async t => {
  const h = setup(t);
  h.values.set('lg_webos_key_uuid_tv1', 'forget');
  h.values.set('lg_key_192_168_1_12', 'legacy');
  h.values.set('lg_webos_key_uuid_tv2', 'preserve');
  await h.client.forget('192.168.1.12', 'uuid:tv1');
  assert.equal(h.values.has('lg_webos_key_uuid_tv1'), false);
  assert.equal(h.values.has('lg_key_192_168_1_12'), false);
  assert.equal(h.values.get('lg_webos_key_uuid_tv2'), 'preserve');
});

test('manual IP connection keeps legacy key compatibility', async t => {
  const h = setup(t);
  h.values.set('lg_key_192_168_1_12', 'manual-key');
  await h.client.connect('192.168.1.12');
  h.sockets[0].open();
  assert.equal(h.sockets[0].last().payload['client-key'], 'manual-key');
});


test('a webOS TV may request PIN pairing after a PROMPT registration', async t => {
  const h = setup(t);
  await h.client.connect('192.168.1.2');
  const ws = h.sockets[0]; ws.open();
  ws.message({ id: 'register', type: 'response', payload: { pairingType: 'PIN' } });
  assert.equal(h.lastState().state, 'pin');
  assert.match(h.lastState().message, /code/i);
});

test('explicit PIN pairing sends setPin on the existing secure pairing session', async t => {
  const h = setup(t);
  await h.client.connect('192.168.1.2', 'uuid:tv1', 'PIN');
  const ws = h.sockets[0]; ws.open();
  assert.equal(ws.last().payload.pairingType, 'PIN');
  assert.equal(h.lastState().state, 'pin');
  h.client.sendPairingPin('001234');
  assert.equal(ws.last().uri, 'ssap://pairing/setPin');
  assert.equal(ws.last().payload.pin, '001234');
  assert.equal(h.lastState().state, 'pairing');
  ws.message({ id: ws.last().id, type: 'response', payload: { returnValue: true } });
  ws.message({ id: 'register', type: 'registered', payload: { 'client-key': 'paired' } });
  await flush();
  assert.equal(h.lastState().state, 'limited');
  assert.equal(h.values.get('lg_webos_key_uuid_tv1'), 'paired');
  assert.equal(JSON.stringify(h.states).includes('001234'), false);
});

test('wrong PIN is retryable without storing the code or losing the connection', async t => {
  const h = setup(t);
  await h.client.connect('192.168.1.2', undefined, 'PIN');
  const ws = h.sockets[0]; ws.open();
  h.client.sendPairingPin('1234');
  const firstId = ws.last().id;
  assert.throws(() => h.client.sendPairingPin('2345'), /déjà envoyé/);
  ws.message({ id: firstId, type: 'error', error: '400' });
  assert.equal(h.lastState().state, 'pin');
  h.client.sendPairingPin('567890');
  assert.equal(ws.last().payload.pin, '567890');
  assert.equal(h.values.size, 0);
});

test('PIN input validation prevents non-numeric or unrequested submissions', async t => {
  const h = setup(t);
  await h.client.connect('192.168.1.2');
  const ws = h.sockets[0]; ws.open();
  for (const value of ['', '123', '123456789', '1 234', 'abcdef']) {
    assert.throws(() => h.client.sendPairingPin(value), /4 à 8 chiffres/);
  }
  assert.throws(() => h.client.sendPairingPin('123456'), /ne demande pas de code/);
  assert.equal(ws.frames.length, 1);
});

test('registration completion prevents replaying the PIN', async t => {
  const h = setup(t);
  await h.client.connect('192.168.1.2', undefined, 'PIN');
  const ws = h.sockets[0]; ws.open();
  ws.message({ id: 'register', type: 'registered', payload: { 'client-key': 'one' } });
  assert.throws(() => h.client.sendPairingPin('123456'), /ne demande pas de code/);
});

test('TV discovery can succeed even when command port closes before opening', async t => {
  const h = setup(t); await h.client.connect('192.168.1.2');
  h.sockets[0].onclose({ code: 1006 });
  assert.equal(h.lastState().state, 'error');
  assert.equal(h.lastState().diagnostic, 'WS3000-OPEN-1006');
  assert.match(h.lastState().message, /service de télécommande/);
});
test('premature close after register prompt explains pairing stage instead of generic disconnect', async t => {
  const h = setup(t); await h.client.connect('192.168.1.2');
  const socket = h.sockets[0]; socket.open(); socket.onclose({ code: 1001, reason: 'private-data-ignored' });
  assert.equal(h.lastState().diagnostic, 'WS3000-PAIR-1001');
  assert.match(h.lastState().message, /interrompu le jumelage/);
  assert.ok(!JSON.stringify(h.states).includes('private-data-ignored'));
});
test('a saved legacy key is retried only once after pairing socket closes', async t => {
  const h = setup(t); h.values.set('lg_key_192_168_1_2', 'old-private-key');
  await h.client.connect('192.168.1.2');
  h.sockets[0].open();
  assert.equal(h.sockets[0].last().payload['client-key'], 'old-private-key');
  h.sockets[0].onclose({ code: 1006 });
  assert.equal(h.sockets.length, 2);
  assert.equal(h.sockets[0].closed, true);
  assert.equal(h.sockets[1].url, 'ws://192.168.1.2:3000/');
  h.sockets[1].open();
  assert.equal(h.sockets[1].last().payload['client-key'], undefined);
  h.sockets[1].onclose({ code: 1006 });
  assert.equal(h.sockets.length, 2); // No infinite retry loop.
  assert.equal(h.lastState().state, 'error');
  assert.equal(h.lastState().diagnostic, 'WS3000-PAIR-1006');
});
test('a stale-key retry stores its new key only after TV approval', async t => {
  const h = setup(t); h.values.set('lg_key_192_168_1_2', 'old');
  await h.client.connect('192.168.1.2'); h.sockets[0].open(); h.sockets[0].onclose({ code: 1006 });
  h.sockets[1].open();
  assert.equal(h.values.get('lg_key_192_168_1_2'), 'old');
  h.sockets[1].message({ id: 'register', type: 'registered', payload: { 'client-key': 'new' } });
  await flush();
  assert.equal(h.values.get('lg_key_192_168_1_2'), 'new');
});
test('stale pairing key is retried on explicit invalid key but not user denial', async t => {
  const h = setup(t); h.values.set('lg_key_192_168_1_2', 'old');
  await h.client.connect('192.168.1.2'); h.sockets[0].open();
  h.sockets[0].message({ id: 'register', type: 'error', error: '401 invalid client-key' });
  assert.equal(h.sockets.length, 2);
  h.sockets[1].open();
  h.sockets[1].message({ id: 'register', type: 'error', error: '403 User denied access' });
  assert.equal(h.lastState().state, 'error');
  assert.equal(h.lastState().diagnostic, 'SSAP-403');
  assert.equal(h.sockets.length, 2);
});
test('rejected pairing with no saved key does not silently retry or display secrets', async t => {
  const h = setup(t); await h.client.connect('192.168.1.2'); h.sockets[0].open();
  h.sockets[0].message({ id: 'register', type: 'error', error: '403 User denied access token=abc123' });
  assert.equal(h.sockets.length, 1);
  assert.equal(h.lastState().diagnostic, 'SSAP-403');
  assert.ok(!JSON.stringify(h.states).includes('abc123'));
});
test('onerror followed by onclose produces exactly one diagnostic with close code', async t => {
  const h = setup(t); await h.client.connect('192.168.1.2');
  const ws = h.sockets[0]; ws.onerror(); h.clock.advance(100); ws.onclose({ code: 1006 });
  const count = h.states.length; h.clock.advance(10000);
  assert.equal(h.states.length, count); assert.equal(h.lastState().diagnostic, 'WS3000-OPEN-1006');
});
test('network error without close callback eventually returns a useful status', async t => {
  const h = setup(t); await h.client.connect('192.168.1.2'); h.sockets[0].onerror();
  h.clock.advance(249); assert.equal(h.lastState().state, 'connecting');
  h.clock.advance(1); assert.equal(h.lastState().diagnostic, 'WS3000-OPEN-X');
});
test('explicit disconnect during 250ms diagnostic delay prevents stale error', async t => {
  const h = setup(t); await h.client.connect('192.168.1.2');
  h.sockets[0].onerror(); h.client.disconnect(); h.clock.advance(5000);
  assert.equal(h.lastState().state, 'idle');
});
test('a connected socket closing reports session loss, not registration failure', async t => {
  const h = setup(t); const ws = await ready(h); ws.onclose({ code: 1006 });
  assert.equal(h.lastState().diagnostic, 'WS3000-ACTIVE-1006');
  assert.match(h.lastState().message, /déconnectée/);
});
