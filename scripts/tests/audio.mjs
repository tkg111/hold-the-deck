// Headless tests of the sound (src/audio/): the music's scheduler on a fake
// AudioContext, the sound effect files, and the volume settings in saves.
// Run: npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { AUDIO } from '../../src/config.js';
import { Music, Sequencer, trackEvents } from '../../src/audio/Music.js';
import { Progress } from '../../src/systems/Progress.js';
import { loadAudioSettings, loadProgress, SAVE_KEY } from '../../src/systems/Save.js';

const ROOT = new URL('../../', import.meta.url);
const track = (name) => JSON.parse(fs.readFileSync(new URL(`public/audio/music/${name}.json`, ROOT), 'utf8'));

// --- Fakes ---

// Just enough of an AudioContext for the synth: nodes that connect and
// record nothing, params that take automation, and a clock the test moves.
const fakeParam = () => ({
  value: 0,
  setValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {},
});
const fakeNode = (extra = {}) => ({
  connect(n) { return n; },
  disconnect() {},
  start() {},
  stop() {},
  setPeriodicWave() {},
  frequency: fakeParam(),
  detune: fakeParam(),
  gain: fakeParam(),
  delayTime: fakeParam(),
  ...extra,
});
class FakeContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.destination = fakeNode();
  }

  createGain() { return fakeNode(); }
  createOscillator() { return fakeNode(); }
  createBufferSource() { return fakeNode(); }
  createBiquadFilter() { return fakeNode(); }
  createDelay() { return fakeNode(); }
  createPeriodicWave() { return {}; }
  createBuffer(_ch, length, rate) {
    const data = new Float32Array(length);
    return { duration: length / rate, getChannelData: () => data };
  }
}

// A Music on a fake context whose synth logs every note and drum it's
// asked to play: [time, pitch or drum, the clock when it was queued].
function fakeMusic() {
  const ctx = new FakeContext();
  const m = new Music();
  for (const name of AUDIO.music.tracks) m.addTrack(name, track(name));
  m.attach(ctx, fakeNode(), { timer: false });
  const log = [];
  m.synth.note = (inst, midi, time) => log.push([time, midi, ctx.currentTime]);
  m.synth.drum = (kind, time) => log.push([time, kind, ctx.currentTime]);
  return { ctx, m, log };
}

// Run the scheduler as the browser would: a tick every intervalMs.
function runFor(ctx, m, seconds) {
  const step = AUDIO.music.intervalMs / 1000;
  const end = ctx.currentTime + seconds;
  while (ctx.currentTime < end) {
    ctx.currentTime += step;
    m.tick();
  }
}

// --- Tests ---

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

for (const name of AUDIO.music.tracks) {
  test(`${name}: one loop schedules every note exactly once, and loops at lengthSteps x stepSec`, () => {
    const t = track(name);
    const { events, loopSec } = trackEvents(t);
    assert.equal(loopSec, t.lengthSteps * t.stepSec);
    const total = t.channels.reduce((n, c) => n + c.notes.length, 0);
    assert.equal(events.length, total);

    // The scheduler's ticks over just under two loops, as the music would.
    const start = 0.05;
    const seq = new Sequencer(t, start);
    const seen = [];
    const step = AUDIO.music.intervalMs / 1000;
    for (let now = 0; now < start + 2 * loopSec - AUDIO.music.lookaheadSec; now += step) {
      seen.push(...seq.due(now + AUDIO.music.lookaheadSec));
    }
    const first = seen.filter((e) => e.time < start + loopSec - 1e-9);
    assert.equal(first.length, total, 'every note in the first loop, once');
    const keys = new Set(first.map((e) => `${e.ch}:${e.note.join(',')}`));
    // (Two notes can be identical only if the data repeats one; it doesn't.)
    assert.equal(keys.size, total, 'no note twice');
    for (const e of first) assert.ok(Math.abs(e.time - (start + e.t)) < 1e-9, 'at its step');
    // The second loop starts exactly a loop later, with the first note again.
    const second = seen.filter((e) => e.time >= start + loopSec - 1e-9);
    assert.ok(second.length > 0);
    assert.ok(Math.abs(second[0].time - (start + loopSec + events[0].t)) < 1e-9, 'seamless loop');
    assert.deepEqual(second[0].note, events[0].note);
  });
}

test('the music scheduler plays each loop of a track in full', () => {
  const { ctx, m, log } = fakeMusic();
  const t = track('skull_cove');
  const { loopSec } = trackEvents(t);
  m.play('skull_cove');
  runFor(ctx, m, AUDIO.music.startDelaySec + loopSec - AUDIO.music.lookaheadSec);
  const total = t.channels.reduce((n, c) => n + c.notes.length, 0);
  const firstLoop = log.filter(([time]) => time < AUDIO.music.startDelaySec + loopSec);
  assert.equal(firstLoop.length, total);
  for (const [time, , queued] of log) {
    assert.ok(time >= queued, 'queued before it plays');
    assert.ok(time <= queued + AUDIO.music.lookaheadSec + AUDIO.music.startDelaySec, 'within the lookahead');
  }
});

test('asking for the track already playing does nothing', () => {
  const { ctx, m } = fakeMusic();
  assert.equal(m.play('title'), true);
  const player = m.playing;
  runFor(ctx, m, 1);
  assert.equal(m.play('title'), false);
  assert.equal(m.playing, player, 'same player, not restarted');
  assert.equal(m.fading.length, 0, 'nothing crossfading');
});

test('changing track crossfades: the old one fades out and is dropped', () => {
  const { ctx, m } = fakeMusic();
  m.play('skull_cove');
  runFor(ctx, m, 2);
  const old = m.playing;
  assert.equal(m.play('boss'), true);
  assert.equal(m.fading.length, 1);
  assert.equal(m.fading[0], old);
  assert.ok(Math.abs(old.stopAt - (ctx.currentTime + AUDIO.music.crossfadeSec)) < 1e-9);
  runFor(ctx, m, AUDIO.music.crossfadeSec + 1.5);
  assert.equal(m.fading.length, 0, 'dropped once faded and rung out');
  // ...and back to the island when the boss dies.
  assert.equal(m.play('skull_cove'), true);
  assert.equal(m.current, 'skull_cove');
});

test('a track asked for before the first input starts once sound is unlocked', () => {
  const m = new Music();
  m.addTrack('title', track('title'));
  assert.equal(m.play('title'), true);
  assert.equal(m.playing, null);
  m.attach(new FakeContext(), fakeNode(), { timer: false });
  assert.equal(m.current, 'title');
  assert.ok(m.playing);
});

// Every sound in the brief's table.
const BRIEF = [
  'ui_click', 'ui_back', 'ui_open', 'ui_error', 'buy', 'upgrade', 'deck_build', 'chest_open', 'legendary', 'cannon',
  'cannon_small', 'hit', 'hit_heavy', 'enemy_die', 'coin', 'hull_hit', 'wave_start', 'wave_clear', 'island_clear',
  'defeat', 'boss_roar', 'boss_die', 'lava_bomb', 'freeze', 'thunder', 'siren_song', 'merchant_bell', 'plunder',
  'cast', 'splash', 'bite', 'reel_hit', 'reel_miss', 'fish_escape', 'fish_catch', 'fish_legendary', 'cook', 'eat',
  'captain_blip', 'tip',
];

test('every sound effect exists as both .ogg and .mp3', () => {
  for (const name of [...BRIEF, 'reel_tick']) assert.ok(AUDIO.sfx[name], `${name} in AUDIO.sfx`);
  for (const name of Object.keys(AUDIO.sfx)) {
    for (const ext of ['ogg', 'mp3']) {
      const file = new URL(`public/audio/sfx/${name}.${ext}`, ROOT);
      assert.ok(fs.existsSync(file) && fs.statSync(file).size > 0, `${name}.${ext}`);
    }
  }
});

test('every sound the code plays is in AUDIO.sfx, and every track it plays exists', () => {
  const files = fs.readdirSync(new URL('src/', ROOT), { recursive: true }).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const src = fs.readFileSync(new URL(`src/${f.replaceAll('\\', '/')}`, ROOT), 'utf8');
    for (const [, name] of src.matchAll(/sfx\.play\('([a-z_]+)'/g)) assert.ok(AUDIO.sfx[name], `${f}: ${name}`);
  }
  const M = AUDIO.music;
  for (const name of [M.title, M.boss, M.abyss, M.galley, ...Object.values(M.islands)]) {
    assert.ok(M.tracks.includes(name), name);
    assert.ok(fs.existsSync(new URL(`public/audio/music/${name}.json`, ROOT)), `${name}.json`);
  }
});

// --- Saves ---

function withSave(raw, fn) {
  const store = new Map(raw ? [[SAVE_KEY, raw]] : []);
  globalThis.window = {
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
  };
  return fn();
}

// A v19 save: Progress' shape without the volumes.
function v19Save(edit = () => {}) {
  const data = new Progress().toSave();
  delete data.musicVolume;
  delete data.sfxVolume;
  edit(data);
  return JSON.stringify({ version: 19, savedAt: '2026-10-01T00:00:00Z', data });
}

test('an old save loads with the default volumes, its mute kept', () => {
  const p = withSave(v19Save((d) => { d.muted = true; }), loadProgress);
  assert.equal(p.musicVolume, AUDIO.defaults.music);
  assert.equal(p.sfxVolume, AUDIO.defaults.sfx);
  assert.equal(p.muted, true);
  assert.deepEqual(withSave(v19Save(), loadAudioSettings), { music: 60, sfx: 80, muted: false });
});

test('the volumes round-trip through a save, clamped to 0-100', () => {
  const p = new Progress();
  Object.assign(p, { musicVolume: 25, sfxVolume: 100, muted: true });
  const q = Progress.fromSave(JSON.parse(JSON.stringify(p.toSave())));
  assert.deepEqual([q.musicVolume, q.sfxVolume, q.muted], [25, 100, true]);
  const bad = Progress.fromSave({ ...p.toSave(), musicVolume: 250, sfxVolume: 'loud' });
  assert.deepEqual([bad.musicVolume, bad.sfxVolume], [100, AUDIO.defaults.sfx]);
  const raw = JSON.stringify({ version: 20, data: { ...p.toSave(), musicVolume: 7 } });
  assert.deepEqual(withSave(raw, loadAudioSettings), { music: 7, sfx: 100, muted: true });
  assert.deepEqual(withSave(null, loadAudioSettings), { music: 60, sfx: 80, muted: false });
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}\n     ${err.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exitCode = failed ? 1 : 0;
