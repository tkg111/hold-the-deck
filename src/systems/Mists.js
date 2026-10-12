import { ENEMIES } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { isBossWave } from './WaveManager.js';

// Whether a wave on an island has a fog bank (its `fogBank`: every every-th
// wave from `from`, skipping boss waves with skipBossWaves). The finale's is
// separate (see Mists.start).
export function isFogBankWave(wave, island) {
  const f = island?.fogBank;
  if (!f || wave < f.from || (wave - f.from) % f.every !== 0) return false;
  return !(f.skipBossWaves && isBossWave(wave));
}

// How long a fallen Bone Deckhand's grave can still be raised (the longest a
// Lantern Ghoul looks back).
const GRAVE_MS = Math.max(...Object.values(ENEMIES).map((d) => d.lantern?.graveMs ?? 0));

// Fogbound Isle during a wave: its fog banks (the island's fogBank), and the
// graves of fallen Bone Deckhands that Lantern Ghouls raise. A fog bank rolls
// in `at` ms into a fog bank wave and lasts `ms`, fading in and out over
// fadeMs (`level`, shown by the scene's fog, src/fog.js); while it's in, the
// crew's attack range is `range` x as long (Hero.pickTarget). The finale's
// ('fog' weather) lasts the whole wave at its fogRange. Runs on the battle's
// dt, so x2 speed speeds it up.
export class Mists {
  constructor(scene) {
    this.scene = scene;
    this.spec = null;      // the island's fogBank, while a fog bank wave runs
    this.startIn = 0;      // ms until it rolls in
    this.timeLeft = 0;     // ms it still lies (Infinity: the finale)
    this.elapsed = 0;      // ms since it rolled in
    this.range = 1;        // the crew's range multiplier while it's in
    this.graves = [];      // { x, age, enemy } of fallen deckhands
  }

  get active() { return this.timeLeft > 0; }
  // The crew's attack range multiplier (1 without a fog bank).
  get rangeMult() { return this.active ? this.range : 1; }
  // How thick the bank is: 0 .. 1, fading in over its first fadeMs and out
  // over its last.
  get level() {
    if (!this.active) return 0;
    const { fadeMs } = this.spec;
    return Math.min(1, this.elapsed / fadeMs, this.timeLeft / fadeMs);
  }

  // A wave starts. options: Progress.waveOptions.
  start(wave, { island = null, finale = null } = {}) {
    this.stop();
    const spec = island?.fogBank;
    if (!spec) return;
    if (finale?.weather === 'fog') {
      this.spec = spec;
      this.range = finale.fogRange;
      this.begin(Infinity);
    } else if (isFogBankWave(wave, island)) {
      this.spec = spec;
      this.range = spec.range;
      this.startIn = spec.at;
    }
  }

  begin(ms) {
    this.timeLeft = ms;
    this.elapsed = 0;
    sfx.fogHorn();
  }

  update(dt) {
    if (this.graves.length) {
      for (const g of this.graves) g.age += dt;
      this.graves = this.graves.filter((g) => g.age <= GRAVE_MS);
    }
    if (!this.spec) return;
    if (this.startIn > 0) {
      this.startIn -= dt;
      if (this.startIn <= 0) this.begin(this.spec.ms);
      return;
    }
    if (!this.active) return;
    this.timeLeft -= dt;
    this.elapsed += dt;
    if (!this.active) this.spec = null;
  }

  // A Bone Deckhand fell here (Enemy.die).
  bury(enemy) {
    this.graves.push({ x: enemy.x, age: 0, enemy });
  }

  // The latest grave younger than maxAge ms, taken off the list (so no other
  // ghoul raises it too), or null.
  claimGrave(maxAge) {
    let best = -1;
    this.graves.forEach((g, i) => {
      if (g.age <= maxAge && (best === -1 || g.age < this.graves[best].age)) best = i;
    });
    return best === -1 ? null : this.graves.splice(best, 1)[0];
  }

  // The wave is over: the fog lifts, and the graves are gone.
  stop() {
    this.spec = null;
    this.startIn = 0;
    this.timeLeft = 0;
    this.elapsed = 0;
    this.graves = [];
  }
}
