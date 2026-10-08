import { HEROES, SPRITES } from '../config.js';
import { findAnim, sheetKey } from '../sprites.js';
import { DEPTH } from './Ship.js';
import { starLabel } from '../ui/format.js';
import { LobProjectile, nearestLiving, PiercingProjectile, Projectile } from './Projectile.js';

const BUFF_COLOR = 0xffd54f;

export class Hero {
  // damage and attackInterval come from Progress (level, stars, deck buffs).
  // The hero stands with its feet at (x, feetY); this.y is the middle of its
  // body, where shots start. labelLift raises the name label (see Ship.loadSlots).
  constructor(scene, id, { index, x, feetY, labelLift = 0 }, { damage, attackInterval, stars = 0, buffed = false }) {
    this.scene = scene;
    this.id = id;
    this.def = HEROES[id];
    this.damage = damage;
    this.attackInterval = attackInterval;
    this.cooldown = 0;

    const sprite = SPRITES.heroes[id];
    const { width } = SPRITES.placeholderHero;
    const height = sprite ? sprite.height * SPRITES.scale : SPRITES.placeholderHero.height;
    this.x = x;
    this.y = feetY - height / 2;

    // Gold glow: steady around The Captain, pulsing behind the heroes he buffs.
    this.glow = null;
    if (this.def.aura || buffed) {
      this.glow = scene.add.rectangle(x, this.y, width + 8, height + 8, BUFF_COLOR, this.def.aura ? 0.45 : 0.3)
        .setStrokeStyle(2, BUFF_COLOR, 0.9).setDepth(DEPTH.hero);
      if (buffed) scene.tweens.add({ targets: this.glow, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    }
    this.idleAnim = sprite && findAnim(scene, sprite.key, 'idle');
    this.attackAnim = sprite && findAnim(scene, sprite.key, 'attack');
    if (this.idleAnim) {
      this.body = scene.add.sprite(x, feetY, sheetKey(sprite.key)).setOrigin(0.5, 1).setScale(SPRITES.scale);
      this.playIdle(index);
      if (this.attackAnim) {
        this.body.on(`animationcomplete-${this.attackAnim}`, () => this.playIdle());
      }
    } else if (sprite) {
      this.body = scene.add.image(x, feetY, sprite.key).setOrigin(0.5, 1).setScale(SPRITES.scale);
    } else {
      this.body = scene.add.rectangle(x, feetY, width, height, this.def.color).setOrigin(0.5, 1).setStrokeStyle(2, 0x1b1b1b);
    }
    this.body.setDepth(DEPTH.hero);

    // Name on top, stars on a second line, so neighbouring labels don't collide.
    const label = stars ? `${this.def.shortName}\n${starLabel(stars)}` : this.def.shortName;
    this.label = scene.add.text(x, feetY - height - 1 - labelLift, label, {
      fontFamily: 'sans-serif', fontSize: '10px', color: '#ffffff', align: 'center',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 1).setLineSpacing(-2).setDepth(DEPTH.heroLabel);
  }

  // Loop the idle animation. When placed on the ship, the start frame is
  // staggered by slot so the crew doesn't all bob in sync.
  playIdle(slot = 0) {
    const frames = this.scene.anims.get(this.idleAnim).getTotalFrames();
    this.body.play({ key: this.idleAnim, startFrame: slot % frames });
  }

  // Returns a new projectile if the hero fired this frame.
  update(dt, enemies) {
    if (this.def.aura) return null;  // support hero: never attacks
    this.cooldown -= dt;
    if (this.cooldown > 0) return null;

    const target = this.pickTarget(enemies);
    if (!target) return null;

    this.cooldown = this.attackInterval;
    if (this.attackAnim) this.body.play(this.attackAnim);
    else this.scene.tweens.add({ targets: this.body, scaleX: this.body.scaleX * 1.2, duration: 60, yoyo: true });
    return this.fire(target);
  }

  fire(target) {
    const { def } = this;
    const common = {
      x: this.x, y: this.y, target,
      color: def.projectileColor, size: def.projectileSize,
      onHit: (hit, x, y) => this.onHit(hit, x, y),
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
  // current (possibly slowed) speed, standing still if stunned, never past the ship.
  leadPoint(enemy, msLeft) {
    const lead = enemy.isStunned ? 0
      : enemy.speed * (enemy.isSlowed ? enemy.slowFactor : 1) * msLeft / 1000;
    const minX = this.scene.ship.right + enemy.def.width / 2;
    return { x: Math.max(minX, enemy.x - lead), y: enemy.y };
  }

  // Closest living enemy to the ship that's within range. The Voodoo Priestess prefers
  // enemies that aren't cursed yet, and the Grog Brewer ones not yet
  // poisoned, so their effects spread across the wave.
  pickTarget(enemies) {
    const { curse, poison } = this.def;
    let best = null;
    let bestFresh = null;
    for (const e of enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) > this.def.range) continue;
      if (!best || e.x < best.x) best = e;
      const fresh = (curse && !e.isCursed) || (poison && !e.isPoisoned);
      if (fresh && (!bestFresh || e.x < bestFresh.x)) bestFresh = e;
    }
    return bestFresh || best;
  }

  onHit(target, x, y) {
    const { area, stun, slow, curse, poison, crit } = this.def;
    let victims;
    if (area) {
      victims = this.scene.enemies.filter((e) => e.alive && Math.hypot(e.x - x, e.y - y) <= area.radius);
      this.showAreaHit(x, y, area.radius);
    } else {
      victims = target && target.alive ? [target] : [];
    }

    for (const e of victims) {
      let damage = this.damage;
      if (crit && Math.random() < crit.chance) {
        damage *= crit.multiplier;
        this.scene.floatText(e.x, e.y - e.def.height / 2 - 26, 'CRIT!', '#ffca28');
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
      .setStrokeStyle(2, this.def.projectileColor, 0.9).setScale(0.2).setDepth(5);
    this.scene.tweens.add({
      targets: ring, scale: 1, alpha: 0, duration: 350, onComplete: () => ring.destroy(),
    });
  }

  destroy() {
    if (this.glow) {
      this.scene.tweens.killTweensOf(this.glow);
      this.glow.destroy();
    }
    this.body.destroy();
    this.label.destroy();
  }
}
