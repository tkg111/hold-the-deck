import {
  ABYSS, ECONOMY, ELITE, ENEMIES, FORMATIONS, HUNTS, ISLANDS, WAVES,
} from '../config.js';
import { Enemy } from '../entities/Enemy.js';
import { depthPlan, depthScaling } from './Abyss.js';

// What an island's waves are made of (its ISLANDS entry, Skull Cove by
// default): its formations, bosses and first Siren wave, falling back to
// Skull Cove's (FORMATIONS, WAVES) for anything it doesn't set.
export function islandContent(island = ISLANDS[0]) {
  return {
    formations: island.formations ?? FORMATIONS,
    bosses: island.bosses ?? WAVES.bosses,
    sirenFromWave: island.sirenFromWave ?? WAVES.sirenFromWave,
  };
}

export const isBossWave = (wave) => wave % WAVES.bossEvery === 0;
// The boss of a boss wave on an island (ENEMIES key): its bosses take turns.
export function bossOf(wave, island) {
  const { bosses } = islandContent(island);
  return bosses[(wave / WAVES.bossEvery - 1) % bosses.length];
}
export function isSirenWave(wave, island) {
  const { sirenFromWave } = islandContent(island);
  return !isBossWave(wave) && wave >= sirenFromWave && (wave - sirenFromWave) % WAVES.sirenEvery === 0;
}

// The first wave an enemy type (ENEMIES key) can appear in on an island: its
// earliest formation, the first Siren wave, its first boss wave or the
// finale. Infinity if it never does.
export function enemyFirstWave(key, island = ISLANDS[0]) {
  const { formations, bosses, sirenFromWave } = islandContent(island);
  const waves = formations.filter((f) => f.members.includes(key)).map((f) => f.from);
  if (bosses.includes(key)) waves.push(WAVES.bossEvery * (bosses.indexOf(key) + 1));
  if (island.finale?.bosses.some((b) => b.key === key)) waves.push(island.finale.wave);
  if (ENEMIES[key].stationary) waves.push(sirenFromWave);
  return waves.length ? Math.min(...waves) : Infinity;
}

// Where an enemy type is first met on the voyage: { island (ISLANDS index),
// wave }, or null if it isn't on any island yet.
export function enemyDebut(key) {
  for (let i = 0; i < ISLANDS.length; i++) {
    if (!ISLANDS[i].available) continue;
    const wave = enemyFirstWave(key, ISLANDS[i]);
    if (wave < Infinity) return { island: i, wave };
  }
  return null;
}

// Enemy damage multiplier of a wave (island offset included): see
// WAVES.damageGrowth and lateDamage, capped at the island's damageCap if it
// has one.
function damageMultiplier(wave, island) {
  const { from, growth, cap = Infinity } = WAVES.lateDamage;
  const atFrom = (1 + WAVES.damageGrowth) ** (Math.min(wave, from) - 1);
  if (wave <= from) return atFrom;
  return Math.max(atFrom, Math.min(island?.damageCap ?? cap, atFrom * (1 + growth) ** (wave - from)));
}

// Per-wave multipliers for enemy HP, damage and kill gold (island: its
// ISLANDS entry, for its damageCap).
export function waveScaling(wave, island = null) {
  const n = wave - 1;
  return {
    hp: 1 + n * WAVES.hpPerWave + n * n * WAVES.hpPerWaveSquared,
    damage: damageMultiplier(wave, island),
    gold: (1 + ECONOMY.killGoldGrowth) ** n,
  };
}

// The wave-clear bonus of a wave (island offset included): see ECONOMY.
export function clearBonus(wave) {
  return Math.round((ECONOMY.waveClearBase + (wave - 1) * ECONOMY.waveClearPerWave) * waveScaling(wave).gold);
}

// Gold a win of a wave pays (options: Progress.waveOptions' shape): every
// enemy's kill gold plus the wave-clear bonus.
export function waveGold(wave, options = {}) {
  const scaled = wave + (options.offset ?? 0);
  const plan = composeWave(wave, options);
  const kills = plan.reduce((s, { def, elite }) => s + (def.gold ?? 0) * (elite ? ELITE.goldMultiplier : 1), 0);
  return kills * waveScaling(scaled).gold + clearBonus(scaled);
}

// Chance for each (non-boss) enemy of the wave to be an Elite.
export function eliteChance(wave) {
  if (wave < ELITE.fromWave) return 0;
  return Math.min(ELITE.maxChance, ELITE.chance + (wave - ELITE.fromWave) * ELITE.chancePerWave);
}

// Small seeded random generator (mulberry32): the same wave number always
// gives the same line-up, so a retry meets the same formations.
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A formation as it comes in a wave: a pack ([min, max] of its one member)
// gets its size from the wave's generator.
function rollFormation(f, random) {
  if (!f.pack) return f;
  const [min, max] = f.pack;
  return { ...f, members: Array(min + Math.floor(random() * (max - min + 1))).fill(f.members[0]) };
}

// The regular formations (from `formations`) of a wave until they hold
// `count` enemies (each formation's first wave always includes it), shuffled.
function pickFormations(wave, count, formations, random) {
  const unlocked = formations.filter((f) => wave >= f.from);
  const groups = unlocked.filter((f) => f.from === wave).map((f) => rollFormation(f, random));
  let size = groups.reduce((sum, f) => sum + f.members.length, 0);
  const totalWeight = unlocked.reduce((sum, f) => sum + f.weight, 0);
  while (size < count) {
    let roll = random() * totalWeight;
    const f = rollFormation(unlocked.find((g) => (roll -= g.weight) < 0) ?? unlocked[unlocked.length - 1], random);
    groups.push(f);
    size += f.members.length;
  }
  // Shuffle the formations (Fisher-Yates on the seeded generator).
  for (let i = groups.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [groups[i], groups[j]] = [groups[j], groups[i]];
  }
  return groups;
}

// An island's earlyBoost on a wave: { count, hp } multipliers, full on wave
// 1 and fading evenly to x1 on wave `until` (x1 after it, or without one).
export function earlyBoost(wave, island) {
  const b = island?.earlyBoost;
  if (!b || wave >= b.until) return { count: 1, hp: 1 };
  const t = (b.until - wave) / (b.until - 1);
  return { count: 1 + (b.count - 1) * t, hp: 1 + (b.hp - 1) * t };
}

export const enemyCount = (wave) => Math.round(WAVES.baseCount + (wave - 1) * WAVES.countPerWave);
// Time between a wave's formations.
export const spawnInterval = (wave) => Math.max(WAVES.minSpawnInterval, WAVES.spawnInterval + (wave - 1) * WAVES.spawnIntervalPerWave);

// The wave's spawn plan, in order: [{ key, def, elite, delay, follow,
// hpFactor, damageFactor }]. delay: ms after the previous spawn; follow:
// index (in the plan) of the leader this one keeps behind, or null;
// hpFactor / damageFactor: multiply its HP / damage (the finale's bosses, an
// island's earlyBoost and bossBoost). Built from the island's formations, with a Siren on Siren
// waves and the boss on boss waves. island: its ISLANDS entry. offset: its
// waveOffset (Elites come as on wave + offset, which also seeds the
// line-up). finale: the island's finale config when this wave is it (see
// finalePlan). countFactor: multiplies the enemy count and Elite chance
// (Endless grace, see Progress.endlessGrace).
// hunt: { boss, level } for a Boss Hunt (see huntPlan; `wave` is then the
// boss's first wave on the island). abyss: { seed, depth } for a depth of
// the Abyss (see Abyss.depthPlan).
export function composeWave(wave, {
  island = ISLANDS[0], offset = 0, finale = null, countFactor = 1, hunt = null, abyss = null,
} = {}) {
  if (abyss) return depthPlan(abyss.seed, abyss.depth);
  if (hunt) return huntPlan(wave, island, offset, hunt);
  const random = seededRandom(wave * 7919 + 17 + offset * 104729);
  const { formations } = islandContent(island);
  if (finale) return finalePlan(wave, offset, finale, finale.formations ?? formations, random);
  const early = earlyBoost(wave, island);
  const boost = island.bossBoost?.[wave] ?? { hp: 1, damage: 1 };
  let count = Math.round(enemyCount(wave) * countFactor * early.count);
  if (isBossWave(wave)) count = Math.round(count * WAVES.bossEscortFactor);

  const groups = pickFormations(wave, count, formations, random);
  const solo = (key) => ({ members: [key] });
  if (isSirenWave(wave, island)) groups.splice(Math.round(groups.length * WAVES.sirenSpawnAt), 0, solo('siren'));
  if (isBossWave(wave)) groups.splice(Math.round(groups.length * WAVES.bossSpawnAt), 0, solo(bossOf(wave, island)));

  const elites = eliteChance(wave + offset) * countFactor;
  const interval = spawnInterval(wave);
  const plan = [];
  for (const g of groups) {
    const leader = plan.length;
    g.members.forEach((key, i) => {
      const def = ENEMIES[key];
      plan.push({
        key,
        def,
        elite: !def.boss && random() < elites,
        delay: plan.length === 0 ? 0 : i === 0 ? interval : WAVES.formationSpacing,
        follow: g.escort && i > 0 ? leader : null,
        hpFactor: def.boss ? boost.hp : early.hp,
        damageFactor: def.boss ? boost.damage : 1,
      });
    });
  }
  return plan;
}

// An island's finale: each of its bosses at its time (with hpFactor x its
// HP, its own hpFactor / damageFactor if it has them), and a trickle of
// regular formations (trickle x the usual count) every trickleInterval ms
// from trickleFrom.
function finalePlan(wave, offset, finale, formations, random) {
  const groups = pickFormations(wave, Math.round(enemyCount(wave) * finale.trickle), formations, random);
  const bosses = finale.bosses.map(({ key, at, hpFactor, damageFactor }) => ({
    key, at, hpFactor: hpFactor ?? finale.hpFactor, damageFactor: damageFactor ?? 1,
  }));
  return timedPlan(bosses, groups, finale, { elites: eliteChance(wave + offset), hpFactor: 1, damageFactor: 1 }, random);
}

// A Boss Hunt (HUNTS): the boss `hunt.boss` bossAt ms in, with its first
// wave's bossBoost, and a trickle of the island's formations as on that
// wave (its earlyBoost too), everyone's HP and damage x (1 + growth) ^
// (level - 1). Seeded by the wave and the level, so a retry meets the same
// line-up.
function huntPlan(wave, island, offset, { boss, level }) {
  const random = seededRandom(wave * 7919 + 17 + offset * 104729 + level * 7);
  const { formations } = islandContent(island);
  const harder = (1 + HUNTS.growth) ** (level - 1);
  const boost = island.bossBoost?.[wave] ?? { hp: 1, damage: 1 };
  const early = earlyBoost(wave, island);
  const groups = pickFormations(wave, Math.round(enemyCount(wave) * HUNTS.trickle * early.count), formations, random);
  const bosses = [{ key: boss, at: HUNTS.bossAt, hpFactor: boost.hp * harder, damageFactor: boost.damage * harder }];
  return timedPlan(bosses, groups, HUNTS, {
    elites: eliteChance(wave + offset), hpFactor: early.hp * harder, damageFactor: harder,
  }, random);
}

// A plan on a clock: each boss ({ key, at, hpFactor, damageFactor }) at its
// time, and the groups trickling in one every trickleInterval ms from
// trickleFrom (their members Elite at `elites` chance, with hpFactor and
// damageFactor).
function timedPlan(bosses, groups, { trickleFrom, trickleInterval }, { elites, hpFactor, damageFactor }, random) {
  const timed = [];   // { time, entry, leader }
  for (const { key, at, hpFactor: bossHp, damageFactor: bossDamage } of bosses) {
    timed.push({
      time: at,
      entry: { key, def: ENEMIES[key], elite: false, hpFactor: bossHp, damageFactor: bossDamage },
    });
  }
  groups.forEach((g, gi) => {
    const start = trickleFrom + gi * trickleInterval;
    const leader = { key: g.members[0] };
    g.members.forEach((key, i) => {
      const def = ENEMIES[key];
      const entry = { key, def, elite: random() < elites, hpFactor, damageFactor };
      if (i === 0) Object.assign(leader, { entry });
      timed.push({ time: start + i * WAVES.formationSpacing, entry, leader: g.escort && i > 0 ? leader : null });
    });
  });
  timed.sort((a, b) => a.time - b.time);
  const index = new Map(timed.map((t, i) => [t.entry, i]));
  return timed.map((t, i) => ({
    ...t.entry,
    delay: i === 0 ? t.time : t.time - timed[i - 1].time,
    follow: t.leader ? index.get(t.leader.entry) : null,
  }));
}

// How long a type with maxOnScreen (the Ice Witch) waits, at the end of the
// queue, before trying again.
const CROWDED_RETRY_MS = 500;

// Spawns one wave's enemies over time.
export class WaveManager {
  constructor(scene) {
    this.scene = scene;
    this.queue = [];
    this.spawned = [];   // enemies so far, by their index in the plan (formation leaders)
    this.total = 0;
    this.spawnTimer = 0;
    this.scaling = waveScaling(1);
    this.finale = null;  // the island's finale config while it's the wave
    this.enraged = false;
    this.crewCalls = 0;  // the finale: crew raisings owed to a boss not out yet
  }

  get doneSpawning() { return this.queue.length === 0; }

  // options: { island, offset, finale, countFactor } (Progress.waveOptions),
  // or a depth of the Abyss's (Abyss.depthOptions: its own scaling and
  // Elites, ABYSS.elites).
  start(wave, options = {}) {
    this.queue = composeWave(wave, options).map((entry, index) => ({ ...entry, index }));
    this.spawned = [];
    this.total = this.queue.length;  // for the enemies-left bar
    const { abyss } = options;
    this.scaling = abyss ? depthScaling(abyss.depth, abyss.currents) : waveScaling(wave + (options.offset ?? 0), options.island);
    this.eliteStyle = abyss ? ABYSS.elites : null;
    this.hullShare = abyss ? ABYSS.hullShare : 1;
    this.island = options.island ?? null;
    this.spawnTimer = this.queue[0]?.delay ?? 0;
    this.finale = options.finale ?? null;
    // A finale whose bosses arrive enraged.
    this.enraged = this.finale?.enrage === 'fromStart';
    this.crewCalls = 0;
  }

  stop() {
    this.queue = [];
    this.spawned = [];
    this.finale = null;
  }

  // The finale: a boss fell, so the other enrages (now, or as it arrives),
  // or (onBossDown 'summon') Captain Blackbones raises his crew. Returns the
  // bosses that enraged now.
  bossDown() {
    if (this.finale?.onBossDown === 'summon') {
      const captain = this.spawned.find((e) => e?.alive && e.def.blackbones);
      if (captain) captain.callCrew();
      else if (this.queue.some((entry) => entry.def.blackbones)) this.crewCalls++;
    }
    if (this.finale?.enrage !== 'onBossDown' || this.enraged) return [];
    this.enraged = true;
    const raging = this.spawned.filter((e) => e?.alive && e.def.boss);
    for (const e of raging) e.enrage(this.finale.rage, this.finale.rageTint);
    return raging;
  }

  // Whether the screen (with `spawning`, those coming in this step) already
  // holds as many of the entry's type as it may (its maxOnScreen).
  crowded({ key, def }, spawning) {
    if (!def.maxOnScreen) return false;
    return [...this.scene.enemies, ...spawning].filter((e) => e.alive && e.key === key).length >= def.maxOnScreen;
  }

  // Returns any enemies spawned this frame.
  update(dt) {
    const spawned = [];
    if (this.doneSpawning) return spawned;

    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0 && this.queue.length) {
      // One whose type is crowded waits its turn: the next that isn't comes
      // in its place; if none can, they try again shortly.
      const ready = this.queue.findIndex((entry) => !this.crowded(entry, spawned));
      if (ready === -1) {
        this.spawnTimer += CROWDED_RETRY_MS;
        break;
      }
      if (ready > 0) this.queue.unshift(...this.queue.splice(ready, 1));
      const {
        key, def, elite, follow, hpFactor, damageFactor, index,
      } = this.queue.shift();
      const { hp, damage, gold } = this.scaling;
      const eliteGold = this.eliteStyle?.gold ?? ELITE.goldMultiplier;
      const enemy = new Enemy(this.scene, def, {
        hpMultiplier: hp * (hpFactor ?? 1),
        damageMultiplier: damage * (damageFactor ?? 1),
        gold: Math.round(def.gold * gold * (elite ? eliteGold : 1)),
        elite,
        eliteStyle: this.eliteStyle,
        hullShare: this.hullShare,
        key,
        leader: follow != null ? this.spawned[follow] ?? null : null,
        boulders: !!this.finale?.boulders,
      });
      if (this.enraged && def.boss) enemy.enrage(this.finale.rage, this.finale.rageTint);
      for (; this.crewCalls > 0 && def.blackbones; this.crewCalls--) enemy.callCrew();
      this.scene.currents?.onSpawn(enemy);   // the Abyss's Shielded current
      this.spawned[index] = enemy;
      spawned.push(enemy);
      if (this.queue.length) this.spawnTimer += this.queue[0].delay;
    }
    return spawned;
  }
}
