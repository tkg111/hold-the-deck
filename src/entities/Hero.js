import { HEROES } from '../config.js';
import { starLabel } from '../ui/format.js';
import { Projectile } from './Projectile.js';

export class Hero {
  constructor(scene, id, { x, y }, damage, stars = 0) {
    this.scene = scene;
    this.id = id;
    this.def = HEROES[id];
    this.damage = damage;  // set from Progress; changes with level
    this.x = x;
    this.y = y;
    this.cooldown = 0;

    this.body = scene.add.rectangle(x, y, 18, 28, this.def.color).setStrokeStyle(2, 0x1b1b1b);
    this.label = scene.add.text(x, y - 24, `${this.def.shortName}${stars ? ` ${starLabel(stars)}` : ''}`, {
      fontFamily: 'sans-serif', fontSize: '10px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
  }

  // Returns a new Projectile if the hero fired this frame.
  update(dt, enemies) {
    this.cooldown -= dt;
    if (this.cooldown > 0) return null;

    const target = this.pickTarget(enemies);
    if (!target) return null;

    this.cooldown = this.def.attackInterval;
    this.scene.tweens.add({ targets: this.body, scaleX: 1.2, duration: 60, yoyo: true });
    return new Projectile(this.scene, {
      x: this.x, y: this.y, target,
      speed: this.def.projectileSpeed,
      color: this.def.projectileColor,
      size: this.def.projectileSize,
      onHit: (hit, x, y) => this.onHit(hit, x, y),
    });
  }

  // Closest living enemy to the house that's within range. The Bomoh prefers
  // enemies that aren't cursed yet so the curse spreads across the wave.
  pickTarget(enemies) {
    let best = null;
    let bestUncursed = null;
    for (const e of enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) > this.def.range) continue;
      if (!best || e.x < best.x) best = e;
      if (!e.isCursed && (!bestUncursed || e.x < bestUncursed.x)) bestUncursed = e;
    }
    return (this.def.curse && bestUncursed) || best;
  }

  onHit(target, x, y) {
    const { area, stun, slow, curse } = this.def;
    let victims;
    if (area) {
      victims = this.scene.enemies.filter((e) => e.alive && Math.hypot(e.x - x, e.y - y) <= area.radius);
      this.showAreaHit(x, y, area.radius);
    } else {
      victims = target ? [target] : [];
    }

    for (const e of victims) {
      e.takeDamage(this.damage);
      if (!e.alive) continue;
      if (stun && Math.random() < stun.chance) e.applyStun(stun.duration);
      if (slow) e.applySlow(slow.factor, slow.duration);
      if (curse) e.applyCurse(curse.bonus, curse.duration);
    }
  }

  // Expanding net ring where an area shot lands.
  showAreaHit(x, y, radius) {
    const ring = this.scene.add.circle(x, y, radius, this.def.projectileColor, 0.15)
      .setStrokeStyle(2, this.def.projectileColor, 0.9).setScale(0.2).setDepth(5);
    this.scene.tweens.add({
      targets: ring, scale: 1, alpha: 0, duration: 350, onComplete: () => ring.destroy(),
    });
  }

  destroy() {
    this.body.destroy();
    this.label.destroy();
  }
}
