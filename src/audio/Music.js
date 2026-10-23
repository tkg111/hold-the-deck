import { AUDIO } from '../config.js';
import { audio } from './Audio.js';

// The music: chiptune tracks as note data (public/audio/music/<track>.json)
// played live by a small WebAudio synth, matching audio.py's SYNTH SPEC so
// the game sounds like the approved previews.
//
// A track: stepSec, lengthSteps, instruments and channels. A channel: inst
// (a key into instruments), vol, notes [[step, lenSteps, midi]] (drums:
// "kick" / "snare" / "hat" in place of the midi number) and an optional
// echo { time, feedback, mix }. An instrument: wave pulse (with duty) or
// triangle; envelope a (s, linear up to 1), d (s, linear down to sustain
// s), r (s, linear down to 0 after the note ends); optional vib { depth
// (semitones), rate (Hz), delay (s) }. Pulse waves play at 0.6, triangles
// at 1; a note's gain is its channel's vol x the envelope.
//
// Notes are scheduled ahead on the AudioContext's clock (never setTimeout):
// every AUDIO.music.intervalMs the notes due in the next lookaheadSec are
// queued, and the track loops seamlessly every lengthSteps x stepSec.
// Changing track crossfades over crossfadeSec; asking for the track already
// playing does nothing.

const PULSE_AMP = 0.6;
const midiHz = (m) => 440 * 2 ** ((m - 69) / 12);

// Drums (SYNTH SPEC): length (s) of each hit.
const DRUM_LEN = { kick: 0.2, snare: 0.15, hat: 0.05 };

// A track's notes in time order, each { t (s into the loop), ch (channel
// index), note }, and its loop length (s).
export function trackEvents(track) {
  const events = [];
  track.channels.forEach((c, ch) => {
    for (const note of c.notes) events.push({ t: note[0] * track.stepSec, ch, note });
  });
  events.sort((a, b) => a.t - b.t || a.ch - b.ch);
  return { events, loopSec: track.lengthSteps * track.stepSec };
}

// Walks a track's notes loop after loop from startTime: due(until) returns
// every note starting before `until` not returned yet, with its absolute
// time. Pure, so the headless tests can drive it.
export class Sequencer {
  constructor(track, startTime) {
    const { events, loopSec } = trackEvents(track);
    this.events = events;
    this.loopSec = loopSec;
    this.startTime = startTime;
    this.loop = 0;
    this.index = 0;
  }

  get nextTime() {
    return this.startTime + this.loop * this.loopSec + this.events[this.index].t;
  }

  due(until) {
    const out = [];
    if (!this.events.length) return out;
    while (this.nextTime < until) {
      out.push({ time: this.nextTime, ...this.events[this.index] });
      if (++this.index >= this.events.length) {
        this.index = 0;
        this.loop++;
      }
    }
    return out;
  }
}

// The instruments and drums on one context.
export class Synth {
  constructor(ctx) {
    this.ctx = ctx;
    this.waves = new Map();   // duty -> PeriodicWave
    // One second of white noise, shared by every snare and hat.
    const n = Math.ceil(ctx.sampleRate * AUDIO.music.noiseSec);
    this.noise = ctx.createBuffer(1, n, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  }

  // A pulse wave of this duty (+-PULSE_AMP), from its Fourier series: for
  // harmonic k, cos 2 sin(2 pi k d) / (pi k) and sin 2 (1 - cos(2 pi k d)) /
  // (pi k).
  pulse(duty) {
    let wave = this.waves.get(duty);
    if (wave) return wave;
    const K = AUDIO.music.pulseHarmonics;
    const real = new Float32Array(K + 1);
    const imag = new Float32Array(K + 1);
    for (let k = 1; k <= K; k++) {
      const a = 2 * Math.PI * k * duty;
      real[k] = PULSE_AMP * 2 * Math.sin(a) / (Math.PI * k);
      imag[k] = PULSE_AMP * 2 * (1 - Math.cos(a)) / (Math.PI * k);
    }
    wave = this.ctx.createPeriodicWave(real, imag, { disableNormalization: true });
    this.waves.set(duty, wave);
    return wave;
  }

  // A pitched note: inst at midi from time t for dur s (then its release),
  // into dest.
  note(inst, midi, t, dur, dest) {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    if (inst.wave === 'pulse') osc.setPeriodicWave(this.pulse(inst.duty));
    else osc.type = 'triangle';
    osc.frequency.value = midiHz(midi);
    const amp = ctx.createGain();
    const end = envelope(amp.gain, inst, t, dur);
    osc.connect(amp).connect(dest);
    if (inst.vib) {
      // f x 2^(depth/12 x sin(2 pi rate t)) once past delay: a sine LFO on
      // the detune, in cents.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = inst.vib.rate;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.setValueAtTime(inst.vib.depth * 100, t + inst.vib.delay);
      lfo.connect(depth).connect(osc.detune);
      lfo.start(t);
      lfo.stop(end);
    }
    osc.start(t);
    osc.stop(end);
  }

  drum(kind, t, dest) {
    const { ctx } = this;
    const end = t + DRUM_LEN[kind];
    // An exponential decay with time constant tau, from peak.
    const decay = (peak, tau) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.setTargetAtTime(0, t, tau);
      return g;
    };
    const noise = () => {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      src.start(t, Math.random() * (this.noise.duration - DRUM_LEN.snare));
      src.stop(end);
      return src;
    };
    if (kind === 'kick') {
      // Sine sweeping 150 -> 45 Hz (45 + 105 e^(-t / 0.04)), decay 0.06 s.
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.setTargetAtTime(45, t, 0.04);
      osc.connect(decay(1, 0.06)).connect(dest);
      osc.start(t);
      osc.stop(end);
    } else if (kind === 'snare') {
      // Noise (0.7, decay 0.045 s) plus a 185 Hz triangle (0.5, 0.03 s).
      noise().connect(decay(0.7, 0.045)).connect(dest);
      const tri = ctx.createOscillator();
      tri.type = 'triangle';
      tri.frequency.value = 185;
      tri.connect(decay(0.5, 0.03)).connect(dest);
      tri.start(t);
      tri.stop(end);
    } else if (kind === 'hat') {
      // Noise through a 7 kHz highpass (0.35, decay 0.012 s).
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7000;
      noise().connect(hp).connect(decay(0.35, 0.012)).connect(dest);
    }
  }
}

// Schedule a note's a/d/s/r on param from t, held for dur s; returns when
// its release ends.
export function envelope(param, { a, d, s, r }, t, dur) {
  const off = t + dur;
  param.setValueAtTime(0, t);
  if (dur <= a) {
    param.linearRampToValueAtTime(dur / Math.max(a, 1e-6), off);
  } else {
    param.linearRampToValueAtTime(1, t + a);
    if (dur <= a + d) param.linearRampToValueAtTime(1 - (1 - s) * (dur - a) / Math.max(d, 1e-6), off);
    else param.linearRampToValueAtTime(s, t + a + d);
    // Hold the sustain until the note ends (a ramp starts from the last
    // event, so the release needs one here).
    param.setValueAtTime(s, Math.max(off, t + a + d));
  }
  param.linearRampToValueAtTime(0, off + r);
  return off + r + 0.01;
}

// One track playing: each channel's gain (and echo) into the track's own
// gain (for crossfades) into the music bus, and its sequencer.
class TrackPlayer {
  constructor(ctx, synth, track, out, startTime) {
    this.ctx = ctx;
    this.synth = synth;
    this.track = track;
    this.gain = ctx.createGain();
    this.gain.connect(out);
    this.channels = track.channels.map((c) => {
      const input = ctx.createGain();
      const vol = ctx.createGain();
      vol.gain.value = c.vol;
      input.connect(vol).connect(this.gain);
      if (c.echo) {
        // Echoes every time s, each feedback x the last, mixed in at mix.
        const delay = ctx.createDelay(Math.max(1, c.echo.time));
        delay.delayTime.value = c.echo.time;
        const feedback = ctx.createGain();
        feedback.gain.value = c.echo.feedback;
        const wet = ctx.createGain();
        wet.gain.value = c.echo.mix;
        input.connect(delay);
        delay.connect(feedback).connect(delay);
        delay.connect(wet).connect(vol);
      }
      return { input, inst: track.instruments[c.inst] };
    });
    this.seq = new Sequencer(track, startTime);
    this.stopAt = Infinity;   // no notes from here on (fading out)
  }

  // Queue the notes due before `until`.
  schedule(until) {
    const { stepSec } = this.track;
    for (const ev of this.seq.due(Math.min(until, this.stopAt))) {
      const { input, inst } = this.channels[ev.ch];
      const [, len, pitch] = ev.note;
      if (inst.wave === 'drums') this.synth.drum(pitch, ev.time, input);
      else this.synth.note(inst, pitch, ev.time, len * stepSec, input);
    }
  }

  // Ramp the track's gain from `from` to `to` over sec, starting now.
  fade(from, to, sec) {
    const now = this.ctx.currentTime;
    const g = this.gain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(from, now);
    g.linearRampToValueAtTime(to, now + sec);
  }

  disconnect() {
    this.gain.disconnect();
  }
}

export class Music {
  constructor() {
    this.tracks = new Map();
    this.current = null;     // the track asked for
    this.playing = null;     // its TrackPlayer
    this.fading = [];        // players fading out
    this.ctx = null;
    this.timer = null;
  }

  addTrack(name, data) {
    this.tracks.set(name, data);
  }

  // Start making sound on ctx into bus (once the context exists).
  attach(ctx, bus, { timer = true } = {}) {
    this.ctx = ctx;
    this.bus = bus;
    this.synth = new Synth(ctx);
    if (timer) this.timer = setInterval(() => this.tick(), AUDIO.music.intervalMs);
    // A track asked for before there was sound starts now.
    const name = this.current;
    this.current = null;
    if (name) this.play(name);
  }

  // Play a track (a key of AUDIO.music.tracks), crossfading from the one
  // playing. Returns false (and does nothing) if it's already the one.
  play(name) {
    if (name === this.current) return false;
    this.current = name;
    const track = this.tracks.get(name);
    if (!this.ctx || !track) return true;
    const { crossfadeSec, startDelaySec } = AUDIO.music;
    const now = this.ctx.currentTime;
    const old = this.playing;
    this.playing = new TrackPlayer(this.ctx, this.synth, track, this.bus, now + startDelaySec);
    if (old) {
      this.playing.fade(0, 1, crossfadeSec);
      old.fade(old.gain.gain.value, 0, crossfadeSec);
      old.stopAt = now + crossfadeSec;
      this.fading.push(old);
    }
    this.tick();
    return true;
  }

  // The scheduler: queue every playing track's notes due in the lookahead;
  // drop faded-out tracks once their last notes have rung out.
  tick() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const until = now + AUDIO.music.lookaheadSec;
    this.playing?.schedule(until);
    this.fading = this.fading.filter((p) => {
      p.schedule(until);
      if (now < p.stopAt + 1) return true;
      p.disconnect();
      return false;
    });
  }
}

export const music = new Music();
audio.onReady((ctx) => music.attach(ctx, audio.musicBus));

export const musicKey = (name) => `music_${name}`;

// Queue every track's note data (with the scene's loader; its path set).
export function preloadMusic(scene) {
  for (const name of AUDIO.music.tracks) scene.load.json(musicKey(name), `${AUDIO.path}music/${name}.json`);
}

// Hand the loaded tracks to the synth.
export function initMusic(scene) {
  for (const name of AUDIO.music.tracks) {
    const data = scene.cache.json.get(musicKey(name));
    if (data) music.addTrack(name, data);
  }
}
