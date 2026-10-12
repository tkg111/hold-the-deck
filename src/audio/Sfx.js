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

  // Build-up: chest rattles that speed up, over a rising hum.
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

  // Chest opening: a quick filtered whoosh.
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

  // --- Abilities ---

  // Activation sound for a crewmate's ability (hero id).
  ability(id) {
    const t = this.ready();
    if (t == null) return;
    const play = {
      // Three quick rising blips.
      cabinBoy: () => [660, 880, 1175].forEach((f, i) => {
        this.tone({ freq: f, type: 'square', start: t + i * 0.06, duration: 0.08, volume: 0.12 });
      }),
      // Whoosh of the thrown pot.
      shipsCook: () => this.noise({ start: t, duration: 0.35, volume: 0.35, filterFrom: 300, filterTo: 1400, q: 1 }),
      // A big net swishing down, then a soft thump.
      netThrower: () => {
        this.noise({ start: t, duration: 0.4, volume: 0.4, filterFrom: 3000, filterTo: 500, q: 0.7 });
        this.tone({ freq: 140, endFreq: 70, type: 'sine', start: t + 0.3, duration: 0.2, volume: 0.35 });
      },
      // Barrel thrown: low whoosh.
      grogBrewer: () => this.noise({ start: t, duration: 0.3, volume: 0.3, filterFrom: 250, filterTo: 900, q: 1 }),
      // Deep rising whoosh with a metallic ring.
      harpooner: () => {
        this.noise({ start: t, duration: 0.5, volume: 0.45, filterFrom: 200, filterTo: 2500, q: 1.2 });
        this.tone({ freq: 1400, endFreq: 1900, type: 'triangle', start: t + 0.05, duration: 0.5, volume: 0.12 });
      },
      // Eerie descending, slightly detuned pair.
      voodooPriestess: () => {
        for (const f of [330, 349]) {
          this.tone({ freq: f, endFreq: f / 2, type: 'sawtooth', start: t, duration: 0.9, volume: 0.08, attack: 0.1 });
        }
      },
      // A drum roll of muffled shots as the guns fire.
      cannoneer: () => {
        for (let i = 0; i < 3; i++) this.noise({ start: t + i * 0.07, duration: 0.12, volume: 0.35, filterFrom: 500, q: 1 });
      },
      // Sword swish and a bright "shing".
      duelist: () => {
        this.noise({ start: t, duration: 0.15, volume: 0.4, filterFrom: 4000, filterTo: 1500, q: 1.5 });
        this.tone({ freq: 1800, endFreq: 2600, type: 'triangle', start: t + 0.08, duration: 0.4, volume: 0.15 });
      },
      // Bugle call: G C E G.
      captain: () => [392, 523.25, 659.25, 783.99].forEach((f, i) => {
        this.tone({ freq: f, type: 'square', start: t + i * 0.1, duration: i === 3 ? 0.4 : 0.12, volume: 0.1 });
      }),
      // A flurry of squawks and flapping.
      parrotKeeper: () => {
        this.noise({ start: t, duration: 0.4, volume: 0.25, filterFrom: 1800, filterTo: 900, q: 0.8 });
        for (let i = 0; i < 4; i++) {
          this.tone({ freq: 1500 + i * 180, endFreq: 1000, type: 'sawtooth', start: t + i * 0.08, duration: 0.07, volume: 0.06 });
        }
      },
      // Two warm rising chimes.
      shipsDoctor: () => [523.25, 783.99].forEach((f, i) => {
        this.tone({ freq: f, type: 'sine', start: t + i * 0.12, duration: 0.35, volume: 0.15, attack: 0.02 });
      }),
      // A tense rising whine as he takes aim.
      sharpshooter: () => this.tone({ freq: 400, endFreq: 1600, type: 'triangle', start: t, duration: 0.8, volume: 0.08, attack: 0.1 }),
      // A ghostly wail, wavering down.
      ghostPirate: () => {
        for (const f of [440, 466]) {
          this.tone({ freq: f, endFreq: f * 0.6, type: 'sine', start: t, duration: 1, volume: 0.1, attack: 0.15 });
        }
      },
      // A rolling rush of water.
      stormCaller: () => this.noise({ start: t, duration: 1, volume: 0.45, filterFrom: 300, filterTo: 1600, q: 0.6 }),
    }[id];
    play?.();
  }

  // Hot Stew pot landing: a clang and a hiss of steam.
  splat() {
    const t = this.ready();
    if (t == null) return;
    this.tone({ freq: 520, endFreq: 380, type: 'triangle', start: t, duration: 0.2, volume: 0.25 });
    this.noise({ start: t + 0.02, duration: 0.5, volume: 0.3, filterFrom: 5000, filterTo: 2500, q: 0.6 });
  }

  // Grog Barrel smashing: a wooden crack and glugs.
  crash() {
    const t = this.ready();
    if (t == null) return;
    this.noise({ start: t, duration: 0.18, volume: 0.5, filterFrom: 1200, filterTo: 400, q: 1.5 });
    for (let i = 0; i < 3; i++) {
      this.tone({ freq: 300 - i * 40, endFreq: 180 - i * 30, type: 'sine', start: t + 0.12 + i * 0.1, duration: 0.09, volume: 0.25 });
    }
  }

  // One Broadside cannonball landing.
  boom() {
    const t = this.ready();
    if (t == null) return;
    this.tone({ freq: 120, endFreq: 40, type: 'sine', start: t, duration: 0.35, volume: 0.45 });
    this.noise({ start: t, duration: 0.3, volume: 0.35, filterFrom: 700, filterTo: 150, q: 0.8 });
  }

  // --- Enemies ---

  // The Siren's song: a soft, wavering three-note phrase.
  sirenSong() {
    const t = this.ready();
    if (t == null) return;
    [880, 1046.5, 987.77].forEach((f, i) => {
      this.tone({ freq: f, endFreq: f * 0.98, type: 'sine', start: t + i * 0.22, duration: 0.4, volume: 0.12, attack: 0.08 });
    });
  }

  // The finale's lightning: a sharp crack, then a low rumble.
  thunder() {
    const t = this.ready();
    if (t == null) return;
    this.noise({ start: t, duration: 0.15, volume: 0.45, filterFrom: 3000, filterTo: 1200, q: 0.8 });
    this.noise({ start: t + 0.1, duration: 1.4, volume: 0.4, filterFrom: 400, filterTo: 80, q: 0.7 });
  }

  // Lava bombs launched: a falling whistle.
  bombWhistle() {
    const t = this.ready();
    if (t == null) return;
    this.tone({ freq: 1400, endFreq: 500, type: 'sine', start: t, duration: 1.1, volume: 0.07, attack: 0.1 });
  }

  // A lava bomb or magma glob landing: a thud and a sizzle.
  lavaSplash() {
    const t = this.ready();
    if (t == null) return;
    this.tone({ freq: 140, endFreq: 60, type: 'sine', start: t, duration: 0.25, volume: 0.35 });
    this.noise({ start: t + 0.03, duration: 0.6, volume: 0.25, filterFrom: 6000, filterTo: 3000, q: 0.5 });
  }

  // The Molten Leviathan spitting: a wet, low glop.
  spit() {
    const t = this.ready();
    if (t == null) return;
    this.tone({ freq: 220, endFreq: 90, type: 'triangle', start: t, duration: 0.25, volume: 0.25 });
    this.noise({ start: t, duration: 0.2, volume: 0.2, filterFrom: 900, filterTo: 300, q: 1 });
  }

  // The Molten Leviathan's roar: a long growl with a rumble under it.
  roar() {
    const t = this.ready();
    if (t == null) return;
    for (const f of [82, 87]) {
      this.tone({ freq: f, endFreq: f * 0.7, type: 'sawtooth', start: t, duration: 1.2, volume: 0.12, attack: 0.15 });
    }
    this.noise({ start: t, duration: 1.2, volume: 0.35, filterFrom: 500, filterTo: 120, q: 0.6 });
  }

  // A Barnacle Knight's shield shattering: a crack and a clang.
  shieldBreak() {
    const t = this.ready();
    if (t == null) return;
    this.noise({ start: t, duration: 0.2, volume: 0.4, filterFrom: 2500, filterTo: 800, q: 1.2 });
    this.tone({ freq: 700, endFreq: 420, type: 'triangle', start: t, duration: 0.3, volume: 0.2 });
  }

  // --- Frostbite Reef ---

  // A crewmate freezing: a quick rising crackle of ice.
  freeze() {
    const t = this.ready();
    if (t == null) return;
    this.noise({ start: t, duration: 0.25, volume: 0.25, filterFrom: 3000, filterTo: 7000, q: 2 });
    this.tone({ freq: 1600, endFreq: 2400, type: 'sine', start: t, duration: 0.2, volume: 0.06 });
  }

  // Ice breaking (a crewmate tapped free, an ice shield giving way): a
  // bright crack and tinkle.
  iceBreak() {
    const t = this.ready();
    if (t == null) return;
    this.noise({ start: t, duration: 0.12, volume: 0.35, filterFrom: 6000, filterTo: 2500, q: 1.5 });
    [2200, 2900, 2500].forEach((f, i) => {
      this.tone({ freq: f, type: 'triangle', start: t + 0.04 + i * 0.05, duration: 0.12, volume: 0.06 });
    });
  }

  // A snowball, boulder or the breath hitting the hull: a soft crunch.
  frostHit() {
    const t = this.ready();
    if (t == null) return;
    this.noise({ start: t, duration: 0.15, volume: 0.3, filterFrom: 1800, filterTo: 600, q: 1 });
  }

  // The Frost Wyrm's breath: a long icy hiss.
  frostBreath() {
    const t = this.ready();
    if (t == null) return;
    this.noise({ start: t, duration: 0.7, volume: 0.3, filterFrom: 7000, filterTo: 3500, q: 0.7 });
    this.tone({ freq: 180, endFreq: 120, type: 'sawtooth', start: t, duration: 0.5, volume: 0.06, attack: 0.05 });
  }

  // The Frost Giant's club landing: a deep thud.
  stomp() {
    const t = this.ready();
    if (t == null) return;
    this.tone({ freq: 90, endFreq: 30, type: 'sine', start: t, duration: 0.45, volume: 0.5 });
    this.noise({ start: t, duration: 0.35, volume: 0.35, filterFrom: 500, filterTo: 100, q: 0.8 });
  }

  // The Frost Wyrm dropping into the sea: a heavy splash.
  splash() {
    const t = this.ready();
    if (t == null) return;
    this.tone({ freq: 110, endFreq: 50, type: 'sine', start: t, duration: 0.3, volume: 0.35 });
    this.noise({ start: t, duration: 0.9, volume: 0.35, filterFrom: 2500, filterTo: 600, q: 0.6 });
  }

  // A blizzard rolling in: a rising gust of wind.
  wind() {
    const t = this.ready();
    if (t == null) return;
    this.noise({ start: t, duration: 1.6, volume: 0.25, filterFrom: 400, filterTo: 1400, q: 1.5 });
  }

  // --- Fogbound Isle ---

  // A fog bank rolling in: a low, two-note foghorn.
  fogHorn() {
    const t = this.ready();
    if (t == null) return;
    this.tone({ freq: 98, type: 'sawtooth', start: t, duration: 1.1, volume: 0.1, attack: 0.25 });
    this.tone({ freq: 87.3, type: 'sawtooth', start: t + 1.2, duration: 1.4, volume: 0.1, attack: 0.25 });
  }

  // Something sinking into or stepping out of the fog: a soft whoosh.
  fogPuff() {
    const t = this.ready();
    if (t == null) return;
    this.noise({ start: t, duration: 0.3, volume: 0.15, filterFrom: 600, filterTo: 1500, q: 0.8 });
  }

  // A Cursed Cannoneer's grapeshot or Blackbones' flintlock: a sharp bang.
  musket() {
    const t = this.ready();
    if (t == null) return;
    this.noise({ start: t, duration: 0.12, volume: 0.4, filterFrom: 2500, filterTo: 700, q: 1 });
    this.tone({ freq: 160, endFreq: 70, type: 'sine', start: t, duration: 0.15, volume: 0.25 });
  }

  // A Lantern Ghoul's soul wisp: a hollow rising whistle.
  wisp() {
    const t = this.ready();
    if (t == null) return;
    this.tone({ freq: 440, endFreq: 880, type: 'sine', start: t, duration: 0.6, volume: 0.07, attack: 0.15 });
  }

  // A crewmate charmed: a sweet falling phrase.
  charm() {
    const t = this.ready();
    if (t == null) return;
    [1318.5, 1174.7, 1046.5].forEach((f, i) => {
      this.tone({ freq: f, type: 'sine', start: t + i * 0.12, duration: 0.25, volume: 0.08, attack: 0.03 });
    });
  }

  // The Siren Queen's tidal wave setting off: rushing water.
  wave() {
    const t = this.ready();
    if (t == null) return;
    this.noise({ start: t, duration: 0.8, volume: 0.25, filterFrom: 500, filterTo: 1800, q: 0.7 });
  }

  // Captain Blackbones' cackle: three quick, falling, raspy notes.
  cackle() {
    const t = this.ready();
    if (t == null) return;
    [330, 300, 270].forEach((f, i) => {
      this.tone({ freq: f, endFreq: f * 0.85, type: 'sawtooth', start: t + i * 0.13, duration: 0.11, volume: 0.07 });
    });
  }

  // Blackbones' cutlass on the hull: a swish and a ring.
  slash() {
    const t = this.ready();
    if (t == null) return;
    this.noise({ start: t, duration: 0.15, volume: 0.3, filterFrom: 4000, filterTo: 1500, q: 1 });
    this.tone({ freq: 900, endFreq: 700, type: 'triangle', start: t + 0.08, duration: 0.25, volume: 0.1 });
  }

  // An ability that can't be used right now.
  denied() {
    const t = this.ready();
    if (t == null) return;
    this.tone({ freq: 200, endFreq: 150, type: 'square', start: t, duration: 0.1, volume: 0.08 });
  }

  // Soft click for UI toggles.
  click() {
    const t = this.ready();
    if (t == null) return;
    this.tone({ freq: 880, endFreq: 660, type: 'square', start: t, duration: 0.06, volume: 0.08 });
  }
}

export const sfx = new Sfx();
