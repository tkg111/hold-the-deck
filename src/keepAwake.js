import { KeepAwake } from '@capacitor-community/keep-awake';
import { MOBILE } from './config.js';
import { isNative } from './native.js';

// Keep screen on (Settings, Progress.keepScreenOn): the screen doesn't sleep
// while something is playing out (a wave, a stage or a dive under way, or
// a cast out in the Galley), and on menus until MOBILE.keepAwake.idleMs of
// no input. In the Android app through @capacitor-community/keep-awake;
// on the web through the Screen Wake Lock API, which the browser drops
// whenever the page is hidden, so it's asked for again on coming back.
// Where neither exists it does nothing.

const state = {
  on: true,                // the setting
  busy: new Set(),         // what's playing out ('battle', 'fishing')
  lastInput: Date.now(),
  held: false,             // what was last asked of the device
  lock: null,              // the web's WakeLockSentinel
  started: false,
};

const webLock = () => (typeof navigator !== 'undefined' ? navigator.wakeLock : null);

// Whether the screen should stay on now.
export function wanted({ now = Date.now(), visible = !document.hidden } = {}) {
  if (!state.on || !visible) return false;
  return state.busy.size > 0 || now - state.lastInput < MOBILE.keepAwake.idleMs;
}

async function hold(on) {
  try {
    if (isNative()) {
      if (on === state.held) return;
      state.held = on;
      await (on ? KeepAwake.keepAwake() : KeepAwake.allowSleep());
      return;
    }
    const api = webLock();
    if (!api) return;
    // The browser may have dropped it (the page was hidden): ask again.
    if (on && (!state.lock || state.lock.released)) {
      state.held = true;
      state.lock = await api.request('screen');
    } else if (!on && state.lock) {
      state.held = false;
      const { lock } = state;
      state.lock = null;
      await lock.release();
    }
  } catch {
    // Refused (no user gesture yet, battery saver): try again at the next check.
    state.held = false;
    state.lock = null;
  }
}

function check() {
  hold(wanted());
}

// Start watching input and visibility (once, at boot).
export function startKeepAwake() {
  if (state.started || typeof window === 'undefined') return;
  state.started = true;
  const onInput = () => {
    const idle = !wanted();
    state.lastInput = Date.now();
    if (idle) check();
  };
  for (const type of ['pointerdown', 'keydown', 'wheel']) window.addEventListener(type, onInput, { passive: true });
  document.addEventListener('visibilitychange', check);
  setInterval(check, MOBILE.keepAwake.checkMs);
  check();
}

// The Settings' Keep screen on.
export function setKeepAwake(on) {
  state.on = on;
  check();
}

// Something started or stopped playing out (key: 'battle', 'fishing').
export function setBusy(key, busy) {
  if (busy === state.busy.has(key)) return;
  if (busy) state.busy.add(key);
  else state.busy.delete(key);
  check();
}
