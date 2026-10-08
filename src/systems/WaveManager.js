import Phaser from 'phaser';
import { ECONOMY, ENEMIES, WAVES } from '../config.js';
import { Enemy } from '../entities/Enemy.js';

export const isBossWave = (wave) => wave % WAVES.bossEvery === 0;

// Ordered list of enemy defs to spawn for a wave.
export function composeWave(wave) {
  const n = wave - 1;
  let count = WAVES.baseCount + n * WAVES.countPerWave;
  if (isBossWave(wave)) count = Math.round(count * WAVES.bossEscortFactor);

  const thiefMonkeyShare = wave < WAVES.thiefMonkeyFromWave ? 0 : Math.min(
    WAVES.thiefMonkeyShareMax,
    WAVES.thiefMonkeyShare + (wave - WAVES.thiefMonkeyFromWave) * WAVES.thiefMonkeySharePerWave,
  );
  const thiefMonkeys = Math.round(count * thiefMonkeyShare);

  const queue = Phaser.Utils.Array.Shuffle([
    ...Array(count - thiefMonkeys).fill(ENEMIES.drownedSailor),
    ...Array(thiefMonkeys).fill(ENEMIES.thiefMonkey),
  ]);
  if (isBossWave(wave)) {
    queue.splice(Math.round(queue.length * WAVES.bossSpawnAt), 0, ENEMIES.kraken);
  }
  return queue;
}

// Spawns one wave's enemies over time.
export class WaveManager {
  constructor(scene) {
    this.scene = scene;
    this.queue = [];
    this.total = 0;
    this.spawnTimer = 0;
    this.spawnInterval = WAVES.spawnInterval;
    this.hpMultiplier = 1;
    this.damageMultiplier = 1;
    this.goldMultiplier = 1;
  }

  get doneSpawning() { return this.queue.length === 0; }

  start(wave) {
    const n = wave - 1;
    this.queue = composeWave(wave);
    this.total = this.queue.length;  // for the enemies-left bar
    this.hpMultiplier = 1 + n * WAVES.hpGrowth;
    this.damageMultiplier = 1 + n * WAVES.damageGrowth;
    this.goldMultiplier = 1 + n * ECONOMY.killGoldGrowth;
    this.spawnInterval = Math.max(
      WAVES.minSpawnInterval,
      WAVES.spawnInterval + n * WAVES.spawnIntervalPerWave,
    );
    this.spawnTimer = 0;
  }

  stop() {
    this.queue = [];
  }

  // Returns any enemies spawned this frame.
  update(dt) {
    const spawned = [];
    if (this.doneSpawning) return spawned;

    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0 && this.queue.length) {
      const def = this.queue.shift();
      spawned.push(new Enemy(this.scene, def, {
        hpMultiplier: this.hpMultiplier,
        damageMultiplier: this.damageMultiplier,
        gold: Math.round(def.gold * this.goldMultiplier),
      }));
      this.spawnTimer += this.spawnInterval;
    }
    return spawned;
  }
}
