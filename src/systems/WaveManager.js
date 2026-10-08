import Phaser from 'phaser';
import { ECONOMY, ENEMIES, WAVES } from '../config.js';
import { Enemy } from '../entities/Enemy.js';

export const isBossWave = (wave) => wave % WAVES.bossEvery === 0;

// Ordered list of enemy defs to spawn for a wave.
export function composeWave(wave) {
  const n = wave - 1;
  let count = WAVES.baseCount + n * WAVES.countPerWave;
  if (isBossWave(wave)) count = Math.round(count * WAVES.bossEscortFactor);

  const toyolShare = wave < WAVES.toyolFromWave ? 0 : Math.min(
    WAVES.toyolShareMax,
    WAVES.toyolShare + (wave - WAVES.toyolFromWave) * WAVES.toyolSharePerWave,
  );
  const toyols = Math.round(count * toyolShare);

  const queue = Phaser.Utils.Array.Shuffle([
    ...Array(count - toyols).fill(ENEMIES.jerangkung),
    ...Array(toyols).fill(ENEMIES.toyol),
  ]);
  if (isBossWave(wave)) {
    queue.splice(Math.round(queue.length * WAVES.bossSpawnAt), 0, ENEMIES.hantuGalah);
  }
  return queue;
}

// Spawns one wave's enemies over time.
export class WaveManager {
  constructor(scene) {
    this.scene = scene;
    this.queue = [];
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
        x: WAVES.spawnX,
        yOffset: def.boss ? 0 : Phaser.Math.Between(-WAVES.laneJitter, 0),
        hpMultiplier: this.hpMultiplier,
        damageMultiplier: this.damageMultiplier,
        gold: Math.round(def.gold * this.goldMultiplier),
      }));
      this.spawnTimer += this.spawnInterval;
    }
    return spawned;
  }
}
