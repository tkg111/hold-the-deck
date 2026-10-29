// Headless tests of the Uncharted Seas and Crew Awakening: Grog coming back
// and refunds, sea / crown / stage unlocking, the drop tables, awakening's
// costs and checks, and old saves.
// Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AWAKEN, UNCHARTED } from '../../src/config.js';
import { SEAS } from '../../src/data/uncharted.js';
import { initExpeditions } from '../../src/systems/Expeditions.js';
import { Progress } from '../../src/systems/Progress.js';
import { progressFromRecord, SAVE_VERSION } from '../../src/systems/Save.js';
import {
  awakenCost, glassOf, heroDef, isCrownOpen, isSeaOpen, isStageOpen, rollDrops, seaCrown,
  stageCost, stageOf, stagePlan, stageRules, STAGES, tickGrog,
} from '../../src/systems/Uncharted.js';

initExpeditions(JSON.parse(readFileSync(new URL('../../public/sprites/ui/expedition/expedition.json', import.meta.url), 'utf8')));

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const MIN = 60 * 1000;
const { regenMs, cap } = UNCHARTED.grog;

// A player who has started a dive (the Uncharted Seas are open).
function opened() {
  const p = new Progress();
  p.abyss.runs = 1;
  return p;
}
// A random() that returns these numbers in turn.
const rolls = (...xs) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

// --- Grog ---

test('grog: one comes back every 5 minutes, offline too, up to the cap', () => {
  const rec = { grog: 10, grogAt: 0 };
  tickGrog(rec, 14 * MIN);
  assert.equal(rec.grog, 12);                 // 2 back, 4 min toward the next
  assert.equal(rec.grogAt, 2 * regenMs);
  tickGrog(rec, 10 * 60 * MIN);
  assert.equal(rec.grog, cap);
});

test('grog: the clock going backwards gives none and takes none', () => {
  const rec = { grog: 5, grogAt: 100 * MIN };
  tickGrog(rec, 50 * MIN);
  assert.equal(rec.grog, 5);
  assert.equal(rec.grogAt, 50 * MIN);
});

test('grog: a stage costs its sea\'s price, +1 and +2 at 2 and 3 crowns', () => {
  assert.equal(stageCost(stageOf('1-1'), 1), 4);
  assert.equal(stageCost(stageOf('1-1'), 3), 6);
  assert.equal(stageCost(stageOf('6-6'), 1), 8);
  assert.equal(stageCost(stageOf('4-2'), 2), 7);
});

test('grog: a loss refunds half (rounded down); a first clear refunds it all', () => {
  const p = opened();
  const now = Date.now();
  p.musterStage(stageOf('2-1'), 1);
  p.uncharted.crowns = Object.fromEntries(SEAS[0].stages.map((s) => [s.id, 1]));
  p.uncharted.grog = 20;
  assert.equal(p.beginStage(now), 5);
  assert.equal(p.uncharted.grog, 15);
  assert.equal(p.loseStage(), 2);
  assert.equal(p.uncharted.grog, 17);
  assert.equal(p.beginStage(now), 5);
  const won = p.winStage(rolls(0.99));
  assert.equal(won.refund, 5);
  assert.equal(p.uncharted.grog, 17);
  assert.equal(p.beginStage(now), 5);
  assert.equal(p.winStage(rolls(0.99)).refund, 0);   // not the first clear any more
  assert.equal(p.uncharted.grog, 12);
});

test('grog: can\'t set sail without enough', () => {
  const p = opened();
  p.uncharted.grog = 3;
  p.musterStage(stageOf('1-1'), 1);
  assert.equal(p.beginStage(), null);
  assert.equal(p.uncharted.grog, 3);
});

test('grog: refunds, galleons and expeditions may go over the cap', () => {
  const p = opened();
  p.uncharted.grog = cap;
  p.plunder({ grog: UNCHARTED.grog.galleon });
  assert.equal(p.grog, cap + UNCHARTED.grog.galleon);
});

// --- Unlocking ---

test('unlock: the first sea and its first stage are open; the rest in order', () => {
  const rec = opened().uncharted;
  assert.ok(isSeaOpen(rec, 0));
  assert.ok(!isSeaOpen(rec, 1));
  assert.ok(isStageOpen(rec, stageOf('1-1'), 1));
  assert.ok(!isStageOpen(rec, stageOf('1-2'), 1));
  rec.crowns['1-1'] = 1;
  assert.ok(isStageOpen(rec, stageOf('1-2'), 1));
});

test('unlock: a sea opens with the sea before\'s boss stage at 1 crown', () => {
  const rec = opened().uncharted;
  rec.crowns['1-6'] = 1;
  assert.ok(isSeaOpen(rec, 1));
  assert.ok(!isSeaOpen(rec, 2));
});

test('unlock: a crown tab opens when every stage is cleared at the crown below', () => {
  const rec = opened().uncharted;
  for (const s of SEAS[0].stages.slice(0, 5)) rec.crowns[s.id] = 1;
  assert.ok(!isCrownOpen(rec, 0, 2));
  rec.crowns['1-6'] = 1;
  assert.ok(isCrownOpen(rec, 0, 2));
  assert.ok(!isCrownOpen(rec, 0, 3));
  assert.ok(isStageOpen(rec, stageOf('1-1'), 2));
  assert.ok(!isStageOpen(rec, stageOf('1-2'), 2));
  assert.equal(seaCrown(rec, 0), 1);
});

test('unlock: a win records the best crown', () => {
  const p = opened();
  p.musterStage(stageOf('1-1'), 1);
  p.beginStage();
  p.winStage(rolls(0.99));
  assert.equal(p.uncharted.crowns['1-1'], 1);
});

test('the Uncharted Seas open with the first dive', () => {
  const p = new Progress();
  assert.ok(!p.unchartedUnlocked);
  p.abyss.runs = 1;
  assert.ok(p.unchartedUnlocked);
});

// --- Rules ---

test('rules: the stage\'s at 1 crown, plus its extra at 2 and 3', () => {
  assert.deepEqual(stageRules(stageOf('1-4'), 1), ['gale']);
  assert.deepEqual(stageRules(stageOf('1-4'), 3), ['gale', 'night_watch']);
  assert.deepEqual(stageRules(stageOf('1-1'), 1), []);
  assert.deepEqual(stageRules(stageOf('1-1'), 2), ['gale']);
});

test('rules: the Muster keeps Skeleton Crew to 3 and a trait rule to its trait', () => {
  const p = opened();
  p.decks = 3;
  p.owned = ['cabinBoy', 'shipsCook', 'netThrower', 'cannoneer', 'duelist', 'captain'];
  p.slots = [...p.owned];
  p.musterStage(stageOf('1-5'), 1);
  assert.equal(p.activeHeroes.length, 3);
  assert.ok(p.musterReady);
  p.endStage();
  assert.equal(p.activeHeroes.length, 6);   // back as it was
  p.musterStage(stageOf('2-5'), 1);         // Fighters only
  assert.deepEqual(p.activeHeroes.map(({ id }) => id), ['cannoneer', 'duelist', 'captain']);
  assert.ok(!p.mayMuster('cabinBoy'));
  p.endStage();
});

test('rules: Swarm doubles the count at half HP; Elite Hunt makes every 4th an Elite', () => {
  const plain = stagePlan(stageOf('1-5'), 1);   // Skeleton Crew
  const swarm = stagePlan(stageOf('1-5'), 2);   // and Swarm
  assert.ok(plain.every((e) => e.hpFactor === 1));
  assert.ok(swarm.every((e) => e.def.boss || e.hpFactor === 0.5));
  assert.ok(swarm.length > plain.length * 1.5);
  const elites = stagePlan(stageOf('1-6'), 2).filter((e) => !e.def.boss);
  elites.forEach((e, i) => assert.equal(e.elite, (i + 1) % 4 === 0));
});

test('stages: every lineup is real, each stage has its waves and the boss stages their bosses', () => {
  assert.equal(STAGES.length, 36);
  for (const s of STAGES) {
    const plan = stagePlan(s, 1);
    assert.equal(plan.filter((e) => e.gate).length, s.waves - 1, s.id);
    const bosses = Object.values(s.bosses ?? {}).flat();
    assert.deepEqual(plan.filter((e) => e.def.boss).map((e) => e.key).sort(), [...bosses].sort(), s.id);
  }
});

// --- Drops ---

test('drops: a normal stage drops its colours at 70%, always at 3 crowns, x2 at 2 and 3', () => {
  const s = stageOf('1-5');   // red, purple
  assert.deepEqual(rollDrops(s, 1, {}, rolls(0.5, 0.9)).glass, { red: 1 });
  assert.deepEqual(rollDrops(s, 2, {}, rolls(0.1)).glass, { red: 2, purple: 2 });
  assert.deepEqual(rollDrops(s, 3, {}, rolls(0.99)).glass, { red: 2, purple: 2 });
  assert.equal(rollDrops(s, 3, {}, rolls(0.99)).heart, 0);
});

test('drops: a first clear adds 3 of each of its colours', () => {
  assert.deepEqual(rollDrops(stageOf('1-1'), 1, { first: true }, rolls(0.99)).glass, { red: 3 });
});

test('drops: a boss stage drops 3 glass and a Heart at 5 / 10 / 20%', () => {
  const s = stageOf('1-6');
  const at = (crown, roll) => rollDrops(s, crown, {}, rolls(0, 0, 0, roll));
  assert.equal(Object.values(at(1, 0.04).glass).reduce((a, b) => a + b), 3);
  assert.equal(at(1, 0.04).heart, 1);
  assert.equal(at(1, 0.06).heart, 0);
  assert.equal(at(2, 0.09).heart, 1);
  assert.equal(at(3, 0.19).heart, 1);
  assert.equal(at(3, 0.21).heart, 0);
});

test('drops: the first 2- and 3-crown clears of a boss stage give a Heart', () => {
  const p = opened();
  p.uncharted.crowns = Object.fromEntries(SEAS[0].stages.map((s) => [s.id, 1]));
  p.musterStage(stageOf('1-6'), 2);
  p.beginStage();
  assert.equal(p.winStage(rolls(0.99)).heart, 1);
  p.beginStage();
  assert.equal(p.winStage(rolls(0.99)).heart, 0);   // not the first any more
});

test('drops: the Drowned Throne always gives a Heart', () => {
  assert.equal(rollDrops(stageOf('6-6'), 1, {}, rolls(0.99)).heart, 1);
});

// --- Crew Awakening ---

test('awaken: costs by rarity, own-trait glass and gold (a Caretaker\'s all gold)', () => {
  assert.equal(glassOf('duelist'), 'red');
  assert.deepEqual(awakenCost('duelist'), { red: 25, gold: 8, heart: 3 });
  assert.deepEqual(awakenCost('cabinBoy'), { blue: 12, gold: 4, heart: 1 });
  assert.deepEqual(awakenCost('shipsCook'), { gold: 16, heart: 1 });
});

test('awaken: needs the Uncharted Seas, the level and the items', () => {
  const p = new Progress();
  p.owned.push('duelist');
  assert.equal(p.awakenBlock('duelist'), 'locked');
  p.abyss.runs = 1;
  assert.equal(p.awakenBlock('duelist'), 'level');
  p.heroLevels.duelist = AWAKEN.level;
  assert.equal(p.awakenBlock('duelist'), 'items');
  Object.assign(p.uncharted.items, { red: 25, gold: 8, heart: 3 });
  assert.equal(p.awakenBlock('duelist'), null);
  const before = p.heroDamage('duelist');
  assert.ok(p.awaken('duelist'));
  assert.deepEqual([p.itemCount('red'), p.itemCount('gold'), p.itemCount('heart')], [0, 0, 0]);
  assert.equal(p.awakenBlock('duelist'), 'awake');
  assert.ok(Math.abs(p.heroDamage('duelist') / before - AWAKEN.damage) < 1e-9);
  assert.ok(!p.awaken('duelist'));
});

test('awaken: the awakened definition carries its upgrade', () => {
  assert.equal(heroDef('stormCaller', true).chain.targets, 5);
  assert.equal(heroDef('stormCaller').chain.targets, 3);
  assert.equal(heroDef('cabinBoy', true).area.radius, 12);
});

// --- Saves ---

test('saves: the record and awakenings round-trip', () => {
  const p = opened();
  p.owned.push('duelist');
  p.awakened = ['duelist'];
  p.uncharted.grog = 12;
  p.uncharted.items.purple = 7;
  p.uncharted.crowns = { '1-1': 2 };
  p.uncharted.firstClears = ['1-1:1', '1-1:2'];
  const q = Progress.fromSave(JSON.parse(JSON.stringify(p.toSave())));
  assert.deepEqual(q.uncharted, p.uncharted);
  assert.deepEqual(q.awakened, ['duelist']);
});

test('saves: a Muster saves the crew as it was before it', () => {
  const p = opened();
  p.decks = 2;
  p.owned = ['cabinBoy', 'shipsCook', 'netThrower', 'duelist'];
  p.slots = ['cabinBoy', 'shipsCook', 'netThrower', 'duelist', null, null];
  p.musterStage(stageOf('1-5'), 1);
  assert.deepEqual(p.toSave().slots.slice(0, 4), ['cabinBoy', 'shipsCook', 'netThrower', 'duelist']);
});

test('saves: a v24 save starts with full Grog, nothing cleared, nobody awakened', () => {
  const { uncharted, awakened, ...v24 } = opened().toSave();
  const p = progressFromRecord({ version: 24, data: v24 });
  assert.equal(SAVE_VERSION, 25);
  assert.equal(p.uncharted.grog, cap);
  assert.deepEqual(p.uncharted.crowns, {});
  assert.deepEqual(p.awakened, []);
});

test('saves: unknown stages and crew are dropped, numbers clamped', () => {
  const data = opened().toSave();
  data.uncharted = {
    grog: -4, items: { red: 'x', heart: 2.7 }, crowns: { '9-9': 3, '1-1': 7 }, firstClears: ['9-9:1', '1-1:1'],
  };
  data.awakened = ['duelist', 'nobody'];
  const p = Progress.fromSave(data);
  assert.equal(p.uncharted.grog, 0);
  assert.deepEqual([p.itemCount('red'), p.itemCount('heart')], [0, 2]);
  assert.deepEqual(p.uncharted.crowns, { '1-1': 3 });
  assert.deepEqual(p.uncharted.firstClears, ['1-1:1']);
  assert.deepEqual(p.awakened, []);   // not owned
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
