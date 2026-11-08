import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedSocketUrl, NativeTvSocket } from '../src/core/socketAdapter.ts';

function fake() {
  const listeners = new Map();
  const opens = [], sends = [], closes = [];
  const bridge = {
    open(id,url) { opens.push({id,url}); },
    send(id,data) { sends.push({id,data}); return true; },
    close(id) { closes.push(id); },
    addListener(_event,fn) {
      const id = listeners.size + 1; listeners.set(id,fn);
      return {remove:()=>listeners.delete(id)};
    },
  };
  const emit = e => { for(const fn of [...listeners.values()])fn(e); };
  return {bridge,emit,opens,sends,closes,listeners};
}
test('native socket accepts only canonical local ws port 3000',()=>{
  for(const value of ['ws://192.168.1.2:3000/','ws://10.0.0.2:3000/resources/abc','ws://172.16.1.4:3000/x']) assert.equal(allowedSocketUrl(value),true,value);
  for(const value of ['', 'ws://8.8.8.8:3000/', 'ws://localhost:3000/', 'wss://192.168.1.2:3001/', 'ws://192.168.1.2:3001/',
    'ws://192.168.1.2:3000', 'ws://192.168.1.2:3000\\evil', 'ws://192.168.1.2:3000/#frag',
    'ws://192.168.1.2:3000/hello world', 'ws://user@192.168.1.2:3000/', 'ws://192.168.01.2:3000/']) assert.equal(allowedSocketUrl(value),false,value);
});
test('listener is registered before native handshake',()=>{
  const x=fake(); const order=[];
  x.bridge.open=(id,url)=>{order.push(x.listeners.size);x.opens.push({id,url});};
  const ws=new NativeTvSocket(x.bridge,'ws://192.168.1.2:3000/');
  assert.deepEqual(order,[1]);assert.equal(ws.readyState,0);
  ws.close();
});
test('open, send, message and close follow WebSocket semantics',()=>{
  const x=fake();const ws=new NativeTvSocket(x.bridge,'ws://192.168.1.2:3000/');
  const events=[];ws.onopen=()=>events.push('open');ws.onmessage=e=>events.push(e.data);
  ws.onclose=e=>events.push('close-'+e.code);
  assert.throws(()=>ws.send('before open'),/fermée/);
  x.emit({id:ws.id,type:'open'});assert.equal(ws.readyState,1);
  ws.send('remote');x.emit({id:ws.id,type:'message',data:'answer'});
  x.emit({id:ws.id,type:'close',code:1008,reason:'INVALID_ORIGIN'});
  assert.equal(ws.readyState,3);assert.deepEqual(events,['open','answer','close-1008']);
  assert.deepEqual(x.sends,[{id:ws.id,data:'remote'}]);
  assert.equal(x.listeners.size,0);
  assert.throws(()=>ws.send('after close'),/fermée/);
});
test('unrelated socket events and late events are ignored',()=>{
  const x=fake();const a=new NativeTvSocket(x.bridge,'ws://10.0.0.1:3000/');
  const b=new NativeTvSocket(x.bridge,'ws://10.0.0.2:3000/');
  let ac=0,bc=0;a.onopen=()=>ac++;b.onopen=()=>bc++;
  x.emit({id:a.id,type:'open'});assert.equal(ac,1);assert.equal(bc,0);
  a.close();x.emit({id:a.id,type:'open'});assert.equal(ac,1);
  x.emit({id:b.id,type:'open'});assert.equal(bc,1);b.close();assert.equal(x.listeners.size,0);
});
test('native failures are forwarded without leaking raw reasons',()=>{
  const x=fake();const ws=new NativeTvSocket(x.bridge,'ws://192.168.1.2:3000/');
  let errors=0;let close=0;ws.onerror=()=>errors++;ws.onclose=e=>{close=e.code;};
  x.emit({id:ws.id,type:'error'});x.emit({id:ws.id,type:'close',code:1006});
  assert.equal(errors,1);assert.equal(close,1006);
});
test('explicit close removes listeners and cancels native operation',()=>{
  const x=fake();const ws=new NativeTvSocket(x.bridge,'ws://192.168.1.2:3000/');
  ws.close();ws.close();assert.deepEqual(x.closes,[ws.id]);assert.equal(x.listeners.size,0);
});
test('invalid URL fails before native operation',()=>{
  const x=fake();assert.throws(()=>new NativeTvSocket(x.bridge,'ws://example.org:3000/'),/non locale/);
  assert.equal(x.opens.length,0);assert.equal(x.listeners.size,0);
});
test('a throwing native open closes the JS subscription',()=>{
  const x=fake();x.bridge.open=()=>{throw Error('native missing');};
  assert.throws(()=>new NativeTvSocket(x.bridge,'ws://192.168.1.2:3000/'),/native missing/);
  assert.equal(x.listeners.size,0);
});
test('native errors can be retried via new independent socket instance',()=>{
  const x=fake();const a=new NativeTvSocket(x.bridge,'ws://192.168.1.2:3000/');
  x.emit({id:a.id,type:'close',code:1008});
  const b=new NativeTvSocket(x.bridge,'ws://192.168.1.2:3000/');
  assert.notEqual(a.id,b.id);x.emit({id:b.id,type:'open'});assert.equal(b.readyState,1);b.close();
});
