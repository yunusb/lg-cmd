import test from 'node:test';
import assert from 'node:assert/strict';
import { localIPv4, safePointerURL, discoveredTVs } from '../src/core/network.ts';
import { HoldRepeater } from '../src/core/hold.ts';
import { IR_CODES } from '../src/remote-keys.ts';

export class Clock {
  now = 0; next = 0; tasks = new Map();
  after = (fn, ms) => { const id = ++this.next; this.tasks.set(id, { at: this.now + ms, fn }); return id; };
  cancel = id => this.tasks.delete(id);
  advance(ms) {
    const end = this.now + ms;
    while (true) {
      const next = [...this.tasks.entries()].sort((a, b) => a[1].at - b[1].at).find(([, v]) => v.at <= end);
      if (!next) break;
      this.now = next[1].at; this.tasks.delete(next[0]); next[1].fn();
    }
    this.now = end;
  }
}
for (const ip of ['192.168.1.1', '10.1.0.0', '10.0.0.255', '172.16.1.2', '172.31.255.2', '169.254.4.2', '192.168.49.1']) {
  test(`accepts private IPv4 ${ip}`, () => assert.equal(localIPv4(ip), ip));
}
for (const ip of ['', 'localhost', 'https://192.168.1.2', '8.8.8.8', '127.0.0.1', '0.0.0.0',
  '192.168.1.256', '172.32.0.1', '172.15.0.1', '192.168.01.1', '192.168.1', '192.168.-1.1',
  '192.168.1.1:3000', '192.168.1.1/path', '::1', '169.255.1.1']) {
  test(`rejects invalid/nonlocal host ${JSON.stringify(ip)}`, () => assert.equal(localIPv4(ip), null));
}
test('trims only surrounding IP whitespace', () => assert.equal(localIPv4(' 192.168.1.7\n'), '192.168.1.7'));
test('pointer URL is restricted to the paired host and legacy port', () => {
  assert.equal(safePointerURL('ws://192.168.1.2:3000/resources/abc', '192.168.1.2'), true);
  for (const url of [null, 'ws://192.168.1.20:3000/x', 'wss://192.168.1.2:3001/x', 'ws://evil@192.168.1.2:3000/x',
    'ws://192.168.1.2:8000/x', 'ws://192.168.1.2:3000@evil/x', 'ws://192.168.1.2:3000/\\evil',
    'ws://192.168.1.2:3000/x#f', 'ws://192.168.1.2:3000/x y']) {
    assert.equal(safePointerURL(url, '192.168.1.2'), false);
  }
});
test('discovery validates, deduplicates and prioritises webOS', () => {
  const list = discoveredTVs([
    { host: '192.168.1.2', service: 'urn:lge-com:service:netrcu:1' },
    { host: '192.168.1.2', service: 'urn:lge-com:service:webos-second-screen:1', id: 'uuid:123' },
    { host: '192.168.1.2', service: 'urn:lge-com:service:netrcu:1' },
    { host: '8.8.8.8', service: 'webos-second-screen' },
    { host: '192.168.1.5', service: 'dlna' }, null, {},
  ]);
  assert.equal(list.length, 1); assert.equal(list[0].protocol, 'webos'); assert.equal(list[0].id, 'uuid:123');
});
test('NetCast discovery is explicitly distinct', () => {
  assert.equal(discoveredTVs([{ host: '192.168.1.4', service: 'urn:lge-com:service:netrcu:1' }])[0].protocol, 'netcast');
  assert.deepEqual(discoveredTVs(null), []); assert.deepEqual(discoveredTVs({}), []);
});
test('discovery ignores huge lists and truncates peer identifiers', () => {
  const list = Array.from({ length: 200 }, (_, n) => ({ host: `10.0.0.${n}`, service: 'urn:lge-com:service:webos-second-screen:1', id: 'a'.repeat(500) }));
  assert.equal(discoveredTVs(list).length, 100);
  assert.equal(discoveredTVs(list)[0].id, '10.0.0.0'); // hostile oversized USN ignored
});
test('hold waits before repeating and stops immediately on release', () => {
  const clock = new Clock(); const hold = new HoldRepeater(clock); let count = 0;
  hold.start(() => count++); clock.advance(379); assert.equal(count, 0);
  clock.advance(1); assert.equal(count, 1); clock.advance(360); assert.equal(count, 3);
  hold.stop(); clock.advance(10000); assert.equal(count, 3); assert.equal(clock.tasks.size, 0);
});
test('a short press does not generate any repeated command', () => {
  const clock = new Clock(); const hold = new HoldRepeater(clock); let count = 0;
  hold.start(() => count++); clock.advance(100); hold.stop(); clock.advance(1000); assert.equal(count, 0);
});
test('starting another hold cancels the previous one', () => {
  const clock = new Clock(); const hold = new HoldRepeater(clock); let a = 0; let b = 0;
  hold.start(() => a++); clock.advance(300); hold.start(() => b++); clock.advance(400);
  assert.equal(a, 0); assert.equal(b, 1); hold.stop();
});
test('a callback can safely stop its own hold', () => {
  const clock = new Clock(); const hold = new HoldRepeater(clock); let count = 0;
  hold.start(() => { count++; hold.stop(); }); clock.advance(5000); assert.equal(count, 1);
});
test('all working IR codes retain LG address and inverse command checksum', () => {
  assert.equal(Object.keys(IR_CODES).length, 36);
  for (const [key, code] of Object.entries(IR_CODES)) {
    assert.equal(code >>> 16, 0x20df, key);
    assert.equal(((code >>> 8) & 255) ^ (code & 255), 255, key);
  }
  assert.equal(IR_CODES.POWER, 0x20df10ef); assert.equal(IR_CODES.OK, 0x20df22dd);
  assert.equal(IR_CODES.VOLUME_UP, 0x20df40bf); assert.equal(IR_CODES.VOLUME_DOWN, 0x20dfc03f);
});
