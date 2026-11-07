export type Scheduler = { after: (fn: () => void, ms: number) => unknown; cancel: (id: unknown) => void };
export const scheduler: Scheduler = {
  after: (fn, ms) => setTimeout(fn, ms),
  cancel: id => clearTimeout(id as ReturnType<typeof setTimeout>),
};

/** Repeat only while held; no queued commands after release or backgrounding. */
export class HoldRepeater {
  private timer: unknown;
  private active = false;
  private clock: Scheduler;
  constructor(clock: Scheduler = scheduler) { this.clock = clock; }
  start(action: () => void) {
    this.stop(); this.active = true;
    const tick = () => {
      if (!this.active) return;
      action();
      if (this.active) this.timer = this.clock.after(tick, 180);
    };
    this.timer = this.clock.after(tick, 380);
  }
  stop() { this.active = false; this.clock.cancel(this.timer); this.timer = undefined; }
}
