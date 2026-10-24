import { RANKINGS } from '../config.js';

// Sends the player's best Abyss depth to the Rankings, quietly: never in the
// way of the game, and no errors outside the Rankings screen.
//
// check() (on load, and on every save: so after each depth and each dive)
// sends the save's best depth when the player has joined and it's higher
// than the best the server last returned (Progress.online.
// lastSubmittedDepth). At most one call per RANKINGS.submitEveryMs: a
// check sooner waits for the rest of that time. The server may return less
// than was sent (it limits how fast a score rises); that's what's stored,
// so later checks send the true best again until it's all in. A call that
// fails is tried again when the device comes back online (the 'online'
// event), or at the next check. With no captain on the server (an imported
// save on a new device) it stops until the player joins again.
export class ScoreSync {
  constructor({
    online, now = () => Date.now(),
    isOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false,
    setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (t) => clearTimeout(t),
    everyMs = RANKINGS.submitEveryMs,
  }) {
    Object.assign(this, {
      online, now, isOnline, setTimer, clearTimer, everyMs,
    });
    this.record = () => null;
    this.best = () => 0;
    this.save = () => {};
    this.sentAt = -Infinity;    // when the last call went out
    this.timer = null;          // a check waiting for everyMs to pass
    this.busy = false;          // a call under way
    this.again = false;         // checked during it: check once it's back
    this.stopped = false;       // the server has no captain for this device
  }

  // record() -> Progress.online, best() -> the save's best depth, save().
  attach({ record, best, save }) {
    Object.assign(this, { record, best, save });
  }

  // The player (re)joined: start again.
  joined() {
    this.stopped = false;
    this.check();
  }

  // The depth to send, or null if there's nothing to send.
  get due() {
    const rec = this.record();
    if (!this.online.available || !rec?.joined || this.stopped) return null;
    const best = this.best();
    return best > rec.lastSubmittedDepth ? best : null;
  }

  check() {
    if (this.due == null) return;
    if (this.busy) {
      this.again = true;
      return;
    }
    if (!this.isOnline()) return;   // the 'online' event checks again
    const wait = this.sentAt + this.everyMs - this.now();
    if (wait > 0) {
      if (!this.timer) {
        this.timer = this.setTimer(() => {
          this.timer = null;
          this.check();
        }, wait);
      }
      return;
    }
    this.send(this.due);
  }

  async send(depth) {
    this.busy = true;
    this.sentAt = this.now();
    try {
      const stored = await this.online.submitDepth(depth);
      const rec = this.record();
      if (rec?.joined && Number.isFinite(stored)) {
        rec.lastSubmittedDepth = stored;
        this.save();
      }
    } catch (err) {
      if (err.kind === 'auth') this.stopped = true;
      console.debug('[rankings] depth not sent:', err.message);
    } finally {
      this.busy = false;
      if (this.again) {
        this.again = false;
        this.check();
      }
    }
  }
}
