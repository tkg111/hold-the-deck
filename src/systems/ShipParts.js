import Phaser from 'phaser';
import { PARTS } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { DEPTH } from '../entities/Ship.js';
import { LobProjectile, nearestLiving, PiercingProjectile } from '../entities/Projectile.js';
import { FX_DEPTH, fxSprite, playFx } from '../fx.js';
import { LAYOUT, laneFeetY } from '../layout.js';
import { fxKey } from '../sprites.js';
import { partValue } from './Parts.js';

const FX = PARTS.effects;

// The Heartwood Cannons' frozen log: drawn here (the parts art has none) as
// an "fx" texture, so projectiles can fly it like any shot. O outline, b / B
// bark, r ring, i / I ice.
const LOG_ART = [
  '..OOOOOOOOOO..',
  '.ObBbbbBbbiIO.',
  'ObbbbBbbbbirIO',
  'OBbbbbbbBbirIO',
  '.ObbBbbbbbiIO.',
  '..OOOOOOOOOO..',
];
const LOG_COLORS = {
  O: 0x1a1014, b: 0x6a4a36, B: 0x9a7050, r: 0x3a2a20, i: 0xcfe6f0, I: 0xe8f4f8,
};
export const LOG_SPRITE = 'frozen_log';

// Make the log's texture once (in the game; the balance sim has no textures).
export function makePartTextures(scene) {
  const key = fxKey(LOG_SPRITE);
  if (scene.textures.exists(key) || !scene.make?.graphics) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  LOG_ART.forEach((row, y) => [...row].forEach((c, x) => {
    if (LOG_COLORS[c] != null) g.fillStyle(LOG_COLORS[c]).fillRect(x, y, 1, 1);
  }));
  g.generateTexture(key, LOG_ART[0].length, LOG_ART.length);
  g.destroy();
}

// The equipped ship parts in battle (PARTS.effects): the figureheads'
// tentacle and charm and the cannons' shots on their timers, the Frostwing
// Sails' chill near the ship, and the Magma Cannons' fire puddles. The
// Ghostweave Sails work through the crew's attack speed (Progress.deckBuffs)
// and the Blackbones' Lantern through gold and the fog (Progress.goldMult,
// Mists). Runs on the battle's dt; with nothing equipped it does nothing.
export class ShipParts {
  constructor(scene) {
    this.scene = scene;
    this.levels = {};     // equipped part id -> level, for this wave
    this.timers = {};     // timed part id -> ms until it may fire
    this.puddles = [];
    this.slaps = [];      // tentacles showing: { g, time }
    makePartTextures(scene);
  }

  // A wave starts with what's on the ship now.
  start(progress) {
    this.stop();
    this.levels = progress.equippedLevels;
    for (const id of Object.keys(this.levels)) if (FX[id]?.every) this.timers[id] = FX[id].every;
  }

  level(id) { return this.levels[id] ?? 0; }

  update(dt) {
    if (this.level('frostwing_sails')) this.chill();
    for (const id of Object.keys(this.timers)) {
      this.timers[id] = Math.max(0, this.timers[id] - dt);
      if (this.timers[id] <= 0 && this.fire(id)) this.timers[id] = FX[id].every;
    }
    if (this.puddles.length) {
      this.puddles = this.puddles.filter((p) => {
        if (p.update(dt)) return true;
        p.destroy();
        return false;
      });
    }
    if (this.slaps.length) {
      this.slaps = this.slaps.filter((s) => {
        s.time -= dt;
        s.g.setAlpha(Phaser.Math.Clamp(s.time / FX.kraken_figurehead.slapMs, 0, 1));
        if (s.time > 0) return true;
        s.g.destroy();
        return false;
      });
    }
  }

  // The wave is over.
  stop() {
    this.levels = {};
    this.timers = {};
    for (const p of this.puddles) p.destroy();
    this.puddles = [];
    for (const s of this.slaps) s.g.destroy();
    this.slaps = [];
  }

  // --- Targets ---

  get enemies() { return this.scene.enemies; }

  // The enemy nearest the ship (lowest x) that passes `ok`.
  frontmost(ok) {
    let best = null;
    for (const e of this.enemies) if (e.alive && !e.def.hazard && ok(e) && (!best || e.x < best.x)) best = e;
    return best;
  }

  // The hardest-hitting crewmate's damage (cannon shots scale with it).
  get strongestDamage() {
    let best = 0;
    for (const h of this.scene.heroes) if (!h.def.aura) best = Math.max(best, h.damage);
    return best;
  }

  // A random cannon port, in scene pixels.
  port() {
    const { x, y } = PARTS.ports;
    return { x: LAYOUT.shipX + x[Math.floor(Math.random() * x.length)], y: LAYOUT.shipY + y };
  }

  get bow() { return { x: LAYOUT.shipX + PARTS.bow.x, y: LAYOUT.shipY + PARTS.bow.y }; }

  // Fire a timed part if it has a target; returns whether it did.
  fire(id) {
    const level = this.level(id);
    switch (id) {
      case 'kraken_figurehead': return this.grab(level);
      case 'siren_figurehead': return this.charm(level);
      case 'magma_cannons': return this.lavaShot(level);
      case 'heartwood_cannons': return this.frozenLog(level);
      default: return false;
    }
  }

  // --- The parts ---

  // Within px of where walkers stop (an enemy's front edge).
  near(e, px) { return e.x - e.def.width / 2 - LAYOUT.shipContactX <= px; }

  // Kraken Figurehead: a tentacle grabs the most dangerous enemy near the
  // ship (an Elite, then a Keg Runner, then a flyer, else the frontmost),
  // stunning it and hitting it for a share of the strongest crewmate's DMG.
  grab(level) {
    const spec = FX.kraken_figurehead;
    const near = (e) => e.targetable && !e.isCharmed && this.near(e, spec.range);
    const target = this.frontmost((e) => near(e) && e.elite)
      ?? this.frontmost((e) => near(e) && !!e.def.blast)
      ?? this.frontmost((e) => near(e) && !!e.def.flies)
      ?? this.frontmost(near);
    if (!target) return false;
    target.applyStun(spec.stun + (level - 1) * spec.stunPerLevel);
    const damage = partValue(spec.damageAtMax, level) * this.strongestDamage;
    if (damage > 0) target.takeDamage(damage);
    this.drawTentacle(target);
    playFx(this.scene, 'hit_spark', Math.round(target.x), Math.round(target.y));
    if (target.body?.setTintFill) {
      target.setFlash(true);
      this.scene.time.delayedCall(spec.slapMs / 2, () => target.alive && target.setFlash(false));
    }
    sfx.splat();
    return true;
  }

  // A tentacle curling from the bow to the enemy, in pixel squares, fading
  // out over slapMs.
  drawTentacle(target) {
    const spec = FX.kraken_figurehead;
    const from = this.bow;
    const to = { x: target.x, y: target.y };
    const mid = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 30 };
    const g = this.scene.add.graphics().setDepth(FX_DEPTH - 0.5);
    const len = Math.hypot(to.x - from.x, to.y - from.y) + 40;
    const steps = Math.max(8, Math.round(len));
    const point = (t) => ({
      x: (1 - t) ** 2 * from.x + 2 * (1 - t) * t * mid.x + t * t * to.x,
      y: (1 - t) ** 2 * from.y + 2 * (1 - t) * t * mid.y + t * t * to.y,
    });
    // Thick at the bow, thin at the tip: the outline first, then the flesh.
    for (const [color, grow] of [[spec.edge, 1], [spec.color, 0]]) {
      g.fillStyle(color, 1);
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const { x, y } = point(t);
        const r = Math.max(1, Math.round(3 * (1 - t))) + grow;
        g.fillRect(Math.round(x) - r, Math.round(y) - r, r * 2, r * 2);
      }
    }
    this.slaps.push({ g, time: spec.slapMs });
  }

  // Siren Figurehead: charms the frontmost walker (not a boss).
  charm(level) {
    const spec = FX.siren_figurehead;
    const target = this.frontmost((e) => e.canBeCharmed && !e.isCharmed);
    if (!target) return false;
    const hit = target.def.damage * target.hpMultiplier * spec.hitScale;
    if (!target.charm(spec.charm + (level - 1) * spec.charmPerLevel, hit)) return false;
    playFx(this.scene, 'charm_note', Math.round(target.x), Math.round(target.y));
    sfx.charm();
    return true;
  }

  // Frostwing Sails: enemies near the ship are slowed (bosses less), the
  // rest not.
  chill() {
    const spec = FX.frostwing_sails;
    const slow = partValue(spec.slowAtMax, this.level('frostwing_sails'));
    for (const e of this.enemies) {
      const near = e.alive && this.near(e, spec.range);
      e.partSlow = near ? 1 - slow * (e.def.boss ? e.def.statusResist ?? 1 : 1) : 1;
    }
  }

  // Magma Cannons: a lava shot lobbed from a port at the frontmost enemy on
  // the lane, leaving a fire puddle where it lands.
  lavaShot(level) {
    const spec = FX.magma_cannons;
    const canHit = (e) => e.canBeHit(false);
    const target = this.frontmost(canHit);
    const damage = partValue(spec.damageAtMax, level) * this.strongestDamage;
    if (!target || damage <= 0) return false;
    const { x, y } = this.port();
    this.scene.projectiles.push(new LobProjectile(this.scene, {
      x, y, target, flightTime: spec.flightTime, arcHeight: spec.arcHeight, sprite: spec.shot,
      aimAt: (t) => ({ x: t.x, y: t.y }),
      findTarget: (fx, fy) => nearestLiving(this.enemies, fx, fy, canHit),
      onHit: (hit, hx, hy) => {
        playFx(this.scene, spec.impact, Math.round(hx), Math.round(hy));
        if (hit?.alive && canHit(hit)) hit.takeDamage(damage);
        this.puddles.push(new BurningPuddle(this.scene, hx, damage * spec.puddleDps, spec));
      },
    }));
    playFx(this.scene, 'muzzle_flash', x, y);
    sfx.spit();
    return true;
  }

  // Heartwood Cannons: a frozen log from a port skims along the lane,
  // hitting the first few enemies and slowing them.
  frozenLog(level) {
    const spec = FX.heartwood_cannons;
    const canHit = (e) => e.canBeHit(false);
    const target = this.frontmost(canHit);
    const damage = partValue(spec.damageAtMax, level) * this.strongestDamage;
    if (!target || damage <= 0) return false;
    const { x, y } = this.port();
    this.scene.projectiles.push(new PiercingProjectile(this.scene, {
      x, y, target, speed: spec.speed, sprite: LOG_SPRITE,
      length: spec.length, maxTargets: spec.targets, hitRadius: spec.hitRadius,
      enemies: () => this.enemies,
      canHit,
      findTarget: (fx, fy) => nearestLiving(this.enemies, fx, fy, canHit),
      onHit: (hit) => {
        playFx(this.scene, spec.impact, Math.round(hit.x), Math.round(hit.y));
        hit.takeDamage(damage);
        if (hit.alive) hit.applyChill(spec.slow, spec.slowMs);
      },
    }));
    playFx(this.scene, 'muzzle_flash', x, y);
    sfx.frostHit();
    return true;
  }
}

// The Magma Cannons' fire puddle: fire_puddle on the lane for puddleMs,
// burning ground enemies standing in it for dps damage per second; fades
// out over its last puddleFadeMs.
class BurningPuddle {
  constructor(scene, x, dps, spec) {
    this.scene = scene;
    this.spec = spec;
    this.x = x;
    this.dps = dps;
    this.time = spec.puddleMs;
    this.sprite = fxSprite(scene, spec.puddle, Math.round(x), Math.round(laneFeetY(x)))
      .setDepth(DEPTH.foreground + 0.5);
    this.half = this.sprite.width / 2;
  }

  update(dt) {
    this.time -= dt;
    for (const e of this.scene.enemies) {
      if (!e.alive || !e.canBeHit(false) || e.def.flies) continue;
      if (Math.abs(e.x - this.x) <= this.half + e.def.width / 2) {
        e.takeDamage(this.dps * dt / 1000, { flash: false, dot: true });
      }
    }
    this.sprite.setAlpha(Phaser.Math.Clamp(this.time / this.spec.puddleFadeMs, 0, 1));
    return this.time > 0;
  }

  destroy() { this.sprite.destroy(); }
}
