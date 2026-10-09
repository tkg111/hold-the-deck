import Phaser from 'phaser';
import { ABILITIES, ABILITY_BAR } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { LAYOUT, laneFeetY } from '../layout.js';
import { LobProjectile, nearestLiving, Projectile } from '../entities/Projectile.js';
import { DEPTH } from '../entities/Ship.js';
import { FX_DEPTH, fxDuration, fxSize, fxSprite, playFx } from '../fx.js';
import { fxKey } from '../sprites.js';
import { cssColor, fmtNumber } from '../ui/format.js';

// Active abilities for the crew on the ship: one per crewmate (ABILITIES in
// config), each on its own cooldown. Used from the ability bar or keys 1-6,
// or fired automatically when ready with Auto on. Everything runs on the
// battle's dt, so x2 speed speeds abilities up too.
export class AbilitySystem {
  constructor(scene) {
    this.scene = scene;
    this.slots = [];
    this.effects = [];   // ongoing effects: update(dt) -> false when finished
  }

  // heroes: the Hero objects on the ship, in slot order.
  setCrew(heroes, progress) {
    this.clear();
    this.slots = heroes.map((hero) => ({
      hero,
      id: hero.id,
      def: ABILITIES[hero.id],
      scale: progress.abilityScale(hero.id),
      cooldown: 0,
    }));
  }

  // Every ability starts ready at the beginning of a wave.
  resetCooldowns() {
    for (const s of this.slots) s.cooldown = 0;
  }

  // Remaining cooldown as a fraction (0 = ready).
  remaining(i) {
    const s = this.slots[i];
    return s ? s.cooldown / s.def.cooldown : 0;
  }

  isReady(i) { return this.slots[i]?.cooldown <= 0; }

  // Only worth using with an enemy on screen it can reach (in range of the
  // crewmate, for the attack speed boosts; flyers in the air only count for
  // abilities with air), or what `needs` asks for: a flyer (Flock), a walker
  // (Haunt, Tidal Wave) or hull to mend (Patch Up; with Auto, only once at
  // least a full repair's worth is missing, so none of it is wasted).
  hasTarget({ hero, def }, auto = false) {
    if (def.needs === 'repairs') {
      const { ship } = this.scene;
      const missing = ship.maxHp - ship.hp;
      return auto ? missing >= ship.maxHp * def.heal : missing > 0;
    }
    const range = def.needsRange ? ABILITY_BAR.supportRange : Infinity;
    return this.targets({ air: def.air, needs: def.needs })
      .some((e) => Math.hypot(e.x - hero.x, e.y - hero.y) <= range);
  }

  // Fire ability i if it's ready and has a target. Returns whether it fired.
  trigger(i, { auto = false } = {}) {
    const s = this.slots[i];
    if (!s || s.cooldown > 0) return false;
    if (!this.hasTarget(s, auto)) {
      if (!auto) sfx.denied();
      return false;
    }
    s.cooldown = s.def.cooldown;
    sfx.ability(s.id);
    const { hero } = s;
    this.scene.floatText(hero.x, hero.y - 22, s.def.name.toUpperCase(), cssColor(s.def.color));
    ACTIONS[s.id](this, s);
    return true;
  }

  update(dt, auto) {
    for (const s of this.slots) s.cooldown = Math.max(0, s.cooldown - dt);
    this.effects = this.effects.filter((fx) => {
      if (fx.update(dt)) return true;
      fx.destroy();
      return false;
    });
    if (auto) this.slots.forEach((_, i) => this.trigger(i, { auto: true }));
  }

  // End of a wave: stop every ongoing effect.
  clear() {
    for (const fx of this.effects) fx.destroy();
    this.effects = [];
  }

  // Enemies an ability can affect: those on the lane, plus flyers in the
  // air with air; only flyers with needs 'flyers', only walkers (that can
  // be scared or pushed) with 'movable'.
  targets({ air = false, needs = null } = {}) {
    return this.scene.enemies.filter((e) => e.canBeHit(air)
      && (needs !== 'flyers' || e.def.flies)
      && (needs !== 'movable' || e.canBeMoved));
  }

  // An arcing throw of the ability's sprite from the hero at an enemy (bends
  // to another if it dies).
  lob({ hero, def }, target, { aimAt, onLand }) {
    this.scene.projectiles.push(new LobProjectile(this.scene, {
      x: hero.x, y: hero.y, target,
      flightTime: def.flightTime, arcHeight: def.arcHeight, sprite: def.sprite,
      findTarget: (x, y) => nearestLiving(this.scene.enemies, x, y, (e) => e.canBeHit(false)),
      aimAt,
      onHit: (_hit, x, y) => onLand(x, y),
    }));
  }
}

// What each ability does, by hero id: (system, slot) => void.
const ACTIONS = {
  // Rapid Fire: the Cabin Boy attacks faster for a while.
  cabinBoy(sys, { hero, def, scale }) {
    hero.addBoost(def.attackSpeed, def.duration * scale, def.fx);
  },

  // Hot Stew: a pot lobbed at the thickest crowd stuns everything it splashes.
  shipsCook(sys, slot) {
    const { hero, def, scale } = slot;
    const enemies = sys.targets();
    let best = enemies[0];
    let bestCount = -1;
    for (const e of enemies) {
      const count = enemies.filter((o) => Math.hypot(o.x - e.x, o.y - e.y) <= def.radius).length;
      if (count > bestCount || (count === bestCount && e.x < best.x)) {
        best = e;
        bestCount = count;
      }
    }
    sys.lob(slot, best, {
      aimAt: (e, ms) => hero.leadPoint(e, ms),
      onLand: (x, y) => {
        for (const e of sys.targets()) {
          if (Math.hypot(e.x - x, e.y - y) <= def.radius) e.applyStun(def.stun * scale);
        }
        playFx(sys.scene, def.impact, x, y);
        sfx.splat();
      },
    });
  },

  // Big Net: slows every enemy on screen, grounding flyers.
  netThrower(sys, { def, scale }) {
    const duration = def.duration * scale;
    for (const e of sys.targets({ air: true })) e.applySlow(def.slow, duration);
    sys.effects.push(new NetDrop(sys.scene, def, duration));
  },

  // Grog Barrel: smashes in front of the leading enemy, leaving a poison puddle.
  grogBrewer(sys, slot) {
    const { hero, def, scale } = slot;
    const { width } = fxSize(sys.scene, def.puddle);
    const lead = sys.targets().reduce((a, e) => (!a || e.x < a.x ? e : a), null);
    const spot = (x) => Math.max(LAYOUT.shipContactX + width / 2, x - width / 4);
    sys.lob(slot, lead, {
      aimAt: (e, ms) => {
        const x = spot(hero.leadPoint(e, ms).x);
        return { x, y: laneFeetY(x) - 2 };
      },
      onLand: (x, y) => {
        playFx(sys.scene, def.impact, x, y);
        sys.effects.push(new Puddle(sys, x, def, hero.damage * def.damagePerSecond, def.duration * scale));
        sfx.crash();
      },
    });
  },

  // Whale Harpoon: sweeps the whole lane, hitting every enemy once (through armour).
  harpooner(sys, { hero, def }) {
    sys.effects.push(new WhaleHarpoon(sys, def, hero.damage * def.damage));
    shake(sys.scene, def.shake);
  },

  // Hex: the Priestess casts, then curses every enemy on screen.
  voodooPriestess(sys, { hero, def, scale }) {
    sys.effects.push(new HexCast(sys, hero, def, scale));
  },

  // Broadside: cannonballs rain down spread along the lane.
  cannoneer(sys, { hero, def }) {
    sys.effects.push(new Broadside(sys, def, hero.damage * def.damage));
  },

  // Lunge: the Duelist's next hits go to the toughest enemy, all crits.
  duelist(sys, { hero, def }) {
    hero.startLunge(def.hits, hero.toughest(sys.scene.enemies), def.impact);
    sys.effects.push(new LungeMark(sys.scene, hero, def.mark));
  },

  // All Hands!: the whole crew attacks faster.
  captain(sys, { def, scale }) {
    for (const h of sys.scene.heroes) h.addBoost(def.attackSpeed, def.duration * scale, def.fx);
  },

  // Flock: a parrot homes on every flyer on screen, and more fly across the sky.
  parrotKeeper(sys, { hero, def }) {
    const damage = hero.damage * def.damage;
    for (const e of sys.targets({ air: true, needs: 'flyers' })) {
      sys.scene.projectiles.push(new Projectile(sys.scene, {
        x: hero.x, y: hero.y, target: e, speed: def.speed, sprite: def.sprite,
        onHit: (hit, x, y) => {
          hit.takeDamage(damage);
          playFx(sys.scene, def.impact, x, y);
        },
        findTarget: () => null,   // a parrot whose flyer is gone flies off
      }));
    }
    sys.effects.push(new FlockFlight(sys.scene, hero, def));
  },

  // Patch Up: mends part of the hull, with crosses rising over it.
  shipsDoctor(sys, { def }) {
    const { ship } = sys.scene;
    const healed = ship.heal(ship.maxHp * def.heal);
    sys.effects.push(new HealRise(sys.scene, def));
    const at = ship.hullTarget();
    sys.scene.floatText(at.x, at.y - def.rise, `+${fmtNumber(Math.round(healed))} HP`, cssColor(def.color));
  },

  // Deadeye: marks the toughest enemy, then one huge shot at it.
  sharpshooter(sys, { hero, def }) {
    sys.effects.push(new Deadeye(sys, hero, def));
  },

  // Haunt: every walker on screen flees back toward the island.
  ghostPirate(sys, { def, scale }) {
    for (const e of sys.targets({ needs: 'movable' })) e.applyFear(def.duration * scale);
  },

  // Tidal Wave: a wave rolls along the lane, pushing walkers back.
  stormCaller(sys, { hero, def }) {
    sys.effects.push(new TidalWave(sys, def, hero.damage * def.damage));
  },
};

// Flock's show: def.extra parrots fly from the ship across the sky (spread
// over def.spread px of height), off the right edge of the view.
class FlockFlight {
  constructor(scene, hero, def) {
    this.scene = scene;
    this.def = def;
    this.parrots = Array.from({ length: def.extra }, (_, i) => fxSprite(scene, def.sprite,
      hero.x - i * 14, hero.y - 10 - (def.spread * i) / Math.max(1, def.extra - 1)).setDepth(FX_DEPTH));
    this.parrots.forEach((p, i) => { p.climb = (i % 2 ? -1 : 1) * 6; });
  }

  update(dt) {
    const step = this.def.extraSpeed * dt / 1000;
    for (const p of this.parrots) {
      p.x += step;
      p.y -= p.climb * dt / 1000;
    }
    return this.parrots.some((p) => p.x - p.width < this.scene.view.right);
  }

  destroy() { for (const p of this.parrots) p.destroy(); }
}

// Patch Up: def.count heal_plus crosses over random spots on the hull, each
// starting def.interval ms after the last and rising def.rise px as it fades.
class HealRise {
  constructor(scene, def) {
    this.def = def;
    this.time = 0;
    this.crosses = Array.from({ length: def.count }, (_, i) => {
      const { x, y } = scene.ship.hullTarget();
      const sprite = fxSprite(scene, def.sprite, Math.round(x), Math.round(y)).setOrigin(0.5, 1)
        .setDepth(DEPTH.slotMarkers).setVisible(false);
      return { sprite, y, start: i * def.interval };
    });
  }

  update(dt) {
    this.time += dt;
    const { def } = this;
    let running = false;
    for (const c of this.crosses) {
      const t = (this.time - c.start) / def.riseMs;
      if (t < 0) {
        running = true;
        continue;
      }
      c.sprite.setVisible(t < 1);
      if (t >= 1) continue;
      running = true;
      c.sprite.setY(Math.round(c.y - def.rise * t)).setAlpha(Math.min(1, 2 * (1 - t)));
    }
    return running;
  }

  destroy() { for (const c of this.crosses) c.sprite.destroy(); }
}

// Deadeye: deadeye_mark on the toughest enemy the Sharpshooter can hit
// while he aims (def.aimMs, re-picking if it dies), then one musket shot from
// his musket at it for def.damage x his damage, ignoring armour and shields.
class Deadeye {
  constructor(sys, hero, def) {
    this.sys = sys;
    this.hero = hero;
    this.def = def;
    this.time = 0;
    this.target = hero.toughest(sys.scene.enemies);
    this.mark = fxSprite(sys.scene, def.mark, 0, 0).setOrigin(0.5).setDepth(DEPTH.enemyOverlay);
  }

  update(dt) {
    this.time += dt;
    const { hero, def } = this;
    if (!this.target?.targetable) this.target = hero.toughest(this.sys.scene.enemies);
    const e = this.target;
    if (!e) return false;
    this.mark.setPosition(Math.round(e.x), Math.round(e.y));
    if (this.time < def.aimMs) return true;
    const { scene } = this.sys;
    const { projectile } = hero.def;
    scene.projectiles.push(new Projectile(scene, {
      ...hero.muzzlePoint(), target: e, speed: def.speed, sprite: projectile.sprite, rotate: true,
      onHit: (hit, x, y) => {
        hit.takeDamage(hero.damage * def.damage, { ignoreArmor: true, throughShield: true });
        playFx(scene, projectile.impact, x, y);
        shake(scene, def.shake);
      },
      findTarget: (x, y) => nearestLiving(scene.enemies, x, y, (o) => hero.canHit(o)),
    }));
    sfx.boom();
    return false;
  }

  destroy() { this.mark.destroy(); }
}

// Tidal Wave: tidal_wave rolls right along the lane from the ship (its
// bottom def.sink px under the walkers' feet) to the far edge; each walker
// it reaches takes the damage and is pushed def.push px back.
class TidalWave {
  constructor(sys, def, damage) {
    this.sys = sys;
    this.def = def;
    this.damage = damage;
    this.sprite = fxSprite(sys.scene, def.sprite, 0, 0).setOrigin(1, 1).setDepth(DEPTH.foreground + 0.5);
    this.x = LAYOUT.shipContactX;   // the wave's front
    this.hit = new Set();
    this.update(0);
  }

  update(dt) {
    const { def } = this;
    this.x += def.speed * dt / 1000;
    for (const e of this.sys.targets({ needs: 'movable' })) {
      if (this.hit.has(e) || e.x - e.def.width / 2 > this.x) continue;
      this.hit.add(e);
      e.takeDamage(this.damage);
      e.pushBack(def.push, def.speed);
    }
    this.sprite.setPosition(Math.round(this.x), Math.round(laneFeetY(this.x) + def.sink));
    return this.x - this.sprite.width < this.sys.scene.view.right;
  }

  destroy() { this.sprite.destroy(); }
}

// A light camera shake: { duration (ms), intensity }.
function shake(scene, { duration, intensity }) {
  scene.cameras.main.shake(duration, intensity);
}

// --- Ongoing effects (update(dt) returns false when done; destroy() cleans up) ---

// Hex: hex_cast on the Priestess (its ring at her feet); curseAt ms in, every
// enemy on screen is cursed with a hex_hit burst, and its curse mark shows
// once the burst has played.
class HexCast {
  constructor(sys, hero, def, scale) {
    this.sys = sys;
    this.def = def;
    this.scale = scale;
    this.time = 0;
    this.cursed = false;
    const cast = playFx(sys.scene, def.cast, hero.x, hero.feetY);
    cast.setOrigin(0.5, (def.castRingRow + 0.5) / cast.height);
  }

  update(dt) {
    this.time += dt;
    if (this.time < this.def.curseAt) return true;
    const { def } = this;
    const burst = fxDuration(this.sys.scene, def.impact);
    for (const e of this.sys.targets({ air: true })) {
      e.applyCurse(def.bonus, def.duration * this.scale);
      e.delayCurseMark(burst);
      playFx(this.sys.scene, def.impact, e.x, e.y);
    }
    return false;
  }

  destroy() {}
}

// lunge_target looping on the Duelist's target while Lunge crits remain:
// the enemy his next shot will go to (the toughest), over its 32x32 box.
class LungeMark {
  constructor(scene, hero, sprite) {
    this.hero = hero;
    this.sprite = fxSprite(scene, sprite, 0, 0).setDepth(DEPTH.enemyOverlay);
    this.update();
  }

  update() {
    const { lunge } = this.hero;
    if (!lunge) return false;
    const e = lunge.target?.targetable ? lunge.target : this.hero.toughest(this.hero.scene.enemies);
    this.sprite.setVisible(!!e);
    if (e) {
      if (e.def.emerges) this.sprite.setOrigin(0.5).setPosition(Math.round(e.x), Math.round(e.y));
      else this.sprite.setOrigin(0.5, 1).setPosition(Math.round(e.x), Math.round(e.feetY));
    }
    return true;
  }

  destroy() { this.sprite.destroy(); }
}

// A huge net (its sheet tiled along the lane) dropping from above the view
// onto the lane, then lying there until the slow ends, fading out at the end.
class NetDrop {
  constructor(scene, def, duration) {
    this.scene = scene;
    this.def = def;
    this.duration = duration;
    this.time = 0;
    this.height = fxSize(scene, def.sprite).height;
    this.bottom = LAYOUT.waterY + 8;  // just below the walkers' feet
    const left = LAYOUT.shipContactX - 8;
    this.net = scene.add.tileSprite(left, 0, scene.view.right - left, this.height, fxKey(def.sprite), 0)
      .setOrigin(0).setDepth(FX_DEPTH - 1);
    this.update(0);
  }

  update(dt) {
    this.time += dt;
    const { def } = this;
    const drop = Math.min(1, this.time / def.dropTime);
    const top = Phaser.Math.Linear(this.scene.view.top - this.height, this.bottom - this.height, drop * drop);
    this.net.setY(Math.round(top));
    this.net.setAlpha(Phaser.Math.Clamp((this.duration - this.time) / def.fadeTime, 0, 1));
    return this.time < this.duration;
  }

  destroy() { this.net.destroy(); }
}

// The poison puddle lying on the lane while it lasts: enemies standing in it
// are poisoned. Fades out at the end.
class Puddle {
  constructor(sys, x, def, dps, duration) {
    this.sys = sys;
    this.def = def;
    this.dps = dps;
    this.x = x;
    this.time = duration;
    // Over the near water, so it shows where walkers wade.
    this.sprite = fxSprite(sys.scene, def.puddle, Math.round(x), Math.round(laneFeetY(x)))
      .setDepth(DEPTH.foreground + 0.5);
    this.half = this.sprite.width / 2;
  }

  update(dt) {
    this.time -= dt;
    for (const e of this.sys.targets()) {
      if (Math.abs(e.x - this.x) <= this.half + e.def.width / 2) e.applyPoison(this.dps, this.def.lingerTime);
    }
    this.sprite.setAlpha(Phaser.Math.Clamp(this.time / this.def.fadeTime, 0, 1));
    return this.time > 0;
  }

  destroy() { this.sprite.destroy(); }
}

// A giant harpoon skimming the lane from the ship to the far edge, turned to
// follow the lane's slope.
class WhaleHarpoon {
  constructor(sys, def, damage) {
    this.sys = sys;
    this.def = def;
    this.damage = damage;
    this.sprite = fxSprite(sys.scene, def.sprite, 0, 0).setOrigin(1, 0.5).setDepth(FX_DEPTH);
    this.length = this.sprite.width;
    this.x = LAYOUT.shipContactX - this.length;  // the tip
    this.hits = new Set();
    this.update(0);
  }

  // The tip runs at the walkers' mid-body height.
  yAt(x) { return laneFeetY(x) - 14; }

  update(dt) {
    const { def } = this;
    const fromX = this.x;
    this.x += def.speed * dt / 1000;
    for (const e of this.sys.targets()) {
      if (this.hits.has(e) || e.x - e.def.width / 2 > this.x) continue;
      this.hits.add(e);
      e.takeDamage(this.damage, { ignoreArmor: true });
      playFx(this.sys.scene, def.impact, e.x, e.y);
    }
    const y = this.yAt(this.x);
    this.sprite.setPosition(Math.round(this.x), Math.round(y));
    if (this.x > fromX) this.sprite.rotation = Math.atan2(y - this.yAt(fromX), this.x - fromX);
    return this.x - this.length < this.sys.scene.view.right;
  }

  destroy() { this.sprite.destroy(); }
}

// Cannonballs falling one after another at spots spread along the lane, each
// exploding where it lands (through armour).
class Broadside {
  constructor(sys, def, damage) {
    this.sys = sys;
    this.def = def;
    this.damage = damage;
    this.time = 0;
    const from = LAYOUT.shipContactX + def.radius / 2;
    const to = LAYOUT.enemySpawnX - 10;
    const spots = Array.from({ length: def.balls }, (_, i) => from + (to - from) * (i + 0.5) / def.balls);
    this.balls = Phaser.Utils.Array.Shuffle(spots)
      .map((x, i) => ({ x, start: i * def.interval, sprite: null, landed: false }));
  }

  update(dt) {
    this.time += dt;
    const { def } = this;
    const top = this.sys.scene.view.top - 10;
    for (const b of this.balls) {
      if (b.landed || this.time < b.start) continue;
      const t = Math.min(1, (this.time - b.start) / def.fallTime);
      const groundY = laneFeetY(b.x) - 4;
      if (t >= 1) {
        b.landed = true;
        b.sprite?.destroy();
        this.land(b.x, groundY);
        continue;
      }
      b.sprite ??= fxSprite(this.sys.scene, def.sprite, 0, 0).setDepth(FX_DEPTH);
      b.sprite.setPosition(Math.round(b.x), Math.round(Phaser.Math.Linear(top, groundY, t * t)));
    }
    return this.balls.some((b) => !b.landed);
  }

  land(x, y) {
    const { def } = this;
    for (const e of this.sys.targets()) {
      if (Math.abs(e.x - x) <= def.radius + e.def.width / 2) e.takeDamage(this.damage, { lobbed: true, ignoreArmor: true });
    }
    playFx(this.sys.scene, def.impact, x, y - 12);
    shake(this.sys.scene, def.shake);
    sfx.boom();
  }

  destroy() {
    for (const b of this.balls) b.sprite?.destroy();
  }
}
