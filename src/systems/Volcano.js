import Phaser from 'phaser';
import { ENEMIES } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { Enemy } from '../entities/Enemy.js';
import { DEPTH } from '../entities/Ship.js';
import { fxSprite } from '../fx.js';
import { laneFeetY } from '../layout.js';

// Ember Isle's volcano during a wave: lava bombs (ENEMIES.lavaBomb) onto a
// random deck every so often (the island's lavaBombs; more often in the
// finale's eruption, and three at once when the Molten Leviathan roars), and
// the fire puddles Magma Crabs leave where they die, which hurry ground
// enemies through them. Runs on the battle's dt, so x2 speed speeds it up.
export class Volcano {
  constructor(scene) {
    this.scene = scene;
    this.spec = null;     // the island's lavaBombs (with the finale's bombs), while a wave runs
    this.timer = 0;       // ms to the next bomb
    this.puddles = [];
  }

  // A wave starts. options: Progress.waveOptions.
  start({ island = null, finale = null } = {}) {
    this.stop();
    const bombs = island?.lavaBombs;
    if (!bombs) return;
    this.spec = { ...bombs, ...(finale?.bombs ?? {}) };
    this.timer = this.nextDelay();
  }

  nextDelay() {
    const { min, max } = this.spec;
    return min + Math.random() * (max - min);
  }

  update(dt) {
    if (this.spec) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer += this.nextDelay();
        this.dropBombs(1);
      }
    }
    this.puddles = this.puddles.filter((p) => {
      if (p.update(dt)) return true;
      p.destroy();
      return false;
    });
  }

  // count lava bombs at once, each on a different built deck while there
  // are enough, then up to jitter px apart on the same ones. Each shows its
  // warning on the deck while it falls there over warnMs.
  dropBombs(count) {
    const { scene, spec } = this;
    if (!spec) return;
    const { ship } = scene;
    const decks = Phaser.Utils.Array.Shuffle([...Array(ship.decks).keys()]);
    for (let i = 0; i < count; i++) {
      const deck = decks[i % decks.length];
      const spot = ship.deckSpot(deck);
      const jitter = i < decks.length ? 0 : (Math.random() * 2 - 1) * spec.jitter;
      // Not scaled by the wave: its hit is a share of the hull, and any
      // anti-air hit pops it.
      scene.enemies.push(new Enemy(scene, ENEMIES.lavaBomb, {
        x: Math.round(spot.x + jitter),
        hpMultiplier: 1,
        damageMultiplier: 1,
        gold: 0,
        fall: { deck, feetY: spot.feetY, fromY: spec.fromY, ms: spec.warnMs },
      }));
    }
    sfx.bombWhistle();
  }

  // A Magma Crab died at x: its fire puddle (ENEMIES.magmaCrab.firePuddle).
  addPuddle(x, spec) {
    this.puddles.push(new FirePuddle(this.scene, x, spec));
  }

  // The wave is over: no more bombs, puddles gone.
  stop() {
    this.spec = null;
    for (const p of this.puddles) p.destroy();
    this.puddles = [];
  }
}

// fire_puddle lying on the lane for spec.ms: ground enemies in it walk
// 1 + spec.speedBonus times as fast (lingering spec.linger ms after they
// leave). Fades out over its last spec.fadeMs.
class FirePuddle {
  constructor(scene, x, spec) {
    this.scene = scene;
    this.spec = spec;
    this.x = x;
    this.time = spec.ms;
    // Over the near water, like the Grog Barrel's puddle.
    this.sprite = fxSprite(scene, spec.sprite, Math.round(x), Math.round(laneFeetY(x)))
      .setDepth(DEPTH.foreground + 0.5);
    this.half = this.sprite.width / 2;
  }

  update(dt) {
    const { spec } = this;
    this.time -= dt;
    for (const e of this.scene.enemies) {
      if (!e.alive || !e.canBeMoved) continue;
      if (Math.abs(e.x - this.x) <= this.half + e.def.width / 2) e.applyMoveBoost(1 + spec.speedBonus, spec.linger);
    }
    this.sprite.setAlpha(Phaser.Math.Clamp(this.time / spec.fadeMs, 0, 1));
    return this.time > 0;
  }

  destroy() { this.sprite.destroy(); }
}
