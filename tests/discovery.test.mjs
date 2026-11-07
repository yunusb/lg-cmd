import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveredTVs, stableTvId } from '../src/core/network.ts';
import { PREFERRED_TV_KEY, loadPreferredTv, rememberTv, findPreferredTv } from '../src/core/tvMemory.ts';

const WEBOS = 'urn:lge-com:service:webos-second-screen:1';
const NETCAST = 'urn:schemas-udap:service:netrcu:1';
const NETCAST_ALIAS = 'urn:lge-com:service:netrcu:1';

test('SSDP stable identity ignores service suffix and case', () => {
  assert.equal(stableTvId('UUID:AABB-0011::urn:lge-com:service:webos-second-screen:1'), 'uuid:aabb-0011');
  assert.equal(stableTvId('uuid:aabb-0011'), 'uuid:aabb-0011');
  for (const bad of ['', '192.168.1.2', 'https://example.com/', 'uuid:a/b', 'uuid:a'.repeat(300), {}, null]) {
    assert.equal(stableTvId(bad), null);
  }
});

test('discovery recognizes only specific LG webOS/NetCast service names', () => {
  const list = discoveredTVs([
    { host: '192.168.1.3', service: WEBOS, id: 'uuid:abc' },
    { host: '192.168.1.4', service: NETCAST, id: 'uuid:def' },
    { host: '192.168.1.5', service: 'urn:evil:webos-second-screen:1', id: 'uuid:ghi' },
    { host: '192.168.1.6', service: 'urn:schemas-upnp-org:device:MediaRenderer:1', id: 'uuid:jkl' },
    { host: '8.8.8.8', service: WEBOS, id: 'uuid:mno' },
  ]);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map(d => d.protocol), ['webos','netcast']);
  assert.equal(list[0].label, 'Téléviseur LG · webOS');
});

test('responses from Ethernet/Wi-Fi with same UUID collapse to one TV', () => {
  const devices = discoveredTVs([
    { host: '192.168.1.10', service: WEBOS, id: 'uuid:DEVICE::urn:lge-com:service:webos-second-screen:1' },
    { host: '192.168.1.11', service: WEBOS, id: 'uuid:device::urn:lge-com:service:webos-second-screen:1' },
  ]);
  assert.equal(devices.length, 1);
  assert.equal(devices[0].id, 'uuid:device');
});

test('new DHCP address of remembered TV is found by its identity', () => {
  const saved = { id: 'uuid:mytv', host: '192.168.1.18' };
  const list = discoveredTVs([
    { host: '192.168.1.99', service: WEBOS, id: 'uuid:MYTV::' + WEBOS },
    { host: '192.168.1.18', service: WEBOS, id: 'uuid:someone-else' },
  ]);
  assert.equal(findPreferredTv(saved, list)?.host, '192.168.1.99');
});

test('never silently auto-pick a different TV, even at same IP', () => {
  const saved = { id: 'uuid:mytv', host: '192.168.1.18' };
  const devices = discoveredTVs([{ host: '192.168.1.18', service: WEBOS, id: 'uuid:intruder' }]);
  assert.equal(findPreferredTv(saved, devices), null);
  assert.equal(findPreferredTv(null, devices), null);
  assert.equal(findPreferredTv(saved, discoveredTVs([{ host:'192.168.1.18',service:NETCAST,id:'uuid:mytv' }])),null);
});

test('paired TV memory loads only validated private hosts and safe identifiers', () => {
  assert.equal(PREFERRED_TV_KEY, 'lg_preferred_tv_v1');
  assert.deepEqual(loadPreferredTv('{"id":"uuid:abc","host":"192.168.1.5"}'), { id:'uuid:abc',host:'192.168.1.5' });
  for(const bad of ['null','[]','{}','{', '{"id":"uuid:abc","host":"8.8.8.8"}',
    '{"id":"uuid:one","host":"localhost"}','{"id":"evil","host":"192.168.1.5"}',
    'x'.repeat(513)]) assert.equal(loadPreferredTv(bad), null);
});

test('manual device without UUID is saved by IP only, not a fabricated UUID', () => {
  const tv = discoveredTVs([{ host: '10.1.1.2', service: WEBOS }])[0];
  assert.equal(tv.id,'10.1.1.2');
  const memory = rememberTv(tv);
  assert.deepEqual(loadPreferredTv(JSON.stringify(memory)), memory);
  assert.deepEqual(findPreferredTv(memory,[tv]), tv);
});

test('when two TVs are found without a remembered device, selection stays explicit', () => {
  const list = discoveredTVs([
    {host:'192.168.1.6',service:WEBOS,id:'uuid:first'},
    {host:'192.168.1.7',service:WEBOS,id:'uuid:second'},
  ]);
  assert.equal(findPreferredTv(null,list),null);
  assert.equal(list.length,2);
});

test('all imported device IDs and descriptions are bounded', () => {
  const list = discoveredTVs([{ host:'192.168.1.2',service:WEBOS,id:'uuid:'+'A'.repeat(2000) }]);
  assert.equal(list[0].id,'192.168.1.2');
});


test('discovery gate never acquires multicast resources in background', async () => {
  const { shouldBeginDiscovery } = await import('../src/core/discoveryPolicy.ts');
  const data = { foreground:true, restored:true, panel:'connection', mode:'wifi', scanned:false,
    scanning:false, wifiReady:false, connectionState:'idle' };
  assert.equal(shouldBeginDiscovery(data), true);
  assert.equal(shouldBeginDiscovery({ ...data, foreground:false }), false);
  assert.equal(shouldBeginDiscovery({ ...data, mode:'ir' }), false);
  assert.equal(shouldBeginDiscovery({ ...data, panel:null }), false);
  assert.equal(shouldBeginDiscovery({ ...data, scanning:true }), false);
  assert.equal(shouldBeginDiscovery({ ...data, scanned:true }), false);
  assert.equal(shouldBeginDiscovery({ ...data, wifiReady:true }), false);
  assert.equal(shouldBeginDiscovery({ ...data, connectionState:'pin' }), false);
  assert.equal(shouldBeginDiscovery({ ...data, connectionState:'pairing' }), false);
  assert.equal(shouldBeginDiscovery({ ...data, connectionState:'connecting' }), false);
});

test('real NetCast UDAP SSDP namespace and legacy alias are both classified as NetCast', () => {
  const devices = discoveredTVs([
    { host: '192.168.1.21', service: NETCAST, id: 'uuid:old-one' },
    { host: '192.168.1.22', service: NETCAST_ALIAS, id: 'uuid:old-two' },
  ]);
  assert.equal(devices.length, 2);
  assert.ok(devices.every(d => d.protocol === 'netcast'));
  assert.ok(devices.every(d => d.label.includes('NetCast')));
});
test('a NetCast device is never mistaken for webOS or automatically paired as webOS', () => {
  const devices = discoveredTVs([{ host: '192.168.1.33', service: NETCAST, id: 'uuid:netcast-only' }]);
  assert.equal(devices[0].protocol, 'netcast');
  assert.equal(findPreferredTv({ id: 'uuid:netcast-only', host: '192.168.1.33' }, devices), null);
});
