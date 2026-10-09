import { ECONOMY, ELITE, ENEMIES, FORMATIONS, WAVES } from '../config.js';
import { Enemy } from '../entities/Enemy.js';

export const isBossWave = (wave) => wave % WAVES.bossEvery === 0;
export const isSirenWave = (wave) => !isBossWave(wave) && wave >= WAVES.sirenFromWave
  && (wave - WAVES.sirenFromWave) % WAVES.sirenEvery === 0;

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

// The wave's spawn plan, in order: [{ key, def, elite, delay, follow }].
// delay: ms after the previous spawn; follow: index (in the plan) of the
// leader this one keeps behind, or null. Built from FORMATIONS (each
// formation's first wave always includes it), with a Siren on Siren waves and
// The Kraken on boss waves.
export function composeWave(wave) {
  const random = seededRandom(wave * 7919 + 17);
  const n = wave - 1;
  let count = Math.round(WAVES.baseCount + n * WAVES.countPerWave);
  if (isBossWave(wave)) count = Math.round(count * WAVES.bossEscortFactor);

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
  const solo = (key) => ({ members: [key] });
  if (isSirenWave(wave)) groups.splice(Math.round(groups.length * WAVES.sirenSpawnAt), 0, solo('siren'));
  if (isBossWave(wave)) groups.splice(Math.round(groups.length * WAVES.bossSpawnAt), 0, solo('kraken'));

  const elites = eliteChance(wave);
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
      });
    });
  }
  return plan;
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
  }

  get doneSpawning() { return this.queue.length === 0; }

  start(wave) {
    this.queue = composeWave(wave);
    this.spawned = [];
    this.total = this.queue.length;  // for the enemies-left bar
    this.scaling = waveScaling(wave);
    this.spawnTimer = 0;
  }

  stop() {
    this.queue = [];
    this.spawned = [];
  }

  // Returns any enemies spawned this frame.
  update(dt) {
    const spawned = [];
    if (this.doneSpawning) return spawned;

    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0 && this.queue.length) {
      const { def, elite, follow } = this.queue.shift();
      const { hp, damage, gold } = this.scaling;
      const enemy = new Enemy(this.scene, def, {
        hpMultiplier: hp,
        damageMultiplier: damage,
        gold: Math.round(def.gold * gold * (elite ? ELITE.goldMultiplier : 1)),
        elite,
        leader: follow != null ? this.spawned[follow] : null,
      });
      this.spawned.push(enemy);
      spawned.push(enemy);
      if (this.queue.length) this.spawnTimer += this.queue[0].delay;
    }
    return spawned;
  }
}
