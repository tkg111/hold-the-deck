import {
  ABILITIES, ABYSS, AWAKEN, ENEMIES, HEROES, ISLANDS, UNCHARTED, WAVES,
} from '../config.js';
import { GROUPS, SEAS } from '../data/uncharted.js';
import { abyssIsland, depthClearBonus, depthScaling } from './Abyss.js';
import { traitOf } from './Expeditions.js';
import { seededRandom } from './WaveManager.js';

// The Uncharted Seas (UNCHARTED in config, the stages in data/uncharted.js):
// the rules, as pure functions of a stage, a crown (1-3) and the player's
// record (Progress.uncharted: newRecord's shape), so the game, the sim and
// the tests share them. Crew Awakening's costs and checks are here too.

// --- Stages ---

// Every stage in chart order. Each stage (the data's own object) is given
// its sea's index (0-5) and its own (0-5).
export const STAGES = SEAS.flatMap((sea, s) => sea.stages.map((stage, i) => Object.assign(stage, { sea: s, index: i })));
export const stageOf = (id) => STAGES.find((s) => s.id === id) ?? null;
export const seaOf = (stage) => SEAS[stage.sea];
// A boss stage (a sea's last, with no colours of its own: random glass and a
// Heart); a stage with a mid-boss and colours (Giant's Wake) drops those.
export const isBossStage = (stage) => !!stage.bosses && !stage.drops;
// The sea's strength: the Abyss depth its enemies are as tough as.
export const seaDepth = (sea) => UNCHARTED.depths[sea];

// A small hash of a string (a stage's seed).
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

// The Abyss current a stage on a current sea meets (the same every time),
// or null.
export function stageCurrent(stage) {
  if (!seaOf(stage).current) return null;
  const { ids } = ABYSS.currents;
  return ids[hash(`current:${stage.id}`) % ids.length];
}

// The rules on a stage at a crown: its own at 1 crown, and its extra one
// too at 2 and 3.
export function stageRules(stage, crown) {
  const rules = [stage.rule, crown >= 2 ? stage.extra : null].filter(Boolean);
  return [...new Set(rules)];
}
export const hasRule = (stage, crown, id) => stageRules(stage, crown).includes(id);

// The Hourglass's time to win a stage in (ms).
export const hourglassMs = (stage) => UNCHARTED.rules.hourglass.stages[stage.id] ?? UNCHARTED.rules.hourglass.ms;

// Grog to sail a stage at a crown.
export function stageCost(stage, crown) {
  return UNCHARTED.cost[stage.sea] + UNCHARTED.crownCost[crown - 1];
}
// Grog back after a retreat or a loss.
export const retreatRefund = (cost) => Math.floor(cost * UNCHARTED.retreatRefund);

// --- The record (Progress.uncharted) ---

// A fresh record: Grog (full) and when the next one started coming back,
// the items held, each stage's best crown cleared (missing = none), the
// first clears paid ("1-4:2"), and whether its map spot has been seen.
export function newRecord(now = Date.now()) {
  return {
    grog: UNCHARTED.grog.cap,
    grogAt: now,
    items: Object.fromEntries([...UNCHARTED.colours, 'heart'].map((c) => [c, 0])),
    crowns: {},
    firstClears: [],
    seen: false,
  };
}

// Grog back since it was last checked: one per regenMs of real time (offline
// too) up to the cap; at or over it the clock waits. The clock going
// backwards gives none and takes none away (like Bait).
export function tickGrog(rec, now = Date.now()) {
  const { cap, regenMs } = UNCHARTED.grog;
  if (rec.grog >= cap || now < rec.grogAt) {
    rec.grogAt = rec.grog >= cap ? now : Math.min(rec.grogAt, now);
    return;
  }
  const n = Math.floor((now - rec.grogAt) / regenMs);
  rec.grog = Math.min(cap, rec.grog + n);
  rec.grogAt = rec.grog >= cap ? now : rec.grogAt + n * regenMs;
}

// ms until the next Grog comes back (null at or over the cap).
export function grogTimeLeft(rec, now = Date.now()) {
  tickGrog(rec, now);
  if (rec.grog >= UNCHARTED.grog.cap) return null;
  return Math.max(0, UNCHARTED.grog.regenMs - (now - rec.grogAt));
}

// Spend n Grog (the clock starts if it was full). Returns whether it could.
export function spendGrog(rec, n, now = Date.now()) {
  tickGrog(rec, now);
  if (rec.grog < n) return false;
  if (rec.grog >= UNCHARTED.grog.cap) rec.grogAt = now;
  rec.grog -= n;
  return true;
}

// Grog from a refund, a Treasure Galleon or an expedition (may go over the cap).
export function addGrog(rec, n) {
  if (n > 0) rec.grog += n;
}

export const bestCrown = (rec, stage) => rec.crowns[stage.id] ?? 0;

// A sea opens once the sea before's boss stage is cleared at 1 crown.
export function isSeaOpen(rec, sea) {
  if (sea === 0) return true;
  const prev = SEAS[sea - 1].stages;
  return (rec.crowns[prev[prev.length - 1].id] ?? 0) >= 1;
}

// A crown tab of a sea opens once every stage of it is cleared at the
// crown below.
export function isCrownOpen(rec, sea, crown) {
  if (!isSeaOpen(rec, sea)) return false;
  return crown === 1 || SEAS[sea].stages.every((s) => (rec.crowns[s.id] ?? 0) >= crown - 1);
}

// Stages open in order within a sea, at each crown: the first, then each
// after one cleared at that crown.
export function isStageOpen(rec, stage, crown) {
  if (!isCrownOpen(rec, stage.sea, crown)) return false;
  if (stage.index === 0) return true;
  const prev = SEAS[stage.sea].stages[stage.index - 1];
  return (rec.crowns[prev.id] ?? 0) >= crown;
}

// The best crown cleared on every stage of a sea (0 if any isn't).
export function seaCrown(rec, sea) {
  return Math.min(...SEAS[sea].stages.map((s) => rec.crowns[s.id] ?? 0));
}

// --- A stage's battle ---

// Enemy HP, damage and kill gold multipliers on a stage at a crown: the
// Abyss's at its sea's depth (with its current, if Armoured), x the crown's,
// kill gold x UNCHARTED.goldMult.
export function stageScaling(stage, crown) {
  const current = stageCurrent(stage);
  const s = depthScaling(seaDepth(stage.sea), current ? [current] : []);
  const c = UNCHARTED.crowns[crown - 1];
  return { hp: s.hp * c.hp, damage: s.damage * c.damage, gold: s.gold * UNCHARTED.goldMult };
}

// The gold a win pays on top of kills: UNCHARTED.clearBonus of its depth's
// clear bonuses, x goldMult.
export const stageClearGold = (stage) => Math.round(depthClearBonus(seaDepth(stage.sea)) * UNCHARTED.clearBonus * UNCHARTED.goldMult);

// The battlefield of a stage, island-shaped like Abyss.abyssIsland: its
// sea's island (scenery and weather) without that island's hazards, with
// the stage's own (lava bombs, a blizzard all stage) and, on the Drowned
// Throne, its Abyss current's.
export function stageIsland(stage) {
  const sea = seaOf(stage);
  const current = stageCurrent(stage);
  const base = sea.battlefield === ABYSS.id
    ? abyssIsland(current ? [current] : [])
    : ISLANDS.find((d) => d.id === sea.battlefield);
  const island = {
    id: base.id,
    name: sea.name,
    shortName: sea.name,
    scenery: base.scenery,
    ash: base.ash,
    snow: base.snow,
    mist: base.mist,
    motes: base.motes,
    spawnPuff: base.spawnPuff,
    lavaBombs: base.id === ABYSS.id ? base.lavaBombs : undefined,
    blizzard: base.id === ABYSS.id ? base.blizzard : undefined,
    fogBank: base.id === ABYSS.id ? base.fogBank : undefined,
    waveOffset: 0,
    damageCap: Infinity,
    stage: stage.id,
  };
  const all = { from: 1, every: 1, skipBossWaves: false, at: 1500, ms: Infinity };
  if (stage.hazard === 'lava') {
    island.lavaBombs = ISLANDS.find((d) => d.id === 'ember_isle').lavaBombs;
    island.ash = true;
  }
  if (stage.hazard === 'blizzard') {
    island.blizzard = { ...ISLANDS.find((d) => d.id === 'frostbite_reef').blizzard, ...all };
    island.snow = true;
  }
  return island;
}

// What a stage is fought with: Progress.waveOptions' shape, plus wave (the
// island wave it plays like, for anything that reads one) and stage { id,
// crown, rules, currents }. The abyss field is left out: the stage's own
// scaling and plan are used (see WaveManager).
export function stageOptions(stage, crown) {
  const current = stageCurrent(stage);
  return {
    wave: 1,
    island: stageIsland(stage),
    offset: 0,
    finale: null,
    countFactor: 1,
    stage: {
      id: stage.id, crown, rules: stageRules(stage, crown), currents: current ? [current] : [],
    },
  };
}

// A stage's spawn plan (WaveManager's composeWave shape): wave after wave of
// its lineup's groups, picked by weight until each holds its count (a boss
// wave: UNCHARTED.waves.bossEscort of it, with its bosses entering at the
// Abyss's spawnAt of the wave's groups). The first enemy of each wave after
// the first has gate (that wave's number): it waits until the field is
// clear. Seeded by the stage and crown, so a retry meets the same line-up.
// Swarm doubles the count at half HP; Elite Hunt makes every n-th enemy
// (not bosses) an Abyss Elite. Bosses carry their stage's UNCHARTED.bosses
// factors. Everyone's HP and damage carry the crown's factors through the
// stage's scaling (stageScaling), not here.
export function stagePlan(stage, crown) {
  const random = seededRandom(hash(`plan:${stage.id}:${crown}`));
  const { size, perWave, bossEscort } = UNCHARTED.waves;
  const rules = stageRules(stage, crown);
  const swarm = rules.includes('swarm') ? UNCHARTED.rules.swarm : null;
  const eliteEvery = rules.includes('elite_hunt') ? UNCHARTED.rules.elite_hunt.every : 0;
  const boss = { hp: 1, damage: 1, ...UNCHARTED.bosses[stage.id] };
  const types = stage.lineup.map((key) => ({ key, ...GROUPS[key] }));
  const totalWeight = types.reduce((s, t) => s + t.weight, 0);
  const interval = WAVES.minSpawnInterval;
  const plan = [];
  let foes = 0;
  for (let w = 0; w < stage.waves; w++) {
    const bosses = stage.bosses?.[w] ?? [];
    let count = size + perWave * w;
    if (bosses.length) count *= bossEscort;
    if (swarm) count *= swarm.count;
    const groups = [];
    const used = new Set();
    let filled = 0;
    while (filled < count) {
      let roll = random() * totalWeight;
      let t = types.find((g) => (roll -= g.weight) < 0) ?? types[types.length - 1];
      // A once-a-wave group already in: the next type that isn't.
      if (t.once && used.has(t.key)) t = types.find((g) => !g.once) ?? null;
      if (!t) break;
      used.add(t.key);
      const members = t.pack
        ? Array(t.pack[0] + Math.floor(random() * (t.pack[1] - t.pack[0] + 1))).fill(t.members[0])
        : t.members;
      groups.push({ members, escort: !!t.escort });
      filled += t.pack ? members.length : t.size ?? members.length;
    }
    const spawnAt = ABYSS.bosses.spawnAt;
    bosses.forEach((key, i) => {
      groups.splice(Math.round(groups.length * spawnAt[Math.min(i, spawnAt.length - 1)]), 0, { members: [key] });
    });
    groups.forEach((g, gi) => {
      const leader = plan.length;
      g.members.forEach((key, i) => {
        const def = ENEMIES[key];
        const first = gi === 0 && i === 0;
        const elite = !def.boss && eliteEvery > 0 && ++foes % eliteEvery === 0;
        plan.push({
          key,
          def,
          elite,
          delay: first ? 0 : i === 0 ? interval : WAVES.formationSpacing,
          follow: g.escort && i > 0 ? leader : null,
          gate: first && w > 0 ? w + 1 : null,
          hpFactor: def.boss ? boss.hp : swarm ? swarm.hp : 1,
          damageFactor: def.boss ? boss.damage : 1,
        });
      });
    });
  }
  return plan;
}

// --- Drops ---

// A win's drops: { glass: { colour: n }, heart: n }. firstHeart: this is the
// stage's first clear at 2 or 3 crowns (a boss stage's Heart is certain).
// first: its first clear at this crown (UNCHARTED.drops.firstClear more of
// its colours; random ones on a boss stage).
export function rollDrops(stage, crown, { first = false, firstHeart = false } = {}, random = Math.random) {
  const d = UNCHARTED.drops;
  const glass = {};
  const add = (c, n) => { glass[c] = (glass[c] ?? 0) + n; };
  const anyColour = () => UNCHARTED.colours[Math.floor(random() * UNCHARTED.colours.length)];
  let heart = 0;
  if (isBossStage(stage)) {
    for (let i = 0; i < d.bossGlass; i++) add(anyColour(), 1);
    if (stage.heart || firstHeart || random() < d.heart[crown - 1]) heart = 1;
    if (first) for (let i = 0; i < d.firstClear; i++) add(anyColour(), 1);
  } else {
    for (const c of stage.drops) {
      if (crown >= 3 || random() < d.chance) add(c, d.crownMult[crown - 1]);
      if (first) add(c, d.firstClear);
    }
  }
  return { glass, heart };
}

// --- Crew Awakening ---

// Sea Glass colour of a crewmate's trait (a Caretaker's is gold).
export const glassOf = (heroId) => UNCHARTED.glassByTrait[traitOf(heroId)] ?? 'gold';

// What awakening a crewmate costs: { colour: n, heart: n } (a Caretaker's
// own and gold columns add up in gold).
export function awakenCost(heroId) {
  const c = AWAKEN.cost[HEROES[heroId].rarity];
  const cost = { [glassOf(heroId)]: c.own, heart: c.heart };
  cost.gold = (cost.gold ?? 0) + c.gold;
  return cost;
}

// A crewmate's awakening (AWAKEN.crew: its title, text and patches).
export const awakening = (heroId) => AWAKEN.crew[heroId] ?? null;

// A crewmate's definition (HEROES[id]) and its ability's (ABILITIES[id]),
// awakened: AWAKEN.crew's patches merged over them (each patched field
// replaced whole), made once.
const defs = new Map();
function merged(kind, id, awakened) {
  const base = kind === 'hero' ? HEROES[id] : ABILITIES[id];
  const patch = awakened && AWAKEN.crew[id]?.[kind];
  if (!patch) return base;
  const key = `${kind}:${id}`;
  if (!defs.has(key)) defs.set(key, { ...base, ...patch });
  return defs.get(key);
}
export const heroDef = (id, awakened = false) => merged('hero', id, awakened);
export const abilityDef = (id, awakened = false) => merged('ability', id, awakened);
