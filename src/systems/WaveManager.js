import { ECONOMY, ELITE, ENEMIES, FORMATIONS, WAVES } from '../config.js';
import { Enemy } from '../entities/Enemy.js';

export const isBossWave = (wave) => wave % WAVES.bossEvery === 0;
// The boss of a boss wave (ENEMIES key): WAVES.bosses take turns.
export const bossOf = (wave) => WAVES.bosses[(wave / WAVES.bossEvery - 1) % WAVES.bosses.length];
export const isSirenWave = (wave) => !isBossWave(wave) && wave >= WAVES.sirenFromWave
  && (wave - WAVES.sirenFromWave) % WAVES.sirenEvery === 0;

// The first wave an enemy type (ENEMIES key) can appear in: its earliest
// formation, the first Siren wave, or its first boss wave.
export function enemyFirstWave(key) {
  if (ENEMIES[key].boss) return WAVES.bossEvery * (WAVES.bosses.indexOf(key) + 1);
  if (ENEMIES[key].stationary) return WAVES.sirenFromWave;
  const froms = FORMATIONS.filter((f) => f.members.includes(key)).map((f) => f.from);
  return froms.length ? Math.min(...froms) : Infinity;
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

// The regular formations of a wave until they hold `count` enemies (each
// formation's first wave always includes it), shuffled.
function pickFormations(wave, count, random) {
  const unlocked = FORMATIONS.filter((f) => wave >= f.from);
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
// finale's bosses). Built from FORMATIONS, with a Siren on Siren waves and
// the boss on boss waves. offset: the island's waveOffset (Elites come as on
// wave + offset, which also seeds the line-up). finale: the
// island's finale config when this wave is it (see finalePlan). countFactor:
// multiplies the enemy count and Elite chance (Endless grace, see
// Progress.endlessGrace).
export function composeWave(wave, { offset = 0, finale = null, countFactor = 1 } = {}) {
  const random = seededRandom(wave * 7919 + 17 + offset * 104729);
  if (finale) return finalePlan(wave, offset, finale, random);
  const n = wave - 1;
  let count = Math.round(enemyCount(wave) * countFactor);
  if (isBossWave(wave)) count = Math.round(count * WAVES.bossEscortFactor);

  const groups = pickFormations(wave, count, random);
  const solo = (key) => ({ members: [key] });
  if (isSirenWave(wave)) groups.splice(Math.round(groups.length * WAVES.sirenSpawnAt), 0, solo('siren'));
  if (isBossWave(wave)) groups.splice(Math.round(groups.length * WAVES.bossSpawnAt), 0, solo(bossOf(wave)));

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

// An island's finale: the Ghost Galleon at galleonAt, The Kraken
// krakenAfter ms later, in front of it (both at hpFactor x their HP), and a trickle of
// regular formations (trickle x the usual count) every trickleInterval ms
// from trickleFrom.
function finalePlan(wave, offset, finale, random) {
  const groups = pickFormations(wave, Math.round(enemyCount(wave) * finale.trickle), random);
  const elites = eliteChance(wave + offset);
  const timed = [];   // { time, entry, leader }
  const boss = (key, time) => timed.push({
    time, entry: { key, def: ENEMIES[key], elite: false, hpFactor: finale.hpFactor, inFront: true },
  });
  boss('ghostGalleon', finale.galleonAt);
  boss('kraken', finale.galleonAt + finale.krakenAfter);
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

  // options: { offset, finale } (Progress.waveOptions).
  start(wave, options = {}) {
    this.queue = composeWave(wave, options);
    this.spawned = [];
    this.total = this.queue.length;  // for the enemies-left bar
    this.scaling = waveScaling(wave + (options.offset ?? 0));
    this.spawnTimer = this.queue[0]?.delay ?? 0;
    this.finale = options.finale ?? null;
    this.enraged = false;
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
      const { key, def, elite, follow, hpFactor, inFront } = this.queue.shift();
      const { hp, damage, gold } = this.scaling;
      const enemy = new Enemy(this.scene, def, {
        hpMultiplier: hp * (hpFactor ?? 1),
        damageMultiplier: damage,
        gold: Math.round(def.gold * gold * (elite ? ELITE.goldMultiplier : 1)),
        elite,
        key,
        leader: follow != null ? this.spawned[follow] : null,
        inFront,
      });
      if (this.enraged && def.boss) enemy.enrage(this.finale.rage, this.finale.rageTint);
      this.spawned.push(enemy);
      spawned.push(enemy);
      if (this.queue.length) this.spawnTimer += this.queue[0].delay;
    }
    return spawned;
  }
}
