// Synthesized sound effects (Web Audio API, no audio files).
// Reuses Phaser's AudioContext, which Phaser unlocks on the first click/tap.

const MASTER_VOLUME = 0.25;

// Reveal chime notes per rarity (Hz): rarer pulls get longer, higher arpeggios.
const REVEAL_NOTES = {
  common: [523.25, 659.25],
  rare: [523.25, 659.25, 783.99, 1046.5],
  epic: [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568.0],
  legendary: [392.0, 523.25, 659.25, 783.99, 1046.5, 1318.5, 1568.0, 2093.0],
};

// Build-up hum end pitch per rarity: rarer pulls rise higher.
const SHAKE_PEAK = { common: 260, rare: 330, epic: 420, legendary: 560 };

class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
  }

  // Call once with the Phaser game. Silently does nothing without Web Audio.
  init(game) {
    const ctx = game.sound?.context;
    if (!ctx || this.ctx) return;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = MASTER_VOLUME;
    this.master.connect(ctx.destination);
  }

  setMuted(muted) {
    this.muted = muted;
  }

  // Context + start time, or null if sound shouldn't play right now.
  ready() {
    if (this.muted || !this.ctx) return null;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx.currentTime;
  }

  tone({ freq, endFreq = freq, type = 'sine', start, duration, volume = 0.5, attack = 0.01 }) {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq !== freq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.05);
  }

  noise({ start, duration, volume = 0.4, filterFrom = 800, filterTo = filterFrom, q = 1 }) {
    const { ctx } = this;
    const length = Math.ceil(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(filterFrom, start);
    filter.frequency.exponentialRampToValueAtTime(filterTo, start + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(start);
  }

  // Build-up: paper rattles that speed up, over a rising hum.
  shake(durationMs, rarity = 'common') {
    const t = this.ready();
    if (t == null) return;
    const d = durationMs / 1000;
    const peak = SHAKE_PEAK[rarity] ?? SHAKE_PEAK.common;
    this.tone({ freq: 110, endFreq: peak, type: 'triangle', start: t, duration: d, volume: 0.18, attack: d * 0.6 });
    let at = 0;
    let gap = 0.13;
    while (at < d) {
      this.noise({ start: t + at, duration: 0.05, volume: 0.25, filterFrom: 2500, q: 2 });
      at += gap;
      gap = Math.max(0.045, gap * 0.9);
    }
  }

  // Card flip: a quick filtered whoosh.
  flip() {
    const t = this.ready();
    if (t == null) return;
    this.noise({ start: t, duration: 0.22, volume: 0.5, filterFrom: 400, filterTo: 3000, q: 0.8 });
  }

  // Reveal chime; isNew adds a little sparkle on top.
  reveal(rarity, isNew) {
    const t = this.ready();
    if (t == null) return;
    const notes = REVEAL_NOTES[rarity] ?? REVEAL_NOTES.common;
    notes.forEach((freq, i) => {
      this.tone({ freq, type: 'triangle', start: t + i * 0.09, duration: 0.6, volume: 0.35 });
    });
    if (rarity === 'legendary') {
      // Sustained major chord under the arpeggio.
      const chordAt = t + notes.length * 0.09;
      for (const freq of [523.25, 659.25, 783.99]) {
        this.tone({ freq, type: 'sine', start: chordAt, duration: 1.4, volume: 0.18, attack: 0.05 });
      }
    }
    if (isNew) {
      const end = t + notes.length * 0.09;
      for (let i = 0; i < 6; i++) {
        this.tone({ freq: 2093 + i * 300, type: 'sine', start: end + i * 0.05, duration: 0.25, volume: 0.12 });
      }
    }
  }

  // Soft click for UI toggles.
  click() {
    const t = this.ready();
    if (t == null) return;
    this.tone({ freq: 880, endFreq: 660, type: 'square', start: t, duration: 0.06, volume: 0.08 });
  }
}

export const sfx = new Sfx();
