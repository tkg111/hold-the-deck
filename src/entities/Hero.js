import { HEROES, SPRITES } from '../config.js';
import { laneFeetY } from '../layout.js';
import { findAnim, sheetKey } from '../sprites.js';
import { DEPTH } from './Ship.js';
import { LobProjectile, nearestLiving, PiercingProjectile, Projectile } from './Projectile.js';

const BUFF_COLOR = 0xffd54f;

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
    // Abilities: attack speed boosts ({ mult, time } with time in ms left)
    // and The Duelist's Lunge ({ hits } left, each a guaranteed crit on the
    // toughest enemy; target is the one it last aimed at).
    this.boosts = [];
    this.lunge = null;

    const sprite = SPRITES.heroes[id];
    const { width } = SPRITES.placeholderHero;
    const height = sprite ? sprite.height : SPRITES.placeholderHero.height;
    this.x = x;
    this.y = feetY - height / 2;

    // Gold glow: steady around The Captain, pulsing behind the heroes he buffs.
    this.glow = null;
    if (this.def.aura || buffed) {
      this.glow = scene.add.rectangle(x, this.y, width + 4, height + 4, BUFF_COLOR, this.def.aura ? 0.45 : 0.3)
        .setStrokeStyle(1, BUFF_COLOR, 0.9).setDepth(DEPTH.hero);
      if (buffed) scene.tweens.add({ targets: this.glow, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    }
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

    // Pulsing outline while an ability is boosting this hero.
    this.fxGlow = scene.add.rectangle(x, this.y, width + 6, height + 6)
      .setStrokeStyle(1, BUFF_COLOR, 1).setDepth(DEPTH.slotMarkers).setVisible(false);
  }

  // --- Abilities ---

  addBoost(mult, duration, color) {
    this.boosts.push({ mult, time: duration, color });
  }

  startLunge(hits, target, color) {
    this.lunge = { hits, target, color };
    this.cooldown = 0;  // first lunge straight away
  }

  // End of a wave: boosts and Lunge end with it.
  clearAbilities() {
    this.boosts = [];
    this.lunge = null;
    this.fxGlow.setVisible(false);
  }

  get speedMult() {
    return this.boosts.reduce((m, b) => m * b.mult, 1);
  }

  tickAbilities(dt) {
    for (const b of this.boosts) b.time -= dt;
    this.boosts = this.boosts.filter((b) => b.time > 0);
    const color = this.lunge?.color ?? this.boosts[this.boosts.length - 1]?.color;
    this.fxGlow.setVisible(color != null);
    if (color != null) {
      this.fxGlow.setStrokeStyle(1, color, 0.55 + 0.45 * Math.sin(this.scene.time.now / 90));
    }
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
    if (lunging) {
      this.lunge.target = target;
      if (--this.lunge.hits <= 0) this.lunge = null;
    }
    return this.fire(target, lunging);
  }

  // forceCrit: a Lunge shot, always a crit (for heroes that can crit).
  fire(target, forceCrit = false) {
    const { def } = this;
    const common = {
      x: this.x, y: this.y, target,
      color: def.projectileColor, size: def.projectileSize,
      onHit: (hit, x, y) => this.onHit(hit, x, y, forceCrit),
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

  onHit(target, x, y, forceCrit = false) {
    const { area, stun, slow, curse, poison, crit } = this.def;
    let victims;
    if (area) {
      victims = this.scene.enemies.filter((e) => e.targetable && Math.hypot(e.x - x, e.y - y) <= area.radius);
      this.showAreaHit(x, y, area.radius);
    } else {
      victims = target && target.targetable ? [target] : [];
    }

    for (const e of victims) {
      let damage = this.damage;
      if (crit && (forceCrit || Math.random() < crit.chance)) {
        damage *= crit.multiplier;
        this.scene.floatText(e.x, e.y - e.def.height / 2 - 13, 'CRIT!', '#ffca28');
      }
      e.takeDamage(damage);
      if (!e.alive) continue;
      if (stun && Math.random() < stun.chance) e.applyStun(stun.duration);
      if (slow) e.applySlow(slow.factor, slow.duration);
      if (curse) e.applyCurse(curse.bonus, curse.duration);
      if (poison) e.applyPoison(this.damage * poison.ratio, poison.duration);
    }
  }

  // Expanding ring where an area shot lands.
  showAreaHit(x, y, radius) {
    const ring = this.scene.add.circle(x, y, radius, this.def.projectileColor, 0.15)
      .setStrokeStyle(1, this.def.projectileColor, 0.9).setScale(0.2).setDepth(5);
    this.scene.tweens.add({
      targets: ring, scale: 1, alpha: 0, duration: 350, onComplete: () => ring.destroy(),
    });
  }

  destroy() {
    if (this.glow) {
      this.scene.tweens.killTweensOf(this.glow);
      this.glow.destroy();
    }
    this.fxGlow.destroy();
    this.body.destroy();
  }
}
