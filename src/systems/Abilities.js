import Phaser from 'phaser';
import { ABILITIES, ABILITY_BAR } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { LAYOUT, laneFeetY } from '../layout.js';
import { LobProjectile, nearestLiving } from '../entities/Projectile.js';
import { DEPTH } from '../entities/Ship.js';
import { cssColor } from '../ui/format.js';

// Above the scene's characters and foreground, under projectiles and UI.
const FX_DEPTH = 4;

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

  // Only worth using with an enemy on screen (in range of the crewmate, for
  // the attack speed boosts).
  hasTarget({ hero, def }) {
    const range = def.needsRange ? ABILITY_BAR.supportRange : Infinity;
    return this.scene.enemies.some((e) => e.targetable && Math.hypot(e.x - hero.x, e.y - hero.y) <= range);
  }

  // Fire ability i if it's ready and has a target. Returns whether it fired.
  trigger(i, { auto = false } = {}) {
    const s = this.slots[i];
    if (!s || s.cooldown > 0) return false;
    if (!this.hasTarget(s)) {
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

  // --- Shared visuals ---

  // Expanding ring (like an area hit).
  ring(x, y, radius, color, duration = 400) {
    const ring = this.scene.add.circle(x, y, radius, color, 0.2)
      .setStrokeStyle(1, color, 1).setScale(0.2).setDepth(FX_DEPTH);
    this.scene.tweens.add({ targets: ring, scale: 1, alpha: 0, duration, onComplete: () => ring.destroy() });
  }

  // Brief tint over the whole view.
  flash(color, alpha = 0.25, duration = 400) {
    const v = this.scene.view;
    const rect = this.scene.add.rectangle(v.left, v.top, v.width, v.height, color, alpha)
      .setOrigin(0).setDepth(FX_DEPTH);
    this.scene.tweens.add({ targets: rect, alpha: 0, duration, onComplete: () => rect.destroy() });
  }

  targets() { return this.scene.enemies.filter((e) => e.targetable); }

  // An arcing throw from the hero at an enemy (bends to another if it dies).
  lob(s, target, { size, aimAt, onLand }) {
    const { hero, def } = s;
    this.scene.projectiles.push(new LobProjectile(this.scene, {
      x: hero.x, y: hero.y, target,
      flightTime: def.flightTime, arcHeight: def.arcHeight, color: def.color, size,
      findTarget: (x, y) => nearestLiving(this.scene.enemies, x, y),
      aimAt,
      onHit: (_hit, x, y) => onLand(x, y),
    }));
  }
}

// What each ability does, by hero id: (system, slot) => void.
const ACTIONS = {
  // Rapid Fire: the Cabin Boy attacks faster for a while.
  cabinBoy(sys, { hero, def, scale }) {
    hero.addBoost(def.attackSpeed, def.duration * scale, def.color);
    sys.ring(hero.x, hero.y, 18, def.color);
  },

  // Hot Stew: a pot lobbed at the thickest crowd stuns everything it splashes.
  shipsCook(sys, { hero, def, scale }) {
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
    sys.lob({ hero, def }, best, {
      size: def.potSize,
      aimAt: (e, ms) => hero.leadPoint(e, ms),
      onLand: (x, y) => {
        for (const e of sys.targets()) {
          if (Math.hypot(e.x - x, e.y - y) <= def.radius) e.applyStun(def.stun * scale);
        }
        sys.ring(x, y, def.radius, def.color, 450);
        sys.effects.push(new Steam(sys.scene, x, y, def.color));
        sfx.splat();
      },
    });
  },

  // Big Net: slows every enemy on screen.
  netThrower(sys, { def, scale }) {
    for (const e of sys.targets()) e.applySlow(def.slow, def.duration * scale);
    sys.effects.push(new NetDrop(sys.scene, def));
  },

  // Grog Barrel: smashes in front of the leading enemy, leaving a poison puddle.
  grogBrewer(sys, { hero, def, scale }) {
    const lead = sys.targets().reduce((a, e) => (!a || e.x < a.x ? e : a), null);
    const spot = (x) => Math.max(LAYOUT.shipContactX + def.width / 2, x - def.width / 4);
    sys.lob({ hero, def }, lead, {
      size: def.barrelSize,
      aimAt: (e, ms) => {
        const x = spot(hero.leadPoint(e, ms).x);
        return { x, y: laneFeetY(x) - 2 };
      },
      onLand: (x) => {
        sys.effects.push(new Puddle(sys, x, def, hero.damage * def.damagePerSecond, def.duration * scale));
        sfx.crash();
      },
    });
  },

  // Whale Harpoon: sweeps the whole lane, hitting every enemy once.
  harpooner(sys, { hero, def }) {
    sys.effects.push(new WhaleHarpoon(sys, def, hero.damage * def.damage));
  },

  // Hex: curses every enemy on screen.
  voodooPriestess(sys, { def, scale }) {
    for (const e of sys.targets()) {
      e.applyCurse(def.bonus, def.duration * scale);
      sys.ring(e.x, e.y, 14, def.color, 500);
    }
    sys.flash(def.color);
  },

  // Broadside: cannonballs rain down spread along the lane.
  cannoneer(sys, { hero, def }) {
    sys.effects.push(new Broadside(sys, def, hero.damage * def.damage));
  },

  // Lunge: the Duelist's next hits go to the toughest enemy, all crits.
  duelist(sys, { hero, def }) {
    hero.startLunge(def.hits, hero.toughest(sys.scene.enemies), def.color);
    sys.effects.push(new LungeMark(sys.scene, hero, def.color));
  },

  // All Hands!: the whole crew attacks faster.
  captain(sys, { def, scale }) {
    for (const h of sys.scene.heroes) {
      h.addBoost(def.attackSpeed, def.duration * scale, def.color);
      sys.ring(h.x, h.y, 16, def.color);
    }
    sys.flash(def.color, 0.15);
  },
};

// --- Ongoing effects (update(dt) returns false when done; destroy() cleans up) ---

// Puffs of steam rising from the Hot Stew splash.
class Steam {
  constructor(scene, x, y, color) {
    this.g = scene.add.graphics().setDepth(FX_DEPTH);
    this.x = x;
    this.y = y;
    this.color = color;
    this.time = 0;
    this.life = 900;
  }

  update(dt) {
    this.time += dt;
    const t = this.time / this.life;
    const g = this.g.clear();
    for (let i = 0; i < 6; i++) {
      const px = this.x + Math.sin(i * 2.1 + t * 6) * (6 + i * 3);
      const py = this.y - t * (18 + i * 4);
      g.fillStyle(i % 2 ? 0xffffff : this.color, 1 - t).fillRect(Math.round(px), Math.round(py), 2, 2);
    }
    return t < 1;
  }

  destroy() { this.g.destroy(); }
}

// A huge net dropping over the lane, then fading.
class NetDrop {
  constructor(scene, def) {
    this.scene = scene;
    this.def = def;
    this.g = scene.add.graphics().setDepth(FX_DEPTH);
    this.time = 0;
    this.life = def.dropTime + 600;
  }

  update(dt) {
    this.time += dt;
    const { def } = this;
    const drop = Math.min(1, this.time / def.dropTime);
    const fade = 1 - Math.max(0, (this.time - def.dropTime) / (this.life - def.dropTime));
    const left = LAYOUT.shipContactX - 8;
    const right = this.scene.view.right;
    const bottom = LAYOUT.waterY + 6;
    const height = 48;
    const top = Math.round(Phaser.Math.Linear(this.scene.view.top - height, bottom - height, drop));
    const g = this.g.clear();
    g.fillStyle(def.color, 0.85 * fade);
    for (let x = left; x <= right; x += 6) g.fillRect(x, top, 1, height);
    for (let y = top; y <= top + height; y += 6) g.fillRect(left, y, right - left, 1);
    return this.time < this.life;
  }

  destroy() { this.g.destroy(); }
}

// A bubbling poison puddle on the lane: enemies standing in it are poisoned.
class Puddle {
  constructor(sys, x, def, dps, duration) {
    this.sys = sys;
    this.def = def;
    this.dps = dps;
    this.x = x;
    this.time = duration;
    this.duration = duration;
    this.g = sys.scene.add.graphics().setDepth(DEPTH.slotMarkers);
  }

  update(dt) {
    this.time -= dt;
    const { def } = this;
    const half = def.width / 2;
    for (const e of this.sys.targets()) {
      if (Math.abs(e.x - this.x) <= half + e.def.width / 2) e.applyPoison(this.dps, def.lingerTime);
    }
    // Fades out over its last half second; drawn along the lane's slope.
    const alpha = Math.min(1, this.time / 500);
    const g = this.g.clear();
    const now = this.sys.scene.time.now;
    for (let x = Math.round(this.x - half); x < this.x + half; x++) {
      const edge = 1 - Math.abs(x - this.x) / half;  // thinner towards the ends
      const y = Math.round(laneFeetY(x));
      g.fillStyle(def.color, 0.6 * alpha).fillRect(x, y - 1, 1, edge > 0.3 ? 3 : 2);
    }
    for (let i = 0; i < 5; i++) {
      const phase = (now / 600 + i / 5) % 1;
      const bx = Math.round(this.x + Math.sin(i * 3.7) * half * 0.8);
      g.fillStyle(def.color, alpha * (1 - phase)).fillRect(bx, Math.round(laneFeetY(bx) - 2 - phase * 8), 1, 1);
    }
    return this.time > 0;
  }

  destroy() { this.g.destroy(); }
}

// A giant harpoon skimming the lane from the ship to the far edge.
class WhaleHarpoon {
  constructor(sys, def, damage) {
    this.sys = sys;
    this.def = def;
    this.damage = damage;
    this.x = LAYOUT.shipContactX - def.length;  // the tip
    this.hits = new Set();
    this.g = sys.scene.add.graphics().setDepth(FX_DEPTH);
  }

  update(dt) {
    const { def } = this;
    this.x += def.speed * dt / 1000;
    for (const e of this.sys.targets()) {
      if (this.hits.has(e) || e.x - e.def.width / 2 > this.x) continue;
      this.hits.add(e);
      e.takeDamage(this.damage);
      this.sys.ring(e.x, e.y, 8, def.color, 250);
    }
    const tip = Math.round(this.x);
    const y = Math.round(laneFeetY(this.x) - 14);
    const g = this.g.clear();
    g.fillStyle(0x37474f).fillRect(tip - def.length, y - 2, def.length, 4);   // outline
    g.fillStyle(def.color).fillRect(tip - def.length + 1, y - 1, def.length - 2, 2);
    for (let i = 0; i < 6; i++) g.fillRect(tip + i, y - 3 + Math.ceil(i / 2), 1, 7 - 2 * Math.ceil(i / 2));  // head
    g.fillStyle(0xffffff, 0.5).fillRect(tip - def.length - 24, y, 24, 1);  // wake
    return tip - def.length < this.sys.scene.view.right;
  }

  destroy() { this.g.destroy(); }
}

// Cannonballs falling one after another at spots spread along the lane.
class Broadside {
  constructor(sys, def, damage) {
    this.sys = sys;
    this.def = def;
    this.damage = damage;
    this.time = 0;
    const from = LAYOUT.shipContactX + def.radius / 2;
    const to = LAYOUT.enemySpawnX - 10;
    const spots = Array.from({ length: def.balls }, (_, i) => from + (to - from) * (i + 0.5) / def.balls);
    this.balls = Phaser.Utils.Array.Shuffle(spots).map((x, i) => ({ x, start: i * def.interval, landed: false }));
    this.g = sys.scene.add.graphics().setDepth(FX_DEPTH);
  }

  update(dt) {
    this.time += dt;
    const { def } = this;
    const g = this.g.clear();
    const top = this.sys.scene.view.top - 10;
    for (const b of this.balls) {
      if (b.landed || this.time < b.start) continue;
      const t = Math.min(1, (this.time - b.start) / def.fallTime);
      const groundY = laneFeetY(b.x) - 4;
      if (t >= 1) {
        b.landed = true;
        this.land(b.x, groundY);
        continue;
      }
      // Shadow growing on the lane, the ball dropping onto it.
      const shadow = Math.round(2 + t * def.ballSize);
      g.fillStyle(0x000000, 0.35).fillRect(Math.round(b.x - shadow), Math.round(groundY + 3), shadow * 2, 1);
      const y = Phaser.Math.Linear(top, groundY, t * t);
      g.fillStyle(0x263238).fillCircle(Math.round(b.x), Math.round(y), def.ballSize);
    }
    return this.balls.some((b) => !b.landed);
  }

  land(x, y) {
    const { def } = this;
    for (const e of this.sys.targets()) {
      if (Math.abs(e.x - x) <= def.radius + e.def.width / 2) e.takeDamage(this.damage);
    }
    this.sys.ring(x, y, def.radius, def.color, 400);
    this.sys.scene.cameras.main.shake(60, 0.002);
    sfx.boom();
  }

  destroy() { this.g.destroy(); }
}

// Red brackets on the Duelist's Lunge target while the Lunge lasts.
class LungeMark {
  constructor(scene, hero, color) {
    this.hero = hero;
    this.color = color;
    this.g = scene.add.graphics().setDepth(FX_DEPTH);
  }

  update() {
    const g = this.g.clear();
    const lunge = this.hero.lunge;
    if (!lunge) return false;
    const e = lunge.target;
    if (e?.alive) {
      const w = Math.round(e.def.width / 2) + 3;
      const h = Math.round(e.def.height / 2) + 3;
      const x = Math.round(e.x);
      const y = Math.round(e.y);
      g.fillStyle(this.color);
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          const cx = sx < 0 ? x - w : x + w - 1;
          const cy = sy < 0 ? y - h : y + h - 1;
          g.fillRect(sx < 0 ? cx : cx - 3, cy, 4, 1);
          g.fillRect(cx, sy < 0 ? cy : cy - 3, 1, 4);
        }
      }
    }
    return true;
  }

  destroy() { this.g.destroy(); }
}
