import { FX, HEROES, SPRITES } from '../config.js';
import { laneFeetY } from '../layout.js';
import { FX_DEPTH, fxSprite, playFx } from '../fx.js';
import { findAnim, sheetKey } from '../sprites.js';
import { DEPTH } from './Ship.js';
import { LobProjectile, nearestLiving, PiercingProjectile, Projectile } from './Projectile.js';

export class Hero {
  // damage and attackInterval come from Progress (level, stars, deck buffs).
  // The hero stands with its feet at (x, feetY); this.y is the middle of its
  // body, where shots start.
  constructor(scene, id, { index, x, feetY }, { damage, attackInterval, buffed = false }) {
    this.scene = scene;
    this.id = id;
    this.def = HEROES[id];
    this.damage = damage;
    this.attackInterval = attackInterval;
    this.cooldown = 0;
    // Abilities: attack speed boosts ({ mult, time, fx } with time in ms left
    // and fx the sprite shown while it lasts) and The Duelist's Lunge
    // ({ hits } left, each a guaranteed crit on the toughest enemy, and the
    // impact played on each).
    this.boosts = [];
    this.lunge = null;
    this.boostSprites = {};   // fx sprite name -> sprite

    const sprite = SPRITES.heroes[id];
    const { width } = SPRITES.placeholderHero;
    const height = sprite ? sprite.height : SPRITES.placeholderHero.height;
    this.x = x;
    this.feetY = feetY;
    this.y = feetY - height / 2;

    // Buff ring under the feet while boosted: always for a hero The Captain
    // buffs (deck buff), and while an ability boost lasts. The Captain
    // himself stands on a still, dimmed one otherwise (the buff's source).
    this.buffed = buffed;
    this.buffRing = null;
    this.buffRingMode = null;   // "boosted", "source" or null
    this.syncBuffRing();
    this.idleAnim = sprite && findAnim(scene, sprite.key, 'idle');
    this.attackAnim = sprite && findAnim(scene, sprite.key, 'attack');
    if (this.idleAnim) {
      this.body = scene.add.sprite(x, feetY, sheetKey(sprite.key)).setOrigin(0.5, 1);
      this.playIdle(index);
      if (this.attackAnim) {
        this.body.on(`animationcomplete-${this.attackAnim}`, () => this.playIdle());
      }
    } else if (sprite) {
      this.body = scene.add.image(x, feetY, sprite.key).setOrigin(0.5, 1);
    } else {
      this.body = scene.add.rectangle(x, feetY, width, height, this.def.color).setOrigin(0.5, 1).setStrokeStyle(1, 0x1b1b1b);
    }
    this.body.setDepth(DEPTH.hero);
  }

  // --- Abilities ---

  // fx: { sprite, behind } — an fx sheet standing on the hero's slot while the
  // boost lasts, behind the hero or (default) over them.
  addBoost(mult, duration, fx) {
    this.boosts.push({ mult, time: duration, fx });
    const name = fx.sprite;
    if (!this.boostSprites[name]) {
      this.boostSprites[name] = fxSprite(this.scene, name, this.x, this.feetY).setOrigin(0.5, 1)
        .setDepth(fx.behind ? DEPTH.hero - 0.5 : DEPTH.slotMarkers);
    }
    this.syncBuffRing();
  }

  startLunge(hits, target, impact) {
    this.lunge = { hits, target, impact };
    this.cooldown = 0;  // first lunge straight away
  }

  syncBuffRing() {
    const boosted = this.buffed || this.boosts.length > 0;
    const mode = boosted ? 'boosted' : this.def.aura ? 'source' : null;
    if (mode === this.buffRingMode) return;
    this.buffRingMode = mode;
    if (!mode) {
      this.buffRing?.destroy();
      this.buffRing = null;
      return;
    }
    const { sprite, footRow, sourceAlpha } = FX.buffRing;
    if (!this.buffRing) {
      this.buffRing = fxSprite(this.scene, sprite, this.x, this.feetY);
      this.buffRing.setOrigin(0.5, (footRow + 0.5) / this.buffRing.height).setDepth(DEPTH.hero - 0.6);
    }
    if (mode === 'boosted') {
      this.buffRing.setAlpha(1).play(this.buffRing.texture.key);
    } else {
      this.buffRing.setAlpha(sourceAlpha).stop();
      this.buffRing.setFrame(0);
    }
  }

  // End of a wave: boosts and Lunge end with it.
  clearAbilities() {
    this.boosts = [];
    this.lunge = null;
    this.tickAbilities(0);
  }

  get speedMult() {
    return this.boosts.reduce((m, b) => m * b.mult, 1);
  }

  tickAbilities(dt) {
    for (const b of this.boosts) b.time -= dt;
    this.boosts = this.boosts.filter((b) => b.time > 0);
    for (const [name, sprite] of Object.entries(this.boostSprites)) {
      if (this.boosts.some((b) => b.fx.sprite === name)) continue;
      sprite.destroy();
      delete this.boostSprites[name];
    }
    this.syncBuffRing();
  }

  // The enemy with the most HP left (Lunge's target).
  toughest(enemies) {
    let best = null;
    for (const e of enemies) if (e.targetable && (!best || e.hp > best.hp)) best = e;
    return best;
  }

  // Loop the idle animation. When placed on the ship, the start frame is
  // staggered by slot so the crew doesn't all bob in sync.
  playIdle(slot = 0) {
    const frames = this.scene.anims.get(this.idleAnim).getTotalFrames();
    this.body.play({ key: this.idleAnim, startFrame: slot % frames });
  }

  // Returns a new projectile if the hero fired this frame.
  update(dt, enemies) {
    this.tickAbilities(dt);
    if (this.def.aura) return null;  // support hero: never attacks
    this.cooldown -= dt * this.speedMult;
    if (this.cooldown > 0) return null;

    const lunging = this.lunge != null;
    const target = lunging ? this.toughest(enemies) : this.pickTarget(enemies);
    if (!target) return null;

    this.cooldown = this.attackInterval;
    if (this.attackAnim) this.body.play(this.attackAnim);
    else this.scene.tweens.add({ targets: this.body, scaleX: this.body.scaleX * 1.2, duration: 60, yoyo: true });
    let lunge = null;
    if (lunging) {
      lunge = this.lunge;
      lunge.target = target;
      if (--lunge.hits <= 0) this.lunge = null;
    }
    return this.fire(target, lunge);
  }

  // lunge: set for a Lunge shot, which always crits (for heroes that can
  // crit) and plays its impact on the target.
  fire(target, lunge = null) {
    const { def } = this;
    const common = {
      x: this.x, y: this.y, target,
      sprite: def.projectile.sprite, rotate: def.projectile.rotate,
      onHit: (hit, x, y) => this.onHit(hit, x, y, lunge),
      // Used when the target dies mid-flight.
      findTarget: (x, y) => nearestLiving(this.scene.enemies, x, y),
    };
    if (def.lob) {
      return new LobProjectile(this.scene, {
        ...common,
        flightTime: def.lob.flightTime, arcHeight: def.lob.arcHeight,
        aimAt: (enemy, msLeft) => this.leadPoint(enemy, msLeft),
      });
    }
    if (def.pierce) {
      return new PiercingProjectile(this.scene, {
        ...common, ...def.pierce,
        speed: def.projectileSpeed,
        enemies: () => this.scene.enemies,
      });
    }
    return new Projectile(this.scene, { ...common, speed: def.projectileSpeed });
  }

  // Where an enemy will be after msLeft, for lobbed shots: walking left at its
  // current (possibly slowed) speed, standing still if stunned, never past where
  // it stops. Walkers follow the lane up or down.
  leadPoint(enemy, msLeft) {
    const lead = enemy.isStunned ? 0
      : enemy.speed * (enemy.isSlowed ? enemy.slowFactor : 1) * msLeft / 1000;
    const x = Math.max(enemy.stopX, enemy.x - lead);
    const y = enemy.def.emerges ? enemy.y : laneFeetY(x) - enemy.def.height / 2;
    return { x, y };
  }

  // Closest living enemy to the ship that's within range. The Voodoo Priestess prefers
  // enemies that aren't cursed yet, and the Grog Brewer ones not yet
  // poisoned, so their effects spread across the wave.
  pickTarget(enemies) {
    const { curse, poison } = this.def;
    let best = null;
    let bestFresh = null;
    for (const e of enemies) {
      if (!e.targetable) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) > this.def.range) continue;
      if (!best || e.x < best.x) best = e;
      const fresh = (curse && !e.isCursed) || (poison && !e.isPoisoned);
      if (fresh && (!bestFresh || e.x < bestFresh.x)) bestFresh = e;
    }
    return bestFresh || best;
  }

  // The shot landed at (x, y): its impact plays there, then damage and
  // effects go to the target (or everything in the area).
  onHit(target, x, y, lunge = null) {
    const { area, stun, slow, curse, poison, crit } = this.def;
    playFx(this.scene, this.def.projectile.impact, x, y);
    const victims = area
      ? this.scene.enemies.filter((e) => e.targetable && Math.hypot(e.x - x, e.y - y) <= area.radius)
      : (target && target.targetable ? [target] : []);

    for (const e of victims) {
      let damage = this.damage;
      if (crit && (lunge || Math.random() < crit.chance)) {
        damage *= crit.multiplier;
        this.scene.floatText(e.x, e.y - e.def.height / 2 - 13, 'CRIT!', '#ffca28');
      }
      if (lunge) playFx(this.scene, lunge.impact, e.x, e.y, FX_DEPTH + 1);
      e.takeDamage(damage);
      if (!e.alive) continue;
      if (stun && Math.random() < stun.chance) e.applyStun(stun.duration);
      if (slow) e.applySlow(slow.factor, slow.duration);
      if (curse) e.applyCurse(curse.bonus, curse.duration);
      if (poison) e.applyPoison(this.damage * poison.ratio, poison.duration);
    }
  }

  destroy() {
    this.buffRing?.destroy();
    for (const sprite of Object.values(this.boostSprites)) sprite.destroy();
    this.body.destroy();
  }
}
