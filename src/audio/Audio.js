import { AUDIO } from '../config.js';

// The game's AudioContext and its two buses: music (src/audio/Music.js) and
// sound effects (src/audio/Sfx.js), each with its own gain, both through a
// limiter to the speakers. Browsers only allow sound after the player's
// first input, so the context is made then (unlock(): the first pointer or
// key event anywhere, normally the title's TAP TO START). Phaser's own
// sound is off (main.js), so nothing makes a context before that and the
// browser has nothing to warn about. The context is suspended while the tab
// is hidden and resumed when it's shown again.

// A slider value (0-100) as a gain: squared, so the slider feels even.
export const sliderGain = (v) => (Math.max(0, Math.min(100, v)) / 100) ** 2;

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.settings = { music: AUDIO.defaults.music, sfx: AUDIO.defaults.sfx, muted: false };
    this.readyFns = [];
    this.installed = false;
  }

  get muted() { return this.settings.muted; }

  // Listen for the first input (to unlock) and for the tab being hidden.
  install() {
    if (this.installed || typeof window === 'undefined') return;
    this.installed = true;
    const events = ['pointerdown', 'pointerup', 'touchend', 'mousedown', 'keydown'];
    const onInput = () => {
      this.unlock();
      if (this.ctx?.state === 'running') for (const e of events) window.removeEventListener(e, onInput, true);
    };
    for (const e of events) window.addEventListener(e, onInput, true);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else this.ctx.resume().catch(() => {});
    });
  }

  // Make (or resume) the context. Call from inside an input event.
  unlock() {
    if (!this.ctx) {
      const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!Ctx) return;
      this.start(new Ctx());
    }
    // (A context made while the tab is hidden starts running: hush it.)
    if (document.hidden) this.ctx.suspend().catch(() => {});
    else if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  // Build the graph on ctx (the headless tests pass a fake one).
  start(ctx) {
    this.ctx = ctx;
    const L = AUDIO.limiter;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = L.threshold;
    limiter.knee.value = L.knee;
    limiter.ratio.value = L.ratio;
    limiter.attack.value = L.attack;
    limiter.release.value = L.release;
    limiter.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(limiter);
    this.sfxBus.connect(limiter);
    this.applyGains(true);
    for (const fn of this.readyFns) fn(ctx);
  }

  // fn(ctx) once the context exists (now, if it does).
  onReady(fn) {
    this.readyFns.push(fn);
    if (this.ctx) fn(this.ctx);
  }

  // { music, sfx } slider values (0-100) and muted; any may be left out.
  setSettings(settings) {
    Object.assign(this.settings, settings);
    this.applyGains(false);
  }

  applyGains(instant) {
    if (!this.ctx) return;
    const { music, sfx, muted } = this.settings;
    const set = (param, v) => {
      if (instant) param.value = v;
      else param.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    };
    set(this.musicBus.gain, muted ? 0 : sliderGain(music) * AUDIO.musicGain);
    set(this.sfxBus.gain, muted ? 0 : sliderGain(sfx) * AUDIO.sfxGain);
  }
}

export const audio = new AudioEngine();
