import test from 'node:test';
import assert from 'node:assert/strict';
import { PressSession } from '../src/core/press.ts';

class Clock {
  now = 0; next = 0; tasks = new Map();
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
function setup(repeat = true) {
  const clock = new Clock(); const session = new PressSession(clock); const actions = [], feedback = [];
  const options = { repeat, action: () => actions.push(clock.now), feedback: () => { feedback.push(clock.now); } };
  return { clock, session, options, actions, feedback };
}

test('repeat key sends its initial command and tactile tick at touch-down', () => {
  const h = setup(); h.session.begin(); h.session.pressIn(h.options);
  assert.deepEqual(h.actions, [0]); assert.deepEqual(h.feedback, [0]);
});
test('short tap emits exactly one command, not a duplicate on release', () => {
  const h = setup(); h.session.begin(); h.session.pressIn(h.options); h.clock.advance(40);
  h.session.pressOut(); h.session.press(h.options); h.clock.advance(1000);
  assert.deepEqual(h.actions, [0]); assert.deepEqual(h.feedback, [0]); assert.equal(h.clock.tasks.size, 0);
});
test('held key repeats only after 380 ms, then at 180 ms, without vibration barrage', () => {
  const h = setup(); h.session.begin(); h.session.pressIn(h.options);
  h.clock.advance(379); assert.deepEqual(h.actions, [0]);
  h.clock.advance(1); h.clock.advance(360);
  assert.deepEqual(h.actions, [0, 380, 560, 740]); assert.deepEqual(h.feedback, [0]);
  h.session.pressOut(); h.session.press(h.options); h.clock.advance(1000); assert.equal(h.actions.length, 4);
});
test('touch end just before repeat prevents a late volume command', () => {
  const h = setup(); h.session.begin(); h.session.pressIn(h.options); h.clock.advance(379);
  h.session.pressOut(); h.clock.advance(2); h.session.press(h.options);
  assert.deepEqual(h.actions, [0]); assert.equal(h.clock.tasks.size, 0);
});
test('ordinary button gives tactile feedback on down but acts once on valid release', () => {
  const h = setup(false); h.session.begin(); h.session.pressIn(h.options); h.clock.advance(2000);
  assert.deepEqual(h.actions, []); assert.deepEqual(h.feedback, [0]);
  h.session.pressOut(); h.session.press(h.options); assert.deepEqual(h.actions, [2000]);
  assert.deepEqual(h.feedback, [0]);
});
test('power-like button never repeats, regardless of hold duration', () => {
  const h = setup(false); h.session.begin(); h.session.pressIn(h.options); h.clock.advance(10000);
  h.session.pressOut(); h.session.press(h.options); h.clock.advance(10000);
  assert.deepEqual(h.actions, [10000]); assert.equal(h.feedback.length, 1);
});
test('disabled controls neither vibrate nor send', () => {
  const h = setup(); const opts = { ...h.options, disabled: true };
  h.session.begin(); h.session.pressIn(opts); h.session.pressOut(); h.session.press(opts); h.clock.advance(5000);
  assert.deepEqual(h.actions, []); assert.deepEqual(h.feedback, []);
});
test('becoming disabled mid-hold cancels repeats and suppresses release', () => {
  const h = setup(); h.session.begin(); h.session.pressIn(h.options); h.session.cancel();
  h.clock.advance(5000); h.session.press({ ...h.options, disabled: true });
  assert.deepEqual(h.actions, [0]); assert.equal(h.feedback.length, 1);
});
test('background, scroll or responder cancellation stops repetition and suppresses release', () => {
  const h = setup(); h.session.begin(); h.session.pressIn(h.options); h.clock.advance(380); h.session.cancel();
  h.clock.advance(1000); h.session.press(h.options);
  assert.deepEqual(h.actions, [0, 380]); assert.equal(h.clock.tasks.size, 0);
});
test('cancelled ordinary button does not execute when released', () => {
  const h = setup(false); h.session.begin(); h.session.pressIn(h.options); h.session.cancel(); h.session.press(h.options);
  assert.deepEqual(h.actions, []); assert.equal(h.feedback.length, 1);
});
test('leaving and re-entering a held key does not duplicate initial command or haptic', () => {
  const h = setup(); h.session.begin(); h.session.pressIn(h.options); h.session.pressOut();
  h.session.pressIn(h.options); h.clock.advance(1000); h.session.press(h.options);
  assert.deepEqual(h.actions, [0]); assert.equal(h.feedback.length, 1);
});
test('a new physical tap after cancellation works immediately', () => {
  const h = setup(); h.session.begin(); h.session.pressIn(h.options); h.session.cancel(); h.clock.advance(100);
  h.session.begin(); h.session.pressIn(h.options); h.session.pressOut(); h.session.press(h.options);
  assert.deepEqual(h.actions, [0, 100]); assert.deepEqual(h.feedback, [0, 100]);
});
test('multiple ordinary taps each receive one tactile tick and one command', () => {
  const h = setup(false);
  for (let i = 0; i < 3; i++) {
    h.session.begin(); h.session.pressIn(h.options); h.session.pressOut(); h.session.press(h.options); h.clock.advance(100);
  }
  assert.deepEqual(h.actions, [0, 100, 200]); assert.deepEqual(h.feedback, [0, 100, 200]);
});
test('accessibility click without touch events still sends and vibrates exactly once', () => {
  const h = setup(); h.session.press(h.options); h.clock.advance(100); h.session.press(h.options); h.clock.advance(1000);
  assert.deepEqual(h.actions, [0, 100]); assert.deepEqual(h.feedback, [0, 100]); assert.equal(h.clock.tasks.size, 0);
});
test('explicit accessibility activation works after a cancelled gesture without starting hold', () => {
  const h = setup(); h.session.cancel(); h.session.activate(h.options); h.clock.advance(1000);
  assert.deepEqual(h.actions, [0]); assert.deepEqual(h.feedback, [0]); assert.equal(h.clock.tasks.size, 0);
});
test('disabled screen-reader activation has no side effects', () => {
  const h = setup(); h.session.activate({ ...h.options, disabled: true });
  assert.deepEqual(h.actions, []); assert.deepEqual(h.feedback, []);
});
test('an unresolved vibration promise never delays infrared dispatch', () => {
  const h = setup(); const options = { ...h.options, feedback: () => new Promise(() => {}) };
  h.session.pressIn(options); assert.deepEqual(h.actions, [0]); h.session.cancel();
});
test('native vibration rejection does not prevent a command or leak rejection', async () => {
  const h = setup(); h.session.pressIn({ ...h.options, feedback: async () => { throw Error('no haptics'); } });
  await Promise.resolve(); await Promise.resolve(); assert.deepEqual(h.actions, [0]); h.session.cancel();
});
test('synchronous vibration failure does not prevent a command', () => {
  const h = setup(); h.session.pressIn({ ...h.options, feedback: () => { throw Error('unsupported'); } });
  assert.deepEqual(h.actions, [0]); h.session.cancel();
});
test('preference off is a no-op feedback function, without changing send behaviour', () => {
  const h = setup(); h.session.pressIn({ ...h.options, feedback: () => {} });
  assert.deepEqual(h.actions, [0]); assert.deepEqual(h.feedback, []); h.session.cancel();
});
test('initial action may cancel the session without leaving a repeat scheduled', () => {
  const h = setup(); h.session.pressIn({ ...h.options, action: () => { h.actions.push(0); h.session.cancel(); } });
  h.clock.advance(2000); assert.deepEqual(h.actions, [0]); assert.equal(h.clock.tasks.size, 0);
});
test('synchronous action failure does not leave a live hold timer', () => {
  const h = setup();
  assert.throws(() => h.session.pressIn({ ...h.options, action: () => { throw Error('bad action'); } }), /bad action/);
  assert.equal(h.clock.tasks.size, 0); h.session.cancel();
});

test('responder press-in before raw touch-start does not reset or duplicate a command', () => {
  const h = setup(); h.session.pressIn(h.options); h.session.begin(); h.clock.advance(380);
  assert.deepEqual(h.actions, [0, 380]); assert.deepEqual(h.feedback, [0]);
  h.session.touchEnd(); h.session.pressOut(); h.session.press(h.options); assert.equal(h.actions.length, 2);
});
test('raw touch-start before responder press-in behaves identically', () => {
  const h = setup(); h.session.begin(); h.session.pressIn(h.options); h.session.touchEnd();
  h.session.pressOut(); h.session.press(h.options);
  assert.deepEqual(h.actions, [0]); assert.deepEqual(h.feedback, [0]);
});
test('touch end stops repetition even if visual press-out is delayed', () => {
  const h = setup(); h.session.pressIn(h.options); h.session.begin(); h.clock.advance(379);
  h.session.touchEnd(); h.clock.advance(150); h.session.press(h.options); h.session.pressOut();
  assert.deepEqual(h.actions, [0]); assert.equal(h.clock.tasks.size, 0);
});
