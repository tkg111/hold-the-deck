// Headless tests of Rankings (src/online/) against a fake Supabase client
// (fakeSupabase.mjs): joining, the boards and their cache, a missing env.
// Run: npm test
import assert from 'node:assert/strict';
import { RANKINGS } from '../../src/config.js';
import { Boards } from '../../src/online/Boards.js';
import { checkName, cleanCode } from '../../src/online/names.js';
import { Online } from '../../src/online/Online.js';
import { Progress } from '../../src/systems/Progress.js';
import { progressFromRecord } from '../../src/systems/Save.js';
import { fakeServer } from './fakeSupabase.mjs';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// A clock the tests move by hand.
function clock(start = 1_000_000) {
  const c = { t: start, now: () => c.t, add: (ms) => { c.t += ms; } };
  return c;
}

// One device: a fake server (or the one given), its client, an Online over
// it (counting clients made) and a Progress.
function device({ server = fakeServer(), time = clock() } = {}) {
  const client = server.client();
  const d = { server, client, time, made: 0, progress: new Progress(), saves: 0 };
  d.online = new Online({
    url: 'https://test.supabase.co',
    key: 'anon',
    createClient: async () => { d.made++; return client; },
  });
  d.online.time = time;
  d.boards = new Boards({ online: d.online, now: time.now, isOnline: () => !d.offline });
  d.boards.attach({ record: () => d.progress.online, save: () => { d.saves++; } });
  return d;
}

async function joined(d, name = 'Kar Guan') {
  const me = await d.online.join(name);
  Object.assign(d.progress.online, {
    joined: true, name: me.name, code: me.code, lastSubmittedDepth: me.best,
  });
  return me;
}

// --- Set up or not ---

test('without the env keys Rankings are off, and nothing is loaded', async () => {
  let made = 0;
  const online = new Online({ url: '', key: '', createClient: async () => { made++; } });
  assert.equal(online.available, false);
  assert.equal(await online.hasSession(), false);
  for (const call of [() => online.join('Kar Guan'), () => online.worldTop(), () => online.submitDepth(5)]) {
    await assert.rejects(call, (err) => err.kind === 'off');
  }
  assert.equal(made, 0);
  assert.equal(new Online({ url: 'https://x.supabase.co', createClient: async () => {} }).available, false);
});

test('the real env reads as off in Node (no keys), so tests never reach a server', async () => {
  const { online } = await import('../../src/online/index.js');
  assert.equal(online.available, false);
});

// --- Joining ---

test('nothing touches the network before joining', async () => {
  const d = device();
  assert.equal(d.online.available, true);
  checkName('Kar Guan');
  assert.equal(d.made, 0);
  assert.deepEqual(d.server.calls, []);
});

test('join signs in anonymously once, then names the captain', async () => {
  const d = device();
  const me = await joined(d);
  assert.equal(me.name, 'Kar Guan');
  assert.match(me.code, /^[A-Z2-9]{6}$/);
  assert.equal(me.best, 0);
  assert.deepEqual(d.server.calls, ['signInAnonymously', 'set_captain_name']);
  await d.online.setName('Guan the Bold');
  assert.equal((await d.online.profile()).name, 'Guan the Bold');
  assert.equal(d.server.calls.filter((c) => c === 'signInAnonymously').length, 1);
});

test("the server's messages come back for the player; a dropped connection is 'network'", async () => {
  const d = device();
  await joined(d);
  await assert.rejects(d.online.addFriend('ZZZZZZ'), (err) => err.kind === 'server' && err.message === 'No captain has that code');
  await assert.rejects(d.online.addFriend(d.progress.online.code), (err) => err.kind === 'server' && err.message === 'That is your own code');
  d.server.offline = true;
  await assert.rejects(d.online.worldTop(), (err) => err.kind === 'network');
});

test("a device with no captain gets 'auth' (join again)", async () => {
  const d = device();
  await assert.rejects(d.online.submitDepth(5), (err) => err.kind === 'auth');
  await assert.rejects(d.online.friendsBoard(), (err) => err.kind === 'auth');
  assert.equal(await d.online.hasSession(), false);
});

test('names: the pattern and blocked words', () => {
  assert.deepEqual(checkName('  Kar Guan  '), { name: 'Kar Guan' });
  for (const ok of ['Bosun', 'Peg_Leg-Lim', 'Captain Ah Seng', 'abc', 'Spice Trader', 'Grapeshot']) {
    assert.ok(checkName(ok).name, ok);
  }
  for (const bad of ['ab', 'a'.repeat(17), 'Kar.Guan', 'Ka$h', '']) assert.ok(checkName(bad).error, bad);
  for (const rude of ['Sh1t Lord', 'F_u-c k', 'BITCHY', 'pukimak99']) assert.equal(checkName(rude).error, 'Pick another name, captain.', rude);
  assert.equal(cleanCode(' 6zk wn8 '), '6ZKWN8');
  assert.equal(cleanCode('6ZKWN'), null);
  assert.equal(cleanCode('6ZKWN0'), null);   // no 0, 1, I or O in codes
});

// --- Boards ---

test('world board: the top list and my rank, kept in the save with its time', async () => {
  const d = device();
  d.server.seed();
  await joined(d);
  await d.online.submitDepth(150);
  const { board, status } = await d.boards.load('world');
  assert.equal(status, 'fresh');
  assert.equal(board.at, d.time.now());
  assert.equal(board.rows[0].name, 'Salty Sam');
  assert.deepEqual(board.rows.find((r) => r.me), { rank: 4, name: 'Kar Guan', best: 150, me: true });
  assert.deepEqual(board.me, { rank: 4, best: 150, total: 10 });
  assert.equal(d.progress.online.world, board);
  assert.equal(d.saves, 1);
});

test('crew board: mutual crews, and the code fetched if the save lacks it', async () => {
  const server = fakeServer();
  const a = device({ server });
  const b = device({ server });
  await joined(a, 'Kar Guan');
  await joined(b, 'Bosun');
  assert.deepEqual(await a.online.addFriend(b.progress.online.code), { id: 'user-2', name: 'Bosun' });
  b.progress.online.code = '';
  const { board } = await b.boards.load('crew');
  assert.deepEqual(board.rows.map((r) => r.name).sort(), ['Bosun', 'Kar Guan']);
  assert.equal(b.progress.online.code, server.profiles.get('user-2').code);
  await b.online.removeFriend('user-1');
  const after = await b.boards.load('crew', { force: true });
  assert.deepEqual(after.board.rows.map((r) => r.name), ['Bosun']);
});

test('a board is fetched at most every 10 s', async () => {
  const d = device();
  await joined(d);
  await d.boards.load('world');
  const calls = d.server.calls.length;
  d.time.add(RANKINGS.refreshMs - 1);
  assert.ok(d.boards.refreshIn('world') > 0);
  assert.equal((await d.boards.load('world')).status, 'fresh');
  assert.equal(d.server.calls.length, calls);
  d.time.add(1);
  assert.equal(d.boards.refreshIn('world'), 0);
  await d.boards.load('world');
  assert.equal(d.server.calls.length, calls + 2);
  // The other tab has its own clock.
  assert.equal(d.boards.refreshIn('crew'), 0);
});

test('offline, or when a call fails, the cached board is shown', async () => {
  const d = device();
  d.server.seed();
  await joined(d);
  const fresh = await d.boards.load('world');
  const at = fresh.board.at;
  // The device says it's offline: no call at all.
  d.offline = true;
  d.time.add(RANKINGS.refreshMs);
  const calls = d.server.calls.length;
  const off = await d.boards.load('world');
  assert.equal(off.status, 'offline');
  assert.equal(off.board.at, at);
  assert.equal(off.board.rows.length, 9);
  assert.equal(d.server.calls.length, calls);
  // Online, but the call fails.
  d.offline = false;
  d.server.offline = true;
  d.time.add(RANKINGS.refreshMs);
  const failed = await d.boards.load('world');
  assert.equal(failed.status, 'offline');
  assert.equal(failed.board.at, at);
  // The cache survives a save and reload.
  const reloaded = Progress.fromSave(JSON.parse(JSON.stringify(d.progress.toSave())));
  assert.deepEqual(reloaded.online.world, d.progress.online.world);
  // Nothing cached yet: no board, still offline.
  const crew = await d.boards.load('crew');
  assert.deepEqual([crew.status, crew.board], ['offline', null]);
});

test("a board call with no captain asks to join again ('join')", async () => {
  const d = device();
  Object.assign(d.progress.online, { joined: true, name: 'Kar Guan' });   // an imported save
  assert.equal((await d.boards.load('world')).status, 'join');
});

// --- The save ---

test('saves keep the Rankings record; v21 saves start not joined, nothing cached', () => {
  const p = new Progress();
  Object.assign(p.online, {
    joined: true, name: 'Kar Guan', code: '6ZKWN8', lastSubmittedDepth: 42,
    crew: { at: 5, rows: [{ rank: 1, id: 'user-1', name: 'Kar Guan', best: 42, me: true }] },
  });
  const q = Progress.fromSave(JSON.parse(JSON.stringify(p.toSave())));
  assert.deepEqual(q.online, p.online);
  const { online, ...v21 } = p.toSave();
  const r = progressFromRecord({ version: 21, data: v21 });
  assert.deepEqual(r.online, {
    joined: false, name: '', code: '', lastSubmittedDepth: 0, world: null, crew: null,
  });
  // A broken record is cleaned up rather than trusted.
  const s = Progress.fromSave({ ...p.toSave(), online: { joined: 'yes', name: 7, lastSubmittedDepth: -3, world: { rows: 'x' } } });
  assert.deepEqual([s.online.joined, s.online.name, s.online.lastSubmittedDepth, s.online.world], [false, '', 0, null]);
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
