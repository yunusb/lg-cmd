import { HoldRepeater, type Scheduler } from './hold.ts';

export type PressOptions = {
  action: () => void;
  feedback: () => void | Promise<void>;
  repeat?: boolean;
  immediate?: boolean;
  disabled?: boolean;
};

/** One gesture, one initial command and one tactile tick. No dependency on React or native I/O. */
export class PressSession {
  private hold: HoldRepeater;
  private activeTouch = false;
  private started = false;
  private delivered = false;
  private notified = false;
  private cancelled = false;

  constructor(clock?: Scheduler) { this.hold = new HoldRepeater(clock); }

  private reset() {
    this.hold.stop();
    this.activeTouch = this.started = this.delivered = this.notified = this.cancelled = false;
  }

  /** Idempotent: RN responder grant may precede the raw touch-start callback. */
  begin() {
    if (this.activeTouch) return;
    this.reset(); this.activeTouch = true;
  }

  private notify(options: PressOptions) {
    if (this.notified) return;
    this.notified = true;
    // A missing haptics engine must never delay or prevent the command.
    try { void Promise.resolve(options.feedback()).catch(() => {}); } catch { /* optional feedback */ }
  }

  pressIn(options: PressOptions) {
    if (options.disabled) return;
    this.begin();
    if (this.cancelled || this.started) return;
    this.started = true;
    this.notify(options);
    if (options.immediate || options.repeat) {
      this.delivered = true;
      // Remote commands run at touch-down; onPress (release) only handles the
      // fallback accessibility path and never resends this same command.
      options.action();
      // Continuous repetition remains opt-in (arrows, volume and channels),
      // never power, OK, source, number keys or actions that open dialogs.
      if (!this.cancelled && options.repeat) this.hold.start(options.action);
    }
  }

  /** Stop at touch end as well as press-out; RN can delay the visual release callback. */
  pressOut() { this.hold.stop(); }
  touchEnd() { this.hold.stop(); this.activeTouch = false; }

  press(options: PressOptions) {
    this.hold.stop();
    try {
      if (!options.disabled && !this.cancelled && !this.delivered) {
        this.notify(options);
        this.delivered = true;
        options.action();
      }
    } finally { this.reset(); }
  }

  /** Scroll cancellation, disabled controls, blur, background, or component removal. */
  cancel() { this.hold.stop(); this.cancelled = true; this.activeTouch = false; }

  /** Screen-reader activation is a discrete click, never a held/repeated command. */
  activate(options: PressOptions) { this.reset(); this.press(options); }
}
