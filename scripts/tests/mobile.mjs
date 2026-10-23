// Headless tests of the phone and offline features: save codes (Export /
// Import save), the update prompt's gate, and offline earnings.
// Run: npm test
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { MOBILE } from '../../src/config.js';
import { Progress } from '../../src/systems/Progress.js';
import { SAVE_VERSION } from '../../src/systems/Save.js';
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
