import { AUDIO } from '../config.js';
import { audio } from './Audio.js';

// Sound effects: one-shot samples (public/audio/sfx/<name>.ogg and .mp3,
// the .ogg where the browser plays it) on the SFX bus. Each is queued with
// the Phaser loader as raw bytes and decoded straight away on an offline
// context, so the first tap (which makes the real context, see Audio.js)
// can already play one.
//
// Limits (AUDIO.sfx): at most AUDIO.maxCopies of one sound at once; a
// sound's gapMs skips plays closer together than that (hits and coins in a
// busy wave), and its jitter varies the playback rate a little so repeats
// don't sound robotic.

export const sfxKey = (name) => `sfx_${name}`;
export const SFX_NAMES = Object.keys(AUDIO.sfx);

class Sfx {
  constructor() {
    this.buffers = new Map();
    this.live = new Map();    // name -> copies playing
    this.last = new Map();    // name -> context time it last started
    // Every play asked for, played or not: a Button plays its click only
    // if its handler asked for no sound of its own (see Button.js).
    this.requests = 0;
  }

  // Queue every sound with the scene's loader: the .ogg if the browser
  // plays it, else the .mp3.
  preload(scene) {
    const ext = scene.sys.game.device.audio.ogg ? 'ogg' : 'mp3';
    for (const name of SFX_NAMES) scene.load.binary(sfxKey(name), `${AUDIO.path}sfx/${name}.${ext}`);
  }

  // Decode what preload() loaded.
  async decode(scene) {
    const Offline = typeof window !== 'undefined' && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
    if (!Offline) return;
    const ctx = new Offline(1, 1, 44100);
    await Promise.all(SFX_NAMES.map(async (name) => {
      const bytes = scene.cache.binary.get(sfxKey(name));
      if (!bytes || this.buffers.has(name)) return;
      try {
        this.buffers.set(name, await ctx.decodeAudioData(bytes.slice(0)));
      } catch (err) {
        console.warn(`[sfx] could not decode ${name}:`, err);
      }
    }));
  }

  // Play a sound (a key of AUDIO.sfx). volume and rate scale its own.
  play(name, { volume = 1, rate = 1 } = {}) {
    this.requests++;
    const spec = AUDIO.sfx[name];
    const { ctx } = audio;
    if (!spec || !ctx || audio.muted || document.hidden) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const now = ctx.currentTime;
    if (spec.gapMs && now - (this.last.get(name) ?? -Infinity) < spec.gapMs / 1000) return;
    const live = this.live.get(name) ?? 0;
    if (live >= AUDIO.maxCopies) return;
    this.last.set(name, now);
    this.live.set(name, live + 1);

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * (spec.jitter ?? 0));
    const gain = ctx.createGain();
    gain.gain.value = spec.volume * volume;
    src.connect(gain).connect(audio.sfxBus);
    src.onended = () => {
      this.live.set(name, this.live.get(name) - 1);
      gain.disconnect();
    };
    src.start();
  }

  // A rarity's reveal (a crewmate from a chest, a fish, an expedition's
  // chest): Legendary its own fanfare; Epic the wave-clear arpeggio, Rare
  // the upgrade one, Common the buy chime.
  reveal(rarity) {
    this.play({
      legendary: 'legendary', epic: 'wave_clear', rare: 'upgrade', common: 'buy',
    }[rarity] ?? 'buy');
  }

  // An expedition reward flipping over: kind 'gold' (a coin), 'pearls' (the
  // upgrade arpeggio), a chest tier (its reveal, a Chest like a Rare pull)
  // or 'bonus' (the Legendary fanfare).
  loot(kind) {
    if (kind === 'gold') this.play('coin');
    else if (kind === 'pearls') this.play('upgrade');
    else if (kind === 'bonus') this.reveal('legendary');
    else this.reveal({ common: 'rare', rare: 'epic', legendary: 'legendary' }[kind] ?? 'rare');
  }
}

export const sfx = new Sfx();
