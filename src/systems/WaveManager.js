import { ECONOMY, ELITE, ENEMIES, FORMATIONS, ISLANDS, WAVES } from '../config.js';
import { Enemy } from '../entities/Enemy.js';

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

// Per-wave multipliers for enemy HP, damage and kill gold.
export function waveScaling(wave) {
  const n = wave - 1;
  return {
    hp: 1 + n * WAVES.hpPerWave + n * n * WAVES.hpPerWaveSquared,
    damage: (1 + WAVES.damageGrowth) ** n,
    gold: (1 + ECONOMY.killGoldGrowth) ** n,
  };
}

// Chance for each (non-boss) enemy of the wave to be an Elite.
export function eliteChance(wave) {
  if (wave < ELITE.fromWave) return 0;
  return Math.min(ELITE.maxChance, ELITE.chance + (wave - ELITE.fromWave) * ELITE.chancePerWave);
}

// Small seeded random generator (mulberry32): the same wave number always
// gives the same line-up, so a retry meets the same formations.
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The regular formations (from `formations`) of a wave until they hold
// `count` enemies (each formation's first wave always includes it), shuffled.
function pickFormations(wave, count, formations, random) {
  const unlocked = formations.filter((f) => wave >= f.from);
  const groups = unlocked.filter((f) => f.from === wave);
  let size = groups.reduce((sum, f) => sum + f.members.length, 0);
  const totalWeight = unlocked.reduce((sum, f) => sum + f.weight, 0);
  while (size < count) {
    let roll = random() * totalWeight;
    const f = unlocked.find((g) => (roll -= g.weight) < 0) ?? unlocked[unlocked.length - 1];
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

const enemyCount = (wave) => Math.round(WAVES.baseCount + (wave - 1) * WAVES.countPerWave);

// The wave's spawn plan, in order: [{ key, def, elite, delay, follow, hpFactor }].
// delay: ms after the previous spawn; follow: index (in the plan) of the
// leader this one keeps behind, or null; hpFactor: multiplies its HP (the
// finale's bosses). Built from the island's formations, with a Siren on Siren
// waves and the boss on boss waves. island: its ISLANDS entry. offset: its
// waveOffset (Elites come as on wave + offset, which also seeds the
// line-up). finale: the island's finale config when this wave is it (see
// finalePlan). countFactor: multiplies the enemy count and Elite chance
// (Endless grace, see Progress.endlessGrace).
export function composeWave(wave, {
  island = ISLANDS[0], offset = 0, finale = null, countFactor = 1,
} = {}) {
  const random = seededRandom(wave * 7919 + 17 + offset * 104729);
  const { formations } = islandContent(island);
  if (finale) return finalePlan(wave, offset, finale, formations, random);
  const n = wave - 1;
  let count = Math.round(enemyCount(wave) * countFactor);
  if (isBossWave(wave)) count = Math.round(count * WAVES.bossEscortFactor);

  const groups = pickFormations(wave, count, formations, random);
  const solo = (key) => ({ members: [key] });
  if (isSirenWave(wave, island)) groups.splice(Math.round(groups.length * WAVES.sirenSpawnAt), 0, solo('siren'));
  if (isBossWave(wave)) groups.splice(Math.round(groups.length * WAVES.bossSpawnAt), 0, solo(bossOf(wave, island)));

  const elites = eliteChance(wave + offset) * countFactor;
  const interval = Math.max(WAVES.minSpawnInterval, WAVES.spawnInterval + n * WAVES.spawnIntervalPerWave);
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
        hpFactor: 1,
      });
    });
  }
  return plan;
}

// An island's finale: each of its bosses at its time (with hpFactor x its
// HP), and a trickle of regular formations (trickle x the usual count) every
// trickleInterval ms from trickleFrom.
function finalePlan(wave, offset, finale, formations, random) {
  const groups = pickFormations(wave, Math.round(enemyCount(wave) * finale.trickle), formations, random);
  const elites = eliteChance(wave + offset);
  const timed = [];   // { time, entry, leader }
  for (const { key, at } of finale.bosses) {
    timed.push({ time: at, entry: { key, def: ENEMIES[key], elite: false, hpFactor: finale.hpFactor } });
  }
  groups.forEach((g, gi) => {
    const start = finale.trickleFrom + gi * finale.trickleInterval;
    const leader = { key: g.members[0] };
    g.members.forEach((key, i) => {
      const def = ENEMIES[key];
      const entry = { key, def, elite: random() < elites, hpFactor: 1 };
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

// Spawns one wave's enemies over time.
export class WaveManager {
  constructor(scene) {
    this.scene = scene;
    this.queue = [];
    this.spawned = [];   // enemies so far, in plan order (formation leaders)
    this.total = 0;
    this.spawnTimer = 0;
    this.scaling = waveScaling(1);
    this.finale = null;  // the island's finale config while it's the wave
    this.enraged = false;
  }

  get doneSpawning() { return this.queue.length === 0; }

  // options: { island, offset, finale, countFactor } (Progress.waveOptions).
  start(wave, options = {}) {
    this.queue = composeWave(wave, options);
    this.spawned = [];
    this.total = this.queue.length;  // for the enemies-left bar
    this.scaling = waveScaling(wave + (options.offset ?? 0));
    this.spawnTimer = this.queue[0]?.delay ?? 0;
    this.finale = options.finale ?? null;
    // A finale whose bosses arrive enraged.
    this.enraged = this.finale?.enrage === 'fromStart';
  }

  stop() {
    this.queue = [];
    this.spawned = [];
    this.finale = null;
  }

  // The finale: a boss fell, so the other enrages (now, or as it arrives).
  // Returns the bosses that enraged now.
  bossDown() {
    if (!this.finale || this.enraged) return [];
    this.enraged = true;
    const raging = this.spawned.filter((e) => e.alive && e.def.boss);
    for (const e of raging) e.enrage(this.finale.rage, this.finale.rageTint);
    return raging;
  }

  // Returns any enemies spawned this frame.
  update(dt) {
    const spawned = [];
    if (this.doneSpawning) return spawned;

    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0 && this.queue.length) {
      const { key, def, elite, follow, hpFactor } = this.queue.shift();
      const { hp, damage, gold } = this.scaling;
      const enemy = new Enemy(this.scene, def, {
        hpMultiplier: hp * (hpFactor ?? 1),
        damageMultiplier: damage,
        gold: Math.round(def.gold * gold * (elite ? ELITE.goldMultiplier : 1)),
        elite,
        key,
        leader: follow != null ? this.spawned[follow] : null,
      });
      if (this.enraged && def.boss) enemy.enrage(this.finale.rage, this.finale.rageTint);
      this.spawned.push(enemy);
      spawned.push(enemy);
      if (this.queue.length) this.spawnTimer += this.queue[0].delay;
    }
    return spawned;
  }
}
