// Headless tests of playtest round 2: time away by the hour, the expedition
// gold cap, cooking timers through a save, the Uncharted Seas' Abyss depth
// gate (and old saves keeping their seas), rewarded-ad passes, the
// merchants' 12 s window on every battlefield and the quick-upgrade buys.
// Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ADS, EXPEDITIONS, ISLANDS, MEALS, MERCHANTS, MOBILE, UNCHARTED,
} from '../../src/config.js';
import { createAds } from '../../src/ads/index.js';
import * as Expeditions from '../../src/systems/Expeditions.js';
import { laneSpeed } from '../../src/systems/Merchants.js';
import { awayEarnings, comeBack } from '../../src/systems/Offline.js';
import { Progress } from '../../src/systems/Progress.js';
import { progressFromRecord, saveRecord } from '../../src/systems/Save.js';
import { seaLock, stageOf } from '../../src/systems/Uncharted.js';

const readJson = (path) => JSON.parse(readFileSync(new URL(`../../public/sprites/${path}`, import.meta.url), 'utf8'));
Expeditions.initExpeditions(readJson('ui/expedition/expedition.json'));

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const NOW = Date.UTC(2026, 10, 2, 12);

// Through the saved form and back, as a reload does.
const reload = (p) => progressFromRecord(JSON.parse(JSON.stringify(saveRecord(p))));

// A save as v25 would have written it (none of v26's fields).
function v25(p) {
  const { keepScreenOn, pots, boosts, ...data } = p.toSave();
  const { opened, ...uncharted } = data.uncharted;
  return { version: 25, savedAt: '', data: { ...data, uncharted } };
}

// --- Time away, by the hour ---

test('offline: 30 min and 1 h pay nothing; 2 h one hour at full rate; 4 h 2.25 h; 8 h stops at 2.5 h', () => {
  const rate = 50;
  const pay = (ms) => awayEarnings({ idleRate: rate, lastSeen: NOW - ms, now: NOW }).gold;
  const hour = rate * MOBILE.offline.share * 3600;
  assert.equal(pay(30 * MIN), 0);
  assert.equal(pay(HOUR), 0);
  assert.equal(pay(2 * HOUR), Math.floor(hour));
  assert.equal(pay(4 * HOUR), Math.floor(hour * 2.25));
  assert.equal(pay(8 * HOUR), Math.floor(hour * 2.5));
});

test('offline: only gold follows the hours: Bait and cooking count the whole time', () => {
  const p = new Progress();
  p.idleRate = 50;
  p.lastSeen = NOW - 30 * MIN;
  p.bait = 0;
  p.baitAt = NOW - 30 * MIN;
  p.fishLog.sardine = 1;
  p.fish.sardine = 3;
  p.cook('fish_stew', NOW - 30 * MIN);
  const report = comeBack(p, NOW);
  assert.equal(report.gold, 0);
  assert.ok(report.bait && report.bait.to > 0, 'Bait came back');
  assert.equal(report.meals, 1, 'the stew finished while away');
});

// --- The expedition gold cap ---

function expeditionProgress() {
  const p = new Progress();
  p.islands.skull_cove.wave = 20;
  p.islands.skull_cove.best = 19;
  // A huge pace of battle gold, so the cap is what holds a run back.
  p.goldLog = Array.from({ length: EXPEDITIONS.recentWaves }, () => ({ gold: 1e9, ms: 60000 }));
  return p;
}

test('expeditions: gold at most 1 / 3 / 6 waves for 30 min / 2 h / 8 h; Pearls and chests unchanged', () => {
  const p = expeditionProgress();
  const wave = Expeditions.waveGoldOf(p);
  assert.deepEqual(EXPEDITIONS.durations.map((d) => d.goldWaves), [1, 3, 6]);
  const party = ['cabinBoy'];
  for (const [duration, waves] of [['30m', 1], ['2h', 3], ['8h', 6]]) {
    for (const dest of ['coral_shallows', 'smugglers_cave']) {
      const v = Expeditions.preview(p, dest, party, duration);
      assert.equal(v.goldCap, Math.round(waves * wave));
      assert.ok(v.capped);
      assert.ok(v.gold[1] <= v.goldCap && v.goldRaw[1] > v.goldCap);
      const loot = Expeditions.rollLoot(p, dest, party, duration, () => 0.5);
      assert.equal(loot.gold, v.goldCap, `${dest} ${duration}`);
      assert.equal(loot.goldCapped, true);
    }
  }
  // Items don't change with the cap: a chest run still finds its chest.
  const loot = Expeditions.rollLoot(p, 'smugglers_cave', party, '30m', () => 0.5);
  assert.equal(loot.chests.length, 1);
});

test('expeditions: a slow pace is under the cap and not marked capped', () => {
  const p = expeditionProgress();
  p.goldLog = p.goldLog.map(() => ({ gold: 1, ms: 60000 }));
  const v = Expeditions.preview(p, 'coral_shallows', ['cabinBoy'], '8h');
  assert.equal(v.capped, false);
  const loot = Expeditions.rollLoot(p, 'coral_shallows', ['cabinBoy'], '8h', () => 0.5);
  assert.equal(loot.goldCapped, false);
  assert.ok(loot.gold < v.goldCap);
});

// --- Cooking pots ---

function cook() {
  const p = new Progress();
  for (const f of ['sardine', 'mackerel', 'golden_koi']) {
    p.fishLog[f] = 1;
    p.fish[f] = 6;
  }
  p.spice = 4;
  return p;
}

test('cooking: two pots; a third meal waits; ingredients go at once', () => {
  const p = cook();
  assert.equal(MEALS.pots, 2);
  assert.ok(p.cook('fish_stew', NOW));
  assert.equal(p.fish.sardine, 3, 'taken when cooking starts');
  assert.ok(p.cook('golden_koi_feast', NOW));
  assert.equal(p.freePot, -1);
  assert.equal(p.cook('grilled_mackerel', NOW), false, 'both pots busy');
  assert.equal(p.fish.mackerel, 6, 'nothing taken');
});

test('cooking: times by tier (5 / 15 / 30 / 60 min), through a save and reload', () => {
  const tiers = {
    fish_stew: 5, grilled_mackerel: 5, boot_soup: 5, snapper_curry: 15, puffer_sashimi: 15, ember_eel_skewers: 15,
    ice_cod_chowder: 15, ghost_carp_soup: 15, moonfish_pie: 30, swordfish_steak: 30, angler_bake: 30, golden_koi_feast: 60,
  };
  for (const [id, min] of Object.entries(tiers)) assert.equal(MEALS.list[id].cookMs, min * MIN, id);
  const p = cook();
  p.cook('fish_stew', NOW);
  p.cook('golden_koi_feast', NOW);
  const back = reload(p);
  assert.deepEqual(back.pots, p.pots);
  assert.equal(back.potReady(0, NOW + 5 * MIN - 1), false);
  assert.equal(back.potReady(0, NOW + 5 * MIN), true);
  assert.equal(back.readyPots(NOW + 59 * MIN), 1);
  assert.equal(back.collectPot(1, NOW + 59 * MIN), null, 'the feast is still cooking');
  assert.equal(back.collectPot(0, NOW + 59 * MIN), 'fish_stew');
  assert.equal(back.pantryCount('fish_stew'), 1);
  assert.equal(back.freePot, 0);
  // ...and a reload later the feast is done.
  const later = reload(back);
  assert.equal(later.collectReady(NOW + HOUR), 1);
  assert.equal(later.pantryCount('golden_koi_feast'), 1);
  assert.ok(later.eat('golden_koi_feast'), 'eating is instant');
});

test('cooking: a v25 save keeps its Pantry and gets empty pots', () => {
  const p = cook();
  p.pantry.fish_stew = 2;
  const back = progressFromRecord(v25(p));
  assert.deepEqual(back.pots, [null, null]);
  assert.equal(back.pantryCount('fish_stew'), 2);
});

// --- The Abyss depth gate ---

function charted(best) {
  const p = new Progress();
  p.abyss.runs = 1;
  p.abyss.best = best;
  return p;
}

test('depth gate: sea N needs its boss before and depth 10 / 20 / 30 / 40 / 55 / 70', () => {
  assert.deepEqual(UNCHARTED.seaDepths, [10, 20, 30, 40, 55, 70]);
  const p = charted(9);
  assert.deepEqual(p.seaLock(0), { depth: 10 });
  assert.equal(p.canSailStage(stageOf('1-1'), 1, NOW), false);
  p.abyss.best = 10;
  assert.equal(p.seaLock(0), null);
  assert.ok(p.canSailStage(stageOf('1-1'), 1, NOW));
  // Sea 2: the boss first, then the depth.
  assert.deepEqual(p.seaLock(1), { boss: true });
  p.uncharted.crowns['1-6'] = 1;
  assert.deepEqual(p.seaLock(1), { depth: 20 });
  assert.ok(p.seaDepthLocked, 'the Captain\'s tip would show');
  p.abyss.best = 20;
  assert.equal(p.seaLock(1), null);
  for (const [sea, depth] of [[2, 30], [3, 40], [4, 55], [5, 70]]) {
    p.uncharted.crowns[`${sea}-6`] = 1;
    assert.deepEqual(seaLock(p.uncharted, sea, depth - 1), { depth }, `sea ${sea + 1}`);
    assert.equal(seaLock(p.uncharted, sea, depth), null);
  }
});

test('depth gate: a v25 save keeps every sea it had open, at any depth; a new one starts gated', () => {
  const p = charted(3);
  p.uncharted.crowns['1-6'] = 1;
  p.uncharted.crowns['2-6'] = 1;
  const back = progressFromRecord(v25(p));
  assert.deepEqual(back.uncharted.opened, [0, 1, 2]);
  for (const sea of [0, 1, 2]) assert.equal(back.seaLock(sea), null, `sea ${sea + 1}`);
  assert.deepEqual(back.seaLock(3), { boss: true });
  back.uncharted.crowns['3-6'] = 1;
  assert.deepEqual(back.seaLock(3), { depth: 40 }, 'new seas still need the depth');
  assert.deepEqual(reload(back).uncharted.opened, [0, 1, 2], 'kept through a reload');
  // A save that never dove keeps nothing.
  const fresh = new Progress();
  assert.deepEqual(progressFromRecord(v25(fresh)).uncharted.opened, []);
});

// --- Rewarded ads ---

// A provider that answers each show() with the next of results.
const fakeProvider = (...results) => {
  const shown = [];
  return {
    name: 'fake', free: false, shown, show: async (placement) => { shown.push(placement); return results.shift(); },
  };
};

test('ads: the reward only on true (watched to the end); 30 s between ads', async () => {
  let clock = NOW;
  const provider = fakeProvider('closed', 'unavailable', 'rewarded', 'rewarded');
  const ads = createAds(provider, { now: () => clock });
  assert.equal(await ads.showRewarded('auto'), false);
  assert.equal(ads.lastError, 'closed');
  clock += ADS.cooldownMs;
  assert.equal(await ads.showRewarded('auto'), false);
  assert.equal(ads.lastError, 'unavailable');
  assert.equal(await ads.showRewarded('speed4x'), true, 'no cooldown after one that never loaded');
  assert.equal(await ads.showRewarded('speed4x'), false);
  assert.equal(ads.lastError, 'cooldown');
  assert.equal(provider.shown.length, 3, 'nothing shown during the cooldown');
  clock += ADS.cooldownMs;
  assert.equal(await ads.showRewarded('speed4x'), true);
  await assert.rejects(ads.showRewarded('pearls'));
});

test('ads: the web gives the reward with no ad and no cooldown', async () => {
  const ads = createAds({ name: 'web', free: true, show: async () => 'rewarded' }, { now: () => NOW });
  assert.equal(ads.free, true);
  assert.equal(await ads.showRewarded('speed4x'), true);
  assert.equal(await ads.showRewarded('auto'), true);
});

test('ads: passes count down per wave (a stage 3) and survive a reload', () => {
  const p = new Progress();
  assert.deepEqual(p.boosts, { speed4x: 0, auto: 0 });
  p.grantPass('speed4x');
  p.grantPass('auto');
  assert.deepEqual(p.boosts, { speed4x: ADS.passes.speed4x.waves, auto: ADS.passes.auto.waves });
  assert.deepEqual([ADS.passes.speed4x.waves, ADS.passes.auto.waves, ADS.stageWaves], [10, 15, 3]);
  assert.equal(p.usePass('speed4x'), false);
  assert.equal(p.usePass('auto', ADS.stageWaves), false);
  const back = reload(p);
  assert.deepEqual(back.boosts, { speed4x: 9, auto: 12 });
  for (let i = 0; i < 8; i++) back.usePass('speed4x');
  assert.equal(back.usePass('speed4x'), true, 'the 10th wave uses it up');
  assert.equal(back.usePass('speed4x'), false);
  assert.equal(back.boosts.speed4x, 0);
  back.boosts.auto = 2;
  assert.equal(back.usePass('auto', ADS.stageWaves), true, 'a stage takes what is left');
  assert.equal(back.boosts.auto, 0);
});

test('ads: Auto is free until Skull Cove is cleared; a v25 save starts with no passes', () => {
  const p = new Progress();
  assert.ok(p.autoFree && p.autoAllowed);
  p.islands.skull_cove.cleared = true;
  assert.ok(!p.autoFree && !p.autoAllowed);
  p.grantPass('auto');
  assert.ok(p.autoAllowed);
  assert.deepEqual(progressFromRecord(v25(p)).boosts, { speed4x: 0, auto: 0 });
});

// --- Merchants: 12 s to tap on every battlefield ---

test('merchants: every ship can be tapped for at least 12 s on every battlefield', () => {
  const ships = readJson('merchants/merchants.json').ships;
  const fields = [...ISLANDS.filter((i) => i.available).map((i) => i.id), 'abyss'];
  assert.ok(fields.length >= 5);
  for (const field of fields) {
    const lane = { ...MERCHANTS.lane, ...MERCHANTS.lanes[field] };
    for (const [type, spec] of Object.entries(ships)) {
      if (!MERCHANTS.types[type]) continue;
      const w = spec.frame[0];
      const speed = laneSpeed(type, lane, w);
      // Tappable from its middle passing tapFromX until its bow reaches fadeX.
      const ms = ((lane.fadeX - w) - (MERCHANTS.tapFromX - w / 2)) / speed * 1000;
      assert.ok(ms >= MERCHANTS.minTapMs - 1, `${type} on ${field}: ${Math.round(ms)} ms`);
      assert.ok(speed > 10, `${type} on ${field} still sails (${speed.toFixed(1)} px/s)`);
    }
  }
  assert.equal(MERCHANTS.minTapMs, 12000);
  assert.ok(MERCHANTS.crateHoldMs >= 1500, 'plunder text stays 1.5 s');
});

// --- The quick-upgrade card's buys ---

test('quick upgrade: x1 / x10 / MAX spend exactly their plans', () => {
  const p = new Progress();
  const id = 'cabinBoy';
  const costs = (from, n) => Array.from({ length: n }, (_, k) => p.heroLevelCost(id, from + k)).reduce((a, b) => a + b, 0);
  p.gold = costs(1, 1) - 1;
  assert.equal(p.heroBuyPlan(id, '1').affordable, false);
  assert.equal(p.buyHeroLevels(id, '1'), 0);
  assert.equal(p.heroLevel(id), 1);
  p.gold = costs(1, 1);
  assert.equal(p.buyHeroLevels(id, '1'), 1);
  assert.deepEqual([p.heroLevel(id), p.gold], [2, 0]);
  // x10: all ten or none.
  p.gold = costs(2, 10) - 1;
  assert.equal(p.buyHeroLevels(id, '10'), 0);
  p.gold = costs(2, 10) + 5;
  assert.equal(p.buyHeroLevels(id, '10'), 10);
  assert.deepEqual([p.heroLevel(id), p.gold], [12, 5]);
  // MAX: as many as the gold allows.
  p.gold = costs(12, 7) + costs(19, 1) - 1;
  const plan = p.heroBuyPlan(id, 'max');
  assert.deepEqual([plan.count, plan.cost], [7, costs(12, 7)]);
  assert.equal(p.buyHeroLevels(id, 'max'), 7);
  assert.equal(p.heroLevel(id), 19);
  assert.equal(p.gold, costs(19, 1) - 1);
  // Not owned: nothing.
  p.gold = 1e12;
  assert.equal(p.buyHeroLevels('whaler', 'max'), 0);
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
