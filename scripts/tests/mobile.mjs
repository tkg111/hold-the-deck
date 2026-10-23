// Headless tests of the phone and offline features: save codes (Export /
// Import save), the update prompt's gate, and offline earnings.
// Run: npm test
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { MOBILE } from '../../src/config.js';
import { Progress } from '../../src/systems/Progress.js';
import {
  awayEarnings, collect, comeBack, formatAway, sampleIdleRate,
} from '../../src/systems/Offline.js';
import { progressFromRecord, SAVE_VERSION } from '../../src/systems/Save.js';
import { decodeSave, encodeSave } from '../../src/systems/SaveCode.js';
import { UpdateGate } from '../../src/systems/UpdateGate.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// A code for any record, the way encodeSave makes them.
const codeOf = (record) => MOBILE.saveCode.prefix + deflateRawSync(Buffer.from(JSON.stringify(record))).toString('base64');

// A save with some progress in it.
function played() {
  const p = new Progress();
  p.gold = 12345;
  p.pearls = 77;
  p.islands[p.islandId].wave = 14;
  p.spice = 3;
  return p;
}

// --- Save codes ---

test('save code round-trips the save', async () => {
  const p = played();
  const code = await encodeSave(p);
  assert.ok(code.startsWith(MOBILE.saveCode.prefix), code.slice(0, 10));
  assert.match(code.slice(MOBILE.saveCode.prefix.length), /^[A-Za-z0-9+/=]+$/);
  const { progress, error } = await decodeSave(code);
  assert.equal(error, undefined);
  assert.deepEqual(progress.toSave(), p.toSave());
});

test('save code survives line breaks and spaces from a chat app', async () => {
  const code = await encodeSave(played());
  const mangled = `  ${code.slice(0, 20)}\n${code.slice(20, 40)} \r\n${code.slice(40)}\n`;
  const { progress } = await decodeSave(mangled);
  assert.equal(progress.gold, 12345);
});

test('save code is shorter than the save JSON', async () => {
  const p = played();
  const code = await encodeSave(p);
  assert.ok(code.length < JSON.stringify(p.toSave()).length, `${code.length} chars`);
});

test('a broken code is rejected', async () => {
  const code = await encodeSave(played());
  for (const bad of ['', 'hello', code.slice(0, code.length / 2), code.replace(MOBILE.saveCode.prefix, 'XYZ1.'),
    `${MOBILE.saveCode.prefix}!!!!`, `${MOBILE.saveCode.prefix}${Buffer.from('not deflate').toString('base64')}`,
    codeOf({ hello: 'world' }), codeOf({ version: 3 }), codeOf([1, 2, 3]), codeOf({ version: SAVE_VERSION, data: { gold: 5 } })]) {
    assert.deepEqual(await decodeSave(bad), { error: 'format' }, JSON.stringify(bad.slice(0, 30)));
  }
});

test('a code from a newer save version is rejected', async () => {
  const record = { version: SAVE_VERSION + 1, savedAt: '', data: played().toSave() };
  assert.deepEqual(await decodeSave(codeOf(record)), { error: 'newer' });
});

test('a code from an older save version is migrated', async () => {
  const { tutorial, musicVolume, sfxVolume, ...v18 } = played().toSave();
  const { progress, error } = await decodeSave(codeOf({ version: 18, data: v18 }));
  assert.equal(error, undefined);
  assert.equal(progress.gold, 12345);
  assert.equal(progress.tutorial.onboarding, 'done');   // a v18 save past wave 1
});

// --- The update prompt ---

// A gate over a fake battle: busy while a wave runs; logs saves and reloads.
function gate() {
  const log = [];
  const battle = { running: false };
  const g = new UpdateGate({
    isBusy: () => battle.running,
    save: () => log.push('save'),
    reload: () => log.push('reload'),
  });
  return { g, log, battle };
}

test('update: tapping between waves saves, then reloads', () => {
  const { g, log } = gate();
  g.offer();
  g.request();
  assert.deepEqual(log, ['save', 'reload']);
});

test('update: never reloads during a wave', () => {
  const { g, log, battle } = gate();
  g.offer();
  battle.running = true;
  g.request();
  assert.deepEqual(log, []);
  g.settle();          // anything else happening mid-wave
  assert.deepEqual(log, []);
  battle.running = false;
  g.settle();          // the wave ended
  assert.deepEqual(log, ['save', 'reload']);
  g.settle();
  g.request();
  assert.deepEqual(log, ['save', 'reload']);   // once
});

test('update: nothing without a new version, nor a tap', () => {
  const { g, log } = gate();
  g.request();
  g.settle();
  g.offer();
  g.settle();
  assert.deepEqual(log, []);
});

// --- Offline earnings ---

const O = MOBILE.offline;
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const NOW = Date.UTC(2026, 9, 23, 12);

test('offline: away under 2 minutes pays nothing', () => {
  const at = (ms) => awayEarnings({ idleRate: 100, lastSeen: NOW - ms, now: NOW });
  assert.equal(O.minAwayMs, 2 * MIN);
  assert.equal(O.share, 0.15);
  assert.equal(at(0).gold, 0);
  assert.equal(at(2 * MIN - 1).gold, 0);
  assert.equal(at(2 * MIN).gold, 100 * O.share * 120);
});

test('offline: pays idleRate x share x time away, up to 8 hours', () => {
  const at = (ms) => awayEarnings({ idleRate: 40, lastSeen: NOW - ms, now: NOW });
  assert.deepEqual(at(HOUR), { awayMs: HOUR, capped: false, gold: 40 * O.share * 3600, backwards: false });
  assert.equal(at(8 * HOUR).gold, 40 * O.share * 8 * 3600);
  assert.equal(at(8 * HOUR).capped, false);
  const long = at(30 * HOUR);
  assert.equal(long.gold, 40 * O.share * 8 * 3600);
  assert.equal(long.capped, true);
  assert.equal(long.awayMs, 30 * HOUR);
});

test('offline: a clock that went backwards pays nothing and resets lastSeen', () => {
  assert.deepEqual(awayEarnings({ idleRate: 100, lastSeen: NOW + HOUR, now: NOW }), {
    awayMs: 0, capped: false, gold: 0, backwards: true,
  });
  const p = new Progress();
  p.idleRate = 100;
  p.lastSeen = NOW + 5 * HOUR;
  const gold = p.gold;
  assert.equal(comeBack(p, NOW), null);
  assert.equal(p.lastSeen, NOW);
  assert.equal(p.gold, gold);
  // ...and the next return counts from the reset.
  assert.equal(comeBack(p, NOW + HOUR).gold, 100 * O.share * 3600);
});

test('offline: a new save pays nothing', () => {
  const p = new Progress();
  assert.equal(p.idleRate, 0);
  p.lastSeen = NOW - 8 * HOUR;
  assert.equal(awayEarnings({ idleRate: p.idleRate, lastSeen: p.lastSeen, now: NOW }).gold, 0);
  assert.equal(comeBack(p, NOW), null);   // nothing else to tell either (Bait full)
});

test('offline: the idle rate is a moving average (weight 0.2) of wave clears', () => {
  const p = new Progress();
  p.noteIdleRate(100);
  assert.equal(p.idleRate, 20);
  p.noteIdleRate(100);
  assert.equal(p.idleRate, 36);
  p.noteIdleRate(NaN);
  assert.equal(p.idleRate, 36);
  assert.equal(sampleIdleRate(50, 0), 40);
});

test('offline: comeBack reports gold, Bait refilled and expeditions back; collect pays', () => {
  const p = new Progress();
  p.idleRate = 10;
  p.lastSeen = NOW - 3 * HOUR;
  p.bait = 2;
  p.baitAt = NOW - 3 * HOUR - 1000;
  const report = comeBack(p, NOW);
  assert.equal(report.gold, 10 * O.share * 3 * 3600);
  assert.equal(report.expeditions, 0);
  assert.equal(report.bait.from, 2);
  assert.equal(report.bait.to, p.bait);
  assert.ok(report.bait.to > 2);
  assert.equal(p.lastSeen, NOW);
  const gold = p.gold;
  assert.equal(collect(p, report), report.gold);
  assert.equal(p.gold, gold + report.gold);
  assert.equal(p.goldAway, report.gold);
  assert.equal(formatAway(5 * HOUR + 12 * MIN + 59000), '5 h 12 m');
  assert.equal(formatAway(45 * MIN), '45 m');
});

test('offline: saves keep the idle rate, lastSeen and gold earned away; v20 saves start at 0 and now', () => {
  const p = new Progress();
  Object.assign(p, { idleRate: 12.5, lastSeen: NOW, goldAway: 999 });
  const q = Progress.fromSave(JSON.parse(JSON.stringify(p.toSave())));
  assert.deepEqual([q.idleRate, q.lastSeen, q.goldAway], [12.5, NOW, 999]);
  const { idleRate, lastSeen, goldAway, ...v20 } = p.toSave();
  const before = Date.now();
  const r = progressFromRecord({ version: 20, data: v20 });
  assert.equal(r.idleRate, 0);
  assert.equal(r.goldAway, 0);
  assert.ok(r.lastSeen >= before && r.lastSeen <= Date.now());
  assert.equal(comeBack(r), null);
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}\n     ${err.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exitCode = failed ? 1 : 0;
