import { sfx } from '../audio/Sfx.js';

// Whether a wave on an island has a blizzard (its `blizzard`: every
// every-th wave from `from`). The finale's is separate (see Blizzard.start).
export function isBlizzardWave(wave, island) {
  const b = island?.blizzard;
  return !!b && wave >= b.from && (wave - b.from) % b.every === 0;
}

// Frostbite Reef's blizzards during a wave (the island's `blizzard`): one
// rolls in `at` ms into a blizzard wave and lasts `ms`; meanwhile every
// freezeEvery ms a random crewmate freezes for freezeMs and enemies walk
// chill x as fast (see Enemy.moveBoost). The finale's blizzard ('blizzard'
// weather) lasts the whole wave and freezes nobody. The scene's weather
// (scene.snowfall) shows it. Runs on the battle's dt, so x2 speed speeds it up.
export class Blizzard {
  constructor(scene) {
    this.scene = scene;
    this.spec = null;      // the island's blizzard, while a blizzard wave runs
    this.startIn = 0;      // ms until it rolls in
    this.timeLeft = 0;     // ms it still blows (Infinity: the finale)
    this.freezeTimer = 0;
    this.freezes = false;  // whether it freezes crew (not in the finale)
  }

  get active() { return this.timeLeft > 0; }
  // Enemies' walking pace (1 without a blizzard).
  get chill() { return this.active ? this.spec.chill : 1; }

  // A wave starts. options: Progress.waveOptions.
  start(wave, { island = null, finale = null } = {}) {
    this.stop();
    const spec = island?.blizzard;
    if (!spec) return;
    if (finale?.weather === 'blizzard') {
      this.spec = spec;
      this.freezes = false;
      this.begin(Infinity);
    } else if (isBlizzardWave(wave, island)) {
      this.spec = spec;
      this.freezes = true;
      this.startIn = spec.at;
    }
  }

  begin(ms) {
    this.timeLeft = ms;
    this.freezeTimer = this.spec.freezeEvery;
    this.scene.snowfall?.worsen();
    sfx.wind();
  }

  update(dt) {
    if (!this.spec) return;
    if (this.startIn > 0) {
      this.startIn -= dt;
      if (this.startIn <= 0) this.begin(this.spec.ms);
      return;
    }
    if (!this.active) return;
    this.timeLeft -= dt;
    if (!this.active) {
      this.scene.snowfall?.calm();
      this.spec = null;
      return;
    }
    if (!this.freezes) return;
    this.freezeTimer -= dt;
    if (this.freezeTimer > 0) return;
    this.freezeTimer += this.spec.freezeEvery;
    this.freezeSomeone();
  }

  // A random crewmate not frozen yet freezes.
  freezeSomeone() {
    const crew = this.scene.heroes.filter((h) => !h.isFrozen);
    if (!crew.length) return;
    crew[Math.floor(Math.random() * crew.length)].freeze(this.spec.freezeMs, 'blizzard');
  }

  // The wave is over: the blizzard blows out.
  stop() {
    if (this.active) this.scene.snowfall?.calm();
    this.spec = null;
    this.startIn = 0;
    this.timeLeft = 0;
  }
}
