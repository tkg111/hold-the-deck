// The whole game, the way a player plays it, from a fresh save to the
// Drowned King: `npm run sim:journey -- <profile> <seeds> [options]`.
//
// profile: casual, regular, hardcore or all. seeds: how many (1000 on), or a
// list (1000,1003). Options:
//   days=120     stop a run after this many days (it also stops when 6-6 is
//                beaten at 1 crown)
//   jobs=4       runs at once (child processes); default: one per run, up to
//                the CPU count less one
//   out=file     write every run's full record (JSON) there
//   svg=file     draw the pacing chart of the median Regular run there
//   noff         play every battle (no fast-forward, see below)
//   playon       keep playing after 6-6 (to the day cap), for the
//                milestones past it (the Abyss's depths, awakenings)
//   speeds=old   the battle speeds before playtest round 2 (x1 for Casual,
//                x4 for the others, no ads), to see what the round's other
//                changes alone do
//
// The player plays in sessions of real time (PROFILES), with the game closed
// between them; the clock (Date.now) is the sim's, so Grog, Bait,
// expeditions, offline earnings and the Boss Hunts' daily doubles all run on
// it through the game's own code. Each session, in order:
//   1. Collect: While-you-were-away (Offline.comeBack / collect) and every
//      expedition back (Expeditions.collect).
//   2. Spend: ship parts first (crafted or upgraded as soon as the materials
//      and gold are there), then simulate.mjs's greedy bot (chests whenever
//      affordable, decks, levels and hull cheapest first, which is what
//      MAX buying comes to), awakening anyone who can be.
//   3. Expeditions: idle crew (not on the ship) on the longest run that's
//      back before the next session.
//   4. The Galley: fish with all the Bait (a reel model, see castLine), keep
//      both pots cooking the best meal that can be made (mealScore), and
//      eat the best one in the Pantry when none is on (also after every
//      battle, taking out whatever has finished).
//   5. Battle for the rest of the session, spending after every battle;
//      merchants come by in waves and dives (MerchantClock) and are tapped
//      at the profile's rate.
//      - Islands: sail on; after STUCK_LOSSES losses in a row on one wave,
//        the day's Boss Hunts (each boss until it's lost or its doubles are
//        used), then back at the wall wave (the game has no way to replay an
//        earlier wave; a loss there still pays its kills) until the session
//        ends. The next session sails at it again.
//      - Once the Abyss is open: the Uncharted Seas while there's Grog
//        (leaving a dive under way, as the chart does) and a stage is open
//        (the seas' Abyss depth gate counting), then dives from the deepest
//        checkpoint for the rest of the session.
//      - The Uncharted Seas: the lowest open stage and crown not yet won
//        (sea, then crown, then stage) that isn't blocked (lost
//        BLOCK_LOSSES times in a row, until the crew's power is up
//        BLOCK_POWER on that); with none, farming toward the next awakening
//        (the crewmate it adds the most DPS to): the stage with the most of
//        the colour still missing per Grog, a boss stage for Hearts.
// Uncharted stages are mustered by uncharted.mjs's bot (its MECH=use
// hooks). Earned crew (who join at level 1) are judged at the deck's level
// and brought up to it when the gold is there (earnedOnDeck).
//
// Fast-forward: a battle (an Abyss depth, or an Uncharted stage at a crown)
// won the last FF_STREAK times it was played, each time with a crew the
// current one is at least as strong as (same crew in the same slots, damage
// and attack speed per slot, max hull and parts no lower), isn't played: its
// last win's kills are paid again (Pearls, gold, materials, treasure) and
// the depth's or stage's win is paid by the game's own code, at the average
// of those wins' time. Every FF_RECHECK-th one is played anyway. Island
// waves and Boss Hunts are played once each, so they're never skipped.
import { fork } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  ADS, AWAKEN, ENEMIES, EXPEDITIONS, FISHING, HEROES, ISLANDS, MEALS, MERCHANTS, UNCHARTED,
} from '../../src/config.js';
import { SEAS } from '../../src/data/uncharted.js';
import * as Expeditions from '../../src/systems/Expeditions.js';
import { initFishing, mealFish, rollFish, rollRarity } from '../../src/systems/Fishing.js';
import { rollMerchant, rollPlunder } from '../../src/systems/Merchants.js';
import * as Offline from '../../src/systems/Offline.js';
import { gameParts, slotParts, PART_DATA } from '../../src/systems/Parts.js';
import { Progress } from '../../src/systems/Progress.js';
import { newSeed } from '../../src/systems/Abyss.js';
import {
  awakenCost, bestCrown, isBossStage, isStageOpen, STAGES, stageCost, stagePlan,
} from '../../src/systems/Uncharted.js';
import {
  between, makeBattle, payKills, playWave, seedRandom,
} from './simulate.mjs';
import { MECH_HOOKS, muster, sheetDps } from './uncharted.mjs';

const readJson = (path) => JSON.parse(readFileSync(new URL(`../../public/sprites/${path}`, import.meta.url), 'utf8'));
initFishing(readJson('fishing/fishing.json'));

// --- The players ---

// sessions: the hours of the day each session starts; minutes: how long it
// lasts (real time); speed: the battle speed off an ad pass (x2, free);
// x4: the share of battles played at x4 on a rewarded-ad pass (re-watched
// as it runs out); tap: the share of merchant ships tapped. Auto battle is
// always on, its pass re-watched as it runs out (it's free until Skull Cove
// is cleared). Rather than rolling dice for the speed (which would shift
// every run's luck), each battle takes its expected real time at the mix.
export const PROFILES = {
  casual: {
    sessions: [8, 20], minutes: 15, speed: 2, x4: 0.3, tap: 0.7,
  },
  regular: {
    sessions: [8, 12, 17, 21], minutes: 20, speed: 2, x4: 0.3, tap: 0.9,
  },
  hardcore: {
    sessions: [7, 10, 13, 16, 19, 22], minutes: 45, speed: 2, x4: 0.7, tap: 0.9,
  },
};
// speeds=old: the speeds before playtest round 2 (every speed free, x4 the
// top one; Casual played at x1), with no ads.
const OLD_SPEEDS = { casual: 1, regular: 4, hardcore: 4 };
// A rewarded ad's real time (the ad, and back to the game).
const AD_MS = 35000;

// Real time that isn't battle (at any speed): between battles (the
// auto-continue's AUTO_CONTINUE.delayMs, the banner), after a stage or a
// dive (its results screen), each session's menus (collecting, the
// Shipwright, expeditions, the Galley), and each cast (the wait, the bite,
// the reel).
const OVERHEAD = {
  battle: 3000, stage: 8000, diveEnd: 6000, session: 45000, cast: 10000,
};
const STUCK_LOSSES = 5;
const BLOCK_LOSSES = 3;
const BLOCK_POWER = 1.1;
const FF_STREAK = 3;
const FF_RECHECK = 10;
// The reel: each press lands in the catch zone at REEL_SKILL x its width
// (FISHING.rarities' zone), up to REEL_MAX.
const REEL_SKILL = 3;
const REEL_MAX = 0.95;

const HOUR = 3600e3;
const DAY = 24 * HOUR;
// Day 0 starts at local midnight (the hunts' doubles reset there).
const START = new Date(2026, 0, 5).getTime();

// --- The clock ---

let now = START;
Date.now = () => now;

// --- One run ---

const ISLAND_TAG = { skull_cove: 'S', ember_isle: 'E', frostbite_reef: 'F', fogbound_isle: 'Fo' };
const islandTag = (id, wave) => `${ISLAND_TAG[id] ?? id}${wave}`;
const shortName = (id) => HEROES[id].shortName ?? HEROES[id].name;
const pick = (xs, f) => xs.reduce((best, x) => (best == null || f(x) > f(best) ? x : best), null);

export function journey(profileId, seed, {
  days = 120, ff = true, without = [], playOn = false, oldSpeeds = false,
} = {}) {
  const off = new Set(without);
  const P = PROFILES[profileId];
  const t0 = process.hrtime.bigint();
  now = START;
  seedRandom(seed);
  const p = new Progress();
  p.autoAbilities = true;
  const scene = makeBattle(p);
  payKills(scene, p);
  Object.assign(scene, MECH_HOOKS.use);
  scene.events.on('enemy-stole', (e) => {
    p.gold -= Math.min(p.gold, Math.ceil(p.gold * e.def.stealPercent));
  });

  // Everything the report reads.
  const J = {
    profile: profileId,
    seed,
    attempts: 0,
    playedMs: 0,          // real ms in sessions
    milestones: {},
    walls: [],
    days: [],
    sessions: 0,
    sessionsNoSpend: 0,
    offline: { reports: 0, full: 0, timeCapped: 0, gold: 0, uncapped: 0 },
    grog: {
      regen: 0, wasted: 0, spent: 0, refunded: 0, firstClear: 0, galleon: 0, coral: 0,
    },
    pearls: { earned: 0, spent: 0 },
    meals: { battles: 0, withMeal: 0, cooked: {}, eaten: {} },
    merchants: { seen: 0, tapped: 0 },
    ads: { speed4x: 0, auto: 0, ms: 0 },   // ads watched (fractional: battles' shares) and their time
    expeditions: { sent: 0, byDuration: {}, byDest: {} },
    fishing: { casts: 0, landed: 0 },
    ff: { skipped: { abyss: 0, uncharted: 0 }, played: { islands: 0, hunts: 0, abyss: 0, uncharted: 0 } },
    awakenings: [],
  };

  // --- Book-keeping ---

  let source = 'battle';
  const withSource = (s, fn) => {
    const before = source;
    source = s;
    try { return fn(); } finally { source = before; }
  };
  let today = null;
  const dayOf = (t = now) => Math.floor((t - START) / DAY);
  const ensureDay = () => {
    const d = dayOf();
    while (J.days.length <= d) {
      J.days.push({
        day: J.days.length,
        gold: { battle: 0, offline: 0, merchant: 0, expedition: 0 },
        modeMs: { islands: 0, hunts: 0, abyss: 0, uncharted: 0 },
        battles: 0,
        sessions: 0,
        noSpend: 0,
        events: { crew: 0, stars: 0, parts: 0, awaken: 0 },
      });
    }
    today = J.days[d];
    return today;
  };
  ensureDay();
  // The session under way's own totals (J.sessionLog).
  const newTotals = () => ({
    gold: { battle: 0, offline: 0, merchant: 0, expedition: 0 },
    modeMs: { islands: 0, hunts: 0, abyss: 0, uncharted: 0 },
    events: { crew: 0, stars: 0, parts: 0, awaken: 0 },
  });
  let sess = newTotals();
  J.sessionLog = [];
  const tally = (field, key, n = 1) => {
    ensureDay()[field][key] += n;
    sess[field][key] += n;
  };

  let waveGold = 0;      // battle gold this battle (kills, clear)
  const merchants = new MerchantClock(p, off.has('merchants') ? 0 : P.tap, J, withSource);
  const earnGold = p.earnGold.bind(p);
  p.earnGold = (n) => {
    tally('gold', source, n);
    if (source === 'battle') {
      waveGold += n;
      merchants.noteGold(n);
    }
    return earnGold(n);
  };
  // Pearls spent on chests, and what the pulls bring.
  for (const name of ['openPack', 'openBulk']) {
    const open = p[name].bind(p);
    p[name] = (...args) => {
      const before = p.pearls;
      const r = open(...args);
      if (r) J.pearls.spent += before - p.pearls;
      for (const pull of [r].flat().filter(Boolean)) {
        tally('events', pull.isNew ? 'crew' : 'stars');
      }
      return r;
    };
  }
  // Pearls earned: what's held, less the start, plus what chests took.
  const startPearls = p.pearls;
  const notePearls = () => { J.pearls.earned = p.pearls - startPearls + J.pearls.spent; };

  // What the ship has got: for walls' "what got it past" and dead time.
  const counters = () => ({
    levels: Object.values(p.heroLevels).reduce((s, n) => s + n, 0) + p.hullHpLevel + p.decks,
    stars: p.owned.length + Object.values(p.heroStars).reduce((s, n) => s + n, 0) + Object.values(p.heroBonus).reduce((s, n) => s + n, 0),
    parts: Object.values(p.parts).reduce((s, n) => s + n, 0),
    awaken: p.awakened.length,
    meal: p.meal?.id ?? null,
  });
  const crewLine = () => p.activeHeroes.map(({ id }) => `${shortName(id)} ${p.heroLevel(id)}${p.isAwakened(id) ? 'A' : ''}`).join(', ')
    + `; hull ${p.hullHpLevel}; parts ${Object.entries(p.equippedLevels).map(([id, l]) => `${id.split('_')[0]} ${l}`).join(' ') || '-'}`;
  const power = () => p.ownedHeroes.map((id) => sheetDps(p, id)).sort((a, b) => b - a).slice(0, p.slotCount).reduce((s, n) => s + n, 0);

  const playedHours = () => J.playedMs / HOUR;
  const mark = (name) => {
    if (J.milestones[name]) return;
    J.milestones[name] = { day: (now - START) / DAY, hours: playedHours(), attempts: J.attempts };
  };
  const seaBoss = (s) => SEAS[s].stages[SEAS[s].stages.length - 1];
  const allHeroes = Object.keys(HEROES);
  const checkMilestones = () => {
    for (const d of ISLANDS) if (p.isIslandCleared(d.id)) mark(`${d.name} cleared`);
    if (p.abyssUnlocked) mark('The Abyss opened');
    for (const depth of [25, 50, 100]) if (p.abyss.best >= depth) mark(`Abyss depth ${depth}`);
    SEAS.forEach((sea, s) => { if (bestCrown(p.uncharted, seaBoss(s)) >= 1) mark(`${seaBoss(s).id} beaten`); });
    if (p.awakened.length >= 1) mark('First awakening');
    if (p.awakened.length >= 4) mark('4 awakened');
    if (allHeroes.every((id) => p.isAwakened(id))) mark('All awakened');
    for (const r of UNCHARTED.crewRewards) if (p.owned.includes(r.hero)) mark(`Earned: ${HEROES[r.hero].name}`);
    if (allHeroes.every((id) => p.owned.includes(id))) mark('Full roster');
  };
  const done = () => bestCrown(p.uncharted, stageOfId(UNCHARTED.finalStage)) >= 1;
  const stop = () => !playOn && done();

  // --- Walls (stuck more than a day on one wave, or one stage at a crown) ---

  const tries = new Map();   // key -> { first, attempts, lastLoss (counters), hull, startCrew, losses }
  const noteTry = (key, won, hull, how = null) => {
    let t = tries.get(key);
    if (!t) {
      t = { first: now, attempts: 0, losses: 0, hull: {}, startCrew: crewLine(), lastLoss: null };
      tries.set(key, t);
    }
    t.attempts++;
    if (!won) {
      t.losses++;
      for (const [k, n] of Object.entries(hull)) t.hull[k] = (t.hull[k] ?? 0) + n;
      t.lastLoss = counters();
      return;
    }
    if (now - t.first > DAY) {
      const c = counters();
      const was = t.lastLoss ?? c;
      const past = [];
      if (c.levels > was.levels) past.push(`upgrades (+${c.levels - was.levels} levels)`);
      if (c.stars > was.stars) past.push(`chest pulls (+${c.stars - was.stars})`);
      if (c.parts > was.parts) past.push(`parts (+${c.parts - was.parts})`);
      if (c.awaken > was.awaken) past.push('an awakening');
      if (c.meal && c.meal !== was.meal) past.push(`a meal (${c.meal})`);
      if (how) past.unshift(how);
      J.walls.push({
        key, from: (t.first - START) / DAY, days: (now - t.first) / DAY, attempts: t.attempts, losses: t.losses,
        hull: topHull(t.hull), startCrew: t.startCrew, endCrew: crewLine(), past: past.length ? past : ['luck (nothing changed)'],
      });
    }
    tries.delete(key);
  };

  // --- Spending ---

  let bought = 0;   // purchases this session
  const purchaseCount = () => {
    const c = counters();
    return c.levels + c.parts + c.awaken + J.pearls.spent;
  };
  function craftParts() {
    for (let changed = true; changed;) {
      changed = false;
      for (const slot of PART_DATA.slots) {
        const on = p.equippedPart(slot);
        const id = on ?? slotParts(slot).find((part) => p.canAffordPart(part.id))?.id;
        if (id && p.canAffordPart(id) && p.upgradePart(id)) {
          tally('events', 'parts');
          changed = true;
        }
      }
    }
  }
  function awakenAll() {
    for (const id of [...p.owned].sort((a, b) => sheetDps(p, b) - sheetDps(p, a))) {
      if (p.awaken(id)) {
        tally('events', 'awaken');
        J.awakenings.push({ id, day: (now - START) / DAY });
      }
    }
  }
  // The crew on the ship outside a stage: uncharted.mjs's Muster with no
  // rules (the greedy bot's crew, with an earned crewmate in for the
  // weakest attacker when it would hit harder at the deck's level).
  function arrange() {
    muster(p, p.wave >= 8 || p.abyssUnlocked);
    earnedOnDeck();
  }
  function earnedOnDeck() {
    const deck = p.activeHeroes.map(({ id }) => id);
    const attackers = deck.filter((id) => !HEROES[id].aura);
    if (!attackers.length) return;
    const weakest = pick(attackers, (id) => -p.heroDamage(id));
    const level = p.heroLevel(weakest);
    const bench = p.ownedHeroes.filter((id) => HEROES[id].earned && !deck.includes(id) && !p.isAway(id) && p.mayMuster(id));
    const best = pick(bench, (id) => p.heroDamage(id, Math.max(level, p.heroLevel(id))));
    if (!best || p.heroDamage(best, Math.max(level, p.heroLevel(best))) <= p.heroDamage(weakest)) return;
    // Only with the gold to bring it up to the deck's level, which it's
    // given (the greedy bot levels the crew on deck, never the bench).
    let cost = 0;
    for (let l = p.heroLevel(best); l < level; l++) cost += p.heroLevelCost(best, l);
    if (cost > p.gold) return;
    while (p.heroLevel(best) < level && p.levelHero(best));
    p.slots[p.slots.indexOf(weakest)] = best;
  }
  function spend() {
    const before = purchaseCount();
    if (!off.has('parts')) craftParts();
    between(p, true);
    awakenAll();
    arrange();
    bought += purchaseCount() - before;
  }

  // --- 3. Expeditions ---

  const FOCUS_RANK = { chest: 4, pearls: 3, mixed: 2, gold: 1 };
  function sendExpeditions(untilNext) {
    const dests = Expeditions.EXPEDITION_DATA.destinations.filter((d) => Expeditions.isDestinationOpen(p, d));
    const duration = [...EXPEDITIONS.durations].sort((a, b) => b.ms - a.ms).find((d) => d.ms <= untilNext);
    if (!duration) return;
    for (let slot = 0; slot < Expeditions.slotCount(p); slot++) {
      if (p.expeditions[slot]) continue;
      const idle = p.ownedHeroes.filter((id) => p.slotOf(id) < 0 && !p.isAway(id));
      if (!idle.length) return;
      const busy = new Set(p.expeditions.filter(Boolean).map((e) => e.dest));
      // Coral Shallows brings Grog once the Uncharted Seas are open.
      const rank = (d) => (d.id === FISHING.expedition.dest && p.unchartedUnlocked ? 3.5 : FOCUS_RANK[d.rewardFocus] ?? 0);
      const dest = pick(dests.filter((d) => !busy.has(d.id)), (d) => rank(d) * 10
        + idle.filter((id) => Expeditions.traitOf(id) === d.favouredTrait).length);
      if (!dest) return;
      const party = [...idle].sort((a, b) => (Expeditions.traitOf(b) === dest.favouredTrait) - (Expeditions.traitOf(a) === dest.favouredTrait)
        || p.heroStarCount(b) - p.heroStarCount(a)).slice(0, EXPEDITIONS.maxParty);
      if (Expeditions.send(p, slot, dest.id, party, duration.id, { now })) {
        J.expeditions.sent++;
        J.expeditions.byDuration[duration.id] = (J.expeditions.byDuration[duration.id] ?? 0) + 1;
        J.expeditions.byDest[dest.id] = (J.expeditions.byDest[dest.id] ?? 0) + 1;
      }
    }
  }

  // --- 4. The Galley ---

  const spot = () => (p.abyssUnlocked ? 'abyss' : p.islandId);
  function galley() {
    let casts = 0;
    while (p.useBait(now)) {
      casts++;
      J.fishing.casts++;
      const fish = rollFish(spot(), rollRarity());
      if (Math.random() < landChance(fishRarity(fish))) {
        p.catchFish(fish);
        J.fishing.landed++;
      }
    }
    eatBest();
    return casts * OVERHEAD.cast;
  }
  // Take out what has finished cooking, keep the pots busy with the best
  // meal that can be made, and eat the best one in the Pantry if none is on.
  function eatBest() {
    p.collectReady(now);
    const where = p.abyssUnlocked ? 'abyss' : p.islandId;
    const meals = Object.keys(MEALS.list).filter((m) => mealScore(m, where) > 0);
    while (p.freePot >= 0) {
      const id = pick(meals.filter((m) => p.canCook(m)), (m) => mealScore(m, where));
      if (!id || !p.cook(id, now)) break;
      J.meals.cooked[id] = (J.meals.cooked[id] ?? 0) + 1;
    }
    if (p.meal) return;
    const id = pick(meals.filter((m) => p.pantryCount(m) > 0), (m) => mealScore(m, where));
    if (id && p.eat(id)) J.meals.eaten[id] = (J.meals.eaten[id] ?? 0) + 1;
  }

  // --- 6. Battles ---

  const ffBook = new Map();   // key -> { wins: [{ sig, time, kills, hull }], skips }
  let kills = [];
  scene.events.on('enemy-killed', (e) => kills.push({ key: e.key, gold: e.gold, def: e.def }));
  let hull = {};
  scene.stats = {
    hullHit: (e, n) => { const k = e.key ?? e.boss?.key ?? e.def?.name; hull[k] = (hull[k] ?? 0) + n; },
    dealt() {}, add() {}, kill() {}, abilityUsed() {},
  };

  // Each slot's damage and attack speed, max hull and the parts on.
  const signature = () => {
    const buffs = p.deckBuffs;
    return {
      crew: p.activeHeroes.map(({ id, slot }) => `${slot}:${id}`).join(','),
      slots: p.activeHeroes.map(({ id, slot }) => [p.heroDamage(id) * buffs[slot].damage * buffs[slot].bossDamage, buffs[slot].attackSpeed]),
      hull: p.hullMaxHp,
      parts: { ...p.equippedLevels },
    };
  };
  const atLeast = (cur, old) => cur.crew === old.crew && cur.hull >= old.hull
    && cur.slots.every(([d, s], i) => d >= old.slots[i][0] * 0.9999 && s >= old.slots[i][1] * 0.9999)
    && Object.entries(old.parts).every(([id, l]) => (cur.parts[id] ?? 0) >= l);
  const canSkip = (key) => {
    if (!ff) return null;
    const book = ffBook.get(key);
    if (!book || book.wins.length < FF_STREAK) return null;
    const sig = signature();
    if (!book.wins.every((w) => atLeast(sig, w.sig))) return null;
    if (++book.skips % FF_RECHECK === 0) return null;
    return book;
  };
  const noteFf = (key, won, time) => {
    if (!won) {
      ffBook.delete(key);
      return;
    }
    const book = ffBook.get(key) ?? { wins: [], skips: 0 };
    book.wins.push({ sig: signature(), time, kills: [...kills] });
    if (book.wins.length > FF_STREAK) book.wins.shift();
    ffBook.set(key, book);
  };
  // A skipped win: its kills paid again (as payKills does).
  const replayKills = (list) => {
    for (const k of list) scene.events.emit('enemy-killed', { key: k.key, gold: k.gold, def: k.def });
  };

  // One battle of a kind, played (or skipped): { won, time (game ms) }.
  // fn plays it; win() pays a skipped win.
  function fight(kind, key, fn, { skippable = false, win = null } = {}) {
    if (p.meal) J.meals.withMeal++;
    J.meals.battles++;
    J.attempts++;
    ensureDay().battles++;
    waveGold = 0;
    kills = [];
    hull = {};
    const book = skippable ? canSkip(key) : null;
    let result;
    if (book) {
      J.ff.skipped[kind]++;
      const last = book.wins[book.wins.length - 1];
      const time = book.wins.reduce((s, w) => s + w.time, 0) / book.wins.length;
      replayKills(last.kills);
      merchants.advance(kind, time);
      win();
      result = { won: true, time, skipped: true };
    } else {
      J.ff.played[kind]++;
      let last = 0;
      result = fn((t) => {
        merchants.tick(kind, t - last, scene);
        last = t;
      });
      if (skippable) noteFf(key, result.won, result.time);
    }
    const ms = battleMs(result.time, kind) + (kind === 'uncharted' ? OVERHEAD.stage : OVERHEAD.battle);
    tally('modeMs', kind, ms);
    advance(ms);
    return { ...result, hull: { ...hull } };
  }
  // A battle's real time (game time at the profile's speeds; see PROFILES),
  // and the ads it costs: x4's pass re-watched every ADS.passes.speed4x.waves
  // battles at x4, Auto's every ADS.passes.auto.waves once it isn't free (an
  // Uncharted stage counts ADS.stageWaves).
  function battleMs(time, kind) {
    if (oldSpeeds) return time / OLD_SPEEDS[profileId];
    const fast = ADS.passes.speed4x.speed;
    const units = kind === 'uncharted' ? ADS.stageWaves : 1;
    const speed4x = units * P.x4 / ADS.passes.speed4x.waves;
    const auto = p.autoFree ? 0 : units / ADS.passes.auto.waves;
    J.ads.speed4x += speed4x;
    J.ads.auto += auto;
    J.ads.ms += AD_MS * (speed4x + auto);
    return time * (P.x4 / fast + (1 - P.x4) / P.speed) + AD_MS * (speed4x + auto);
  }
  const advance = (ms) => {
    now += ms;
    J.playedMs += ms;
    ensureDay();
  };

  // Islands: a wave (or the wall again).
  const lossStreak = { key: null, n: 0 };
  let stuck = false;
  const huntsLost = new Set();
  function islandBattle() {
    if (stuck && huntBattle()) return;
    const island = p.islandId;
    const { wave } = p;
    const key = `${island}:${wave}`;
    const r = fight('islands', key, (onStep) => playWave(scene, p, onStep));
    // As GameScene.endWave: the gold per minute (expeditions) and the idle
    // rate (offline earnings).
    p.logGold(waveGold, r.time);
    if (r.won) p.noteIdleRate(merchants.goldPerSecond);
    noteTry(islandTag(island, wave), r.won, r.hull);
    if (r.won) lossStreak.n = 0;
    else {
      lossStreak.n = lossStreak.key === key ? lossStreak.n + 1 : 1;
      lossStreak.key = key;
      if (lossStreak.n >= STUCK_LOSSES) {
        stuck = true;
        lossStreak.n = 0;
      }
    }
    if (r.won && p.isIslandCleared(island)) {
      const next = ISLANDS[ISLANDS.indexOf(p.island) + 1];
      if (next && p.sailTo(next.id)) {
        merchants.reset();
        stuck = false;
      }
    }
  }
  function huntBattle() {
    const boss = p.huntableBosses(p.islandId).map((h) => h.boss)
      .find((b) => p.defeatCount(b) > 0 && p.huntDoublesLeft(b, now) > 0 && !huntsLost.has(b));
    if (!boss) return false;
    const r = fight('hunts', `hunt:${boss}`, (onStep) => playWave(scene, p, onStep, { hunt: boss }));
    if (!r.won) huntsLost.add(boss);
    return true;
  }

  // The Abyss: a depth of the dive under way (one starts from the deepest
  // checkpoint).
  function abyssBattle() {
    if (!p.inAbyss) {
      const from = p.abyssCheckpoints.at(-1);
      p.startDive(from, newSeed());
      merchants.reset();
      spend();
    }
    const { depth } = p;
    const r = fight('abyss', `depth:${depth}`, (onStep) => playWave(scene, p, onStep), {
      skippable: true, win: () => p.winDepth(),
    });
    p.logGold(waveGold, r.time);
    if (r.won) p.noteIdleRate(merchants.goldPerSecond);
    else {
      J.abyssEnds = J.abyssEnds ?? {};
      for (const [k, n] of Object.entries(r.hull)) J.abyssEnds[k] = (J.abyssEnds[k] ?? 0) + n;
      p.endDive();
      merchants.reset();
      advance(OVERHEAD.diveEnd);
    }
  }

  // The Uncharted Seas.
  const stageLosses = new Map();   // `${id}@${crown}` -> { n, power }
  const stageHistory = new Map();  // `${id}@${crown}` -> { wins, tries }
  const flyerCache = new Map();
  const blocked = (key) => {
    const l = stageLosses.get(key);
    return !!l && l.n >= BLOCK_LOSSES && power() < l.power * BLOCK_POWER;
  };
  const winRate = (key) => {
    const h = stageHistory.get(key) ?? { wins: 0, tries: 0 };
    return (h.wins + 1) / (h.tries + 2);
  };
  // The next stage to sail ({ stage, crown } or null), see the top.
  function nextStage() {
    const rec = p.uncharted;
    const open = [];
    for (const stage of STAGES) {
      for (let crown = 1; crown <= 3; crown++) {
        if (bestCrown(rec, stage) < crown && isStageOpen(rec, stage, crown, p.abyss.best) && !blocked(`${stage.id}@${crown}`)) {
          open.push({ stage, crown });
        }
      }
    }
    open.sort((a, b) => a.stage.sea - b.stage.sea || a.crown - b.crown || a.stage.index - b.stage.index);
    if (open.length) return open[0];
    return farmStage();
  }
  // The crewmate an awakening adds the most DPS to (not yet awake, its items
  // not all held), and what it still needs.
  function awakenTarget() {
    const ids = p.ownedHeroes.filter((id) => !p.isAwakened(id));
    const need = (id) => Object.entries(awakenCost(id)).filter(([c, n]) => p.itemCount(c) < n).map(([c]) => c);
    const id = pick(ids.filter((h) => need(h).length), (h) => sheetDps(p, h));
    return id ? { id, need: need(id) } : null;
  }
  function farmStage() {
    const target = awakenTarget();
    if (!target) return null;
    J.farmTarget = target.id;
    const won = (stage) => [3, 2, 1].filter((c) => bestCrown(p.uncharted, stage) >= c);
    const options = [];
    for (const stage of STAGES) {
      for (const crown of won(stage)) {
        const key = `${stage.id}@${crown}`;
        if (blocked(key)) continue;
        const rate = winRate(key) / stageCost(stage, crown);
        const d = UNCHARTED.drops;
        let value = 0;
        if (isBossStage(stage)) {
          if (target.need.includes('heart')) value += 10 * d.heart[crown - 1];
          value += d.bossGlass * target.need.filter((c) => c !== 'heart').length / UNCHARTED.colours.length;
        } else {
          value += stage.drops.filter((c) => target.need.includes(c)).length * d.crownMult[crown - 1] * (crown >= 3 ? 1 : d.chance);
        }
        if (value > 0) options.push({ stage, crown, score: value * rate });
      }
    }
    return pick(options, (o) => o.score);
  }
  function stageBattle(stage, crown) {
    const key = `${stage.id}@${crown}`;
    if (!flyerCache.has(key)) flyerCache.set(key, stagePlan(stage, crown).some((e) => e.def.flies));
    p.musterStage(stage, crown);
    muster(p, flyerCache.get(key));
    earnedOnDeck();
    const cost = p.beginStage(now);
    if (cost == null) {
      p.endStage();
      return false;
    }
    J.grog.spent += cost;
    let won = false;
    const r = fight('uncharted', key, (onStep) => playWave(scene, p, onStep), {
      skippable: true, win: () => { J.grog.firstClear += p.winStage().refund; },
    });
    if (r.won) {
      if (!r.skipped) J.grog.firstClear += p.winStage().refund;
      won = true;
    } else {
      J.grog.refunded += p.loseStage();
    }
    p.endStage();
    const h = stageHistory.get(key) ?? { wins: 0, tries: 0 };
    h.tries++;
    if (won) h.wins++;
    stageHistory.set(key, h);
    if (won) stageLosses.delete(key);
    else {
      const l = stageLosses.get(key) ?? { n: 0, power: 0 };
      l.n++;
      if (l.n >= BLOCK_LOSSES) l.power = power();
      stageLosses.set(key, l);
    }
    noteTry(`U${key}`, won, r.hull);
    // A win at a crown also clears the stage's lower crowns (crowns above 1
    // open sea-wide, so a crown can be passed by winning a higher one).
    if (won) {
      for (let c = 1; c < crown; c++) {
        if (tries.has(`U${stage.id}@${c}`)) noteTry(`U${stage.id}@${c}`, true, {}, `won at ${crown} crowns`);
      }
    }
    return true;
  }

  // --- A session ---

  function session(start, end, untilNext) {
    now = start;
    sess = newTotals();
    ensureDay().sessions++;
    J.sessions++;
    bought = 0;
    stuck = false;
    huntsLost.clear();
    merchants.reset();
    // Grog that came back while away, and how much the cap threw away.
    // (At the cap the clock waits from the last look, so all of that time's
    // Grog is lost.)
    if (p.unchartedUnlocked) {
      const rec = p.uncharted;
      const would = Math.floor((now - rec.grogAt) / UNCHARTED.grog.regenMs);
      const before = rec.grog;
      p.tickGrog(now);
      J.grog.regen += rec.grog - before;
      J.grog.wasted += Math.max(0, would - (rec.grog - before));
    }
    // 1. Collect. (uncapped: what the time cap alone would have paid.)
    const uncapped = Offline.awayEarnings({ idleRate: p.idleRate, lastSeen: p.lastSeen, now }).gold;
    const report = Offline.comeBack(p, now);
    if (report?.gold) {
      J.offline.reports++;
      J.offline.gold += report.gold;
      J.offline.uncapped += uncapped;
      if (report.full) J.offline.full++;
      if (report.capped) J.offline.timeCapped++;
      if (!off.has('offline')) withSource('offline', () => Offline.collect(p, report));
    }
    p.expeditions.forEach((e, slot) => {
      if (!Expeditions.isReturned(e)) return;
      if (e.loot.grog) J.grog.coral += e.loot.grog;
      withSource('expedition', () => Expeditions.collect(p, slot));
    });
    advance(OVERHEAD.session);
    // 2. Spend.
    spend();
    // 3. Expeditions.
    if (!off.has('expeditions')) sendExpeditions(untilNext);
    // 4. The Galley.
    if (!off.has('galley')) advance(galley());
    // 5 and 6. Battle.
    let grogFirst = true;
    while (now < end && !stop()) {
      if (!p.abyssUnlocked) islandBattle();
      else {
        const next = p.unchartedUnlocked ? nextStage() : null;
        const sail = next && p.canSailStage(next.stage, next.crown, now) && (grogFirst || !p.inAbyss);
        if (sail) {
          if (p.inAbyss) p.endDive();
          if (!stageBattle(next.stage, next.crown)) grogFirst = false;
        } else {
          grogFirst = false;
          abyssBattle();
        }
      }
      spend();
      eatBest();
      checkMilestones();
    }
    p.lastSeen = now;
    notePearls();
    if (!bought) {
      J.sessionsNoSpend++;
      ensureDay().noSpend++;
    }
    snapshotDay();
    J.sessionLog.push({
      day: dayOf(start), hour: (start - START) / HOUR % 24, ...sess, progress: J.days[dayOf()].progress, bought,
    });
  }

  // The day's furthest progress (the last session's).
  function snapshotDay() {
    const d = ensureDay();
    const furthest = pick(ISLANDS.filter((i) => p.islands[i.id]), (i) => i.waveOffset + (p.islands[i.id].best ?? 0));
    d.progress = {
      island: islandTag(furthest.id, p.islands[furthest.id].best),
      islandScale: furthest.waveOffset + p.islands[furthest.id].best,
      abyss: p.abyss.best,
      crowns: Object.values(p.uncharted.crowns).reduce((s, n) => s + n, 0),
      frontier: frontier(),
      awakened: p.awakened.length,
      owned: p.owned.length,
      crew: crewLine(),
    };
  }
  const frontier = () => {
    const won = STAGES.filter((s) => bestCrown(p.uncharted, s) >= 1);
    return won.length ? won[won.length - 1].id : '-';
  };

  // --- The days ---

  const starts = P.sessions.map((h) => h * HOUR);
  for (let day = 0; day < days && !stop(); day++) {
    starts.forEach((at, i) => {
      if (stop()) return;
      const start = START + day * DAY + at;
      const nextStart = i + 1 < starts.length ? START + day * DAY + starts[i + 1] : START + (day + 1) * DAY + starts[0];
      session(start, start + P.minutes * 60e3, nextStart - start);
    });
  }
  checkMilestones();
  // Walls still open when the run stopped.
  for (const [key, t] of tries) {
    if (now - t.first > DAY) {
      J.walls.push({
        key, from: (t.first - START) / DAY, days: (now - t.first) / DAY, attempts: t.attempts, losses: t.losses,
        hull: topHull(t.hull), startCrew: t.startCrew, endCrew: crewLine(), past: ['(still stuck when the run stopped)'], open: true,
      });
    }
  }
  J.finished = done();
  J.playOn = playOn;
  J.endDay = (now - START) / DAY;
  J.stoppedAt = J.finished && !playOn ? '6-6 beaten' : stopLine();
  J.final = { crew: crewLine(), owned: p.owned.length, awakened: p.awakened.map(shortName), abyssBest: p.abyss.best, frontier: frontier() };
  J.wallSec = Number(process.hrtime.bigint() - t0) / 1e9;
  return J;

  function stopLine() {
    if (!p.abyssUnlocked) return `islands ${islandTag(p.islandId, p.wave)}`;
    return `Uncharted frontier ${frontier()}, Abyss best ${p.abyss.best}, ${p.awakened.length} awakened`;
  }
}

const stageOfId = (id) => STAGES.find((s) => s.id === id);
function topHull(hull, n = 4) {
  const total = Object.values(hull).reduce((s, v) => s + v, 0) || 1;
  return Object.entries(hull).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => `${ENEMIES[k]?.name ?? k} ${Math.round(100 * v / total)}%`).join(', ') || '-';
}

// --- Merchants ---

// Merchants.js's timing and plunder without the ship on screen: the
// battle's clock (game time of island waves and dives, not hunts or
// stages) brings one MERCHANTS.firstAt after a battlefield opens and every
// MERCHANTS.every after, never while a boss is alive. It's tapped at once
// (or not, at the profile's rate), paying rollPlunder's plunder at G =
// goldSeconds of the last goldWindowMs's income (at least floorKills of the
// basic enemy). goldPerSecond is also the idle rate's sample, as in the game.
class MerchantClock {
  constructor(progress, tap, J, withSource) {
    Object.assign(this, { progress, tap, J, withSource });
    this.reset();
  }

  reset() {
    this.clock = 0;
    this.due = span(MERCHANTS.firstAt);
    this.income = [];
    this.killGold = 0;
  }

  noteGold(gold) {
    if (gold > 0) this.income.push({ at: this.clock, gold });
  }

  get goldPerSecond() {
    const window = Math.max(1000, Math.min(MERCHANTS.goldWindowMs, this.clock));
    return this.income.reduce((s, i) => s + i.gold, 0) / (window / 1000);
  }

  tick(kind, dt, scene) {
    if (kind !== 'islands' && kind !== 'abyss') return;
    this.clock += dt;
    const from = this.clock - MERCHANTS.goldWindowMs;
    while (this.income.length && this.income[0].at < from) this.income.shift();
    const p = this.progress;
    if (scene) this.killGold = (ENEMIES[p.basicEnemy]?.gold ?? 0) * (scene.waves.scaling?.gold ?? 1) * p.goldMult;
    if (this.clock < this.due || scene?.enemies.some((e) => e.alive && e.def.boss)) return;
    this.due = this.clock + span(MERCHANTS.every);
    const id = rollMerchant();
    this.J.merchants.seen++;
    if (Math.random() >= this.tap) return;
    this.J.merchants.tapped++;
    const G = Math.max(MERCHANTS.goldSeconds * this.goldPerSecond, MERCHANTS.floorKills * this.killGold);
    const reward = rollPlunder(p, id, G);
    if (reward.grog) this.J.grog.galleon += reward.grog;
    this.withSource('merchant', () => p.plunder(reward));
  }

  // A skipped battle's time (no boss holds a ship up).
  advance(kind, ms) {
    for (let t = 0; t < ms; t += 1000) this.tick(kind, Math.min(1000, ms - t), null);
  }
}
const span = ([min, max]) => min + Math.random() * (max - min);

// --- Fishing ---

// A fish's rarity (fishing.json), and the chance to land one: REEL_SKILL x
// its zone per press, `hits` presses in before `strikes` misses.
const FISH = Object.fromEntries(readJson('fishing/fishing.json').fish.order.map((f) => [f.id, f.rarity]));
const fishRarity = (id) => FISH[id] ?? 'common';
function landChance(rarity) {
  const spec = FISHING.rarities[rarity] ?? FISHING.rarities.common;
  const hits = rarity === 'legendary' ? FISHING.reel.legendaryHits : FISHING.reel.hits;
  const q = Math.min(REEL_MAX, REEL_SKILL * spec.zone);
  // P(hits successes before `strikes` failures).
  let total = 0;
  for (let k = 0; k < FISHING.reel.strikes; k++) total += choose(hits - 1 + k, k) * q ** hits * (1 - q) ** k;
  return total;
}
const choose = (n, k) => (k === 0 ? 1 : (n * choose(n - 1, k - 1)) / k);

// How much a meal helps where the ship is fighting (an island id or the
// Abyss/Uncharted): crew damage and speed in full, the rest by how often it
// matters there.
function mealScore(id, where) {
  const m = MEALS.list[id];
  let s = (m.damage ?? 0) + (m.attackSpeed ?? 0) + 0.25 * (m.bossDamage ?? 0) + 0.5 * (m.hull ?? 0)
    + 5 * (m.heal ?? 0) + 0.3 * (m.gold ?? 0);
  if (where === 'abyss') s += -0.6 * (m.abyssGrowth ?? 0) - 0.1 * (m.freeze ?? 0) - 0.1 * (m.charm ?? 0) - 0.1 * (m.lavaDamage ?? 0);
  if (where === 'ember_isle') s += -0.3 * (m.lavaDamage ?? 0);
  if (where === 'frostbite_reef') s += -0.3 * (m.freeze ?? 0);
  if (where === 'fogbound_isle') s += -0.15 * ((m.charm ?? 0) + (m.fog ?? 0));
  return s;
}

// --- Main: run the profiles and seeds, and report ---

const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain && process.argv[2] === '--child') {
  const [, , , profile, seed, days, ff, playOn, speeds] = process.argv;
  const J = journey(profile, Number(seed), {
    days: Number(days), ff: ff === '1', playOn: playOn === '1', oldSpeeds: speeds === 'old',
  });
  process.send(J);
} else if (isMain) {
  const args = process.argv.slice(2);
  const flag = (name) => args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
  const plain = args.filter((a) => !a.includes('=') && a !== 'noff' && a !== 'playon');
  const profiles = !plain[0] || plain[0] === 'all' ? Object.keys(PROFILES) : plain[0].split(',');
  for (const id of profiles) if (!PROFILES[id]) throw new Error(`Unknown profile: ${id}`);
  const seeds = (plain[1] ?? '5').includes(',') ? plain[1].split(',').map(Number)
    : Array.from({ length: Number(plain[1] ?? 5) }, (_, i) => 1000 + i);
  const days = Number(flag('days') ?? 120);
  const ff = !args.includes('noff');
  const playOn = args.includes('playon');
  const speeds = flag('speeds') ?? 'new';
  const jobs = Number(flag('jobs') ?? Math.max(1, cpus().length - 1));
  const queue = profiles.flatMap((profile) => seeds.map((seed) => ({ profile, seed })));
  const results = [];
  const t0 = process.hrtime.bigint();
  const self = fileURLToPath(import.meta.url);
  await new Promise((resolve) => {
    let running = 0;
    const next = () => {
      if (!queue.length && !running) return resolve();
      while (running < jobs && queue.length) {
        const job = queue.shift();
        running++;
        const child = fork(self, ['--child', job.profile, `${job.seed}`, `${days}`, ff ? '1' : '0', playOn ? '1' : '0', speeds], {
          execArgv: ['--import', new URL('./register.mjs', import.meta.url).href],
        });
        child.on('message', (J) => {
          results.push(J);
          console.error(`${J.profile} ${J.seed}: ${J.stoppedAt} on day ${J.endDay.toFixed(1)} (${Math.round(J.wallSec)}s)`);
        });
        child.on('exit', () => { running--; next(); });
      }
    };
    next();
  });
  const wallSec = Number(process.hrtime.bigint() - t0) / 1e9;
  const { report, svg } = await import('./journey_report.mjs');
  console.log(report(results, {
    wallSec, days, ff, playOn, profiles, seeds, speeds,
  }));
  if (flag('out')) writeFileSync(flag('out'), JSON.stringify(results));
  if (flag('svg')) writeFileSync(flag('svg'), svg(results));
}
