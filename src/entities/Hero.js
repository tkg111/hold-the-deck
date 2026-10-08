import { HEROES } from '../config.js';
import { Projectile } from './Projectile.js';

export class Hero {
  constructor(scene, id, { x, y }, damage) {
    this.scene = scene;
    this.id = id;
    this.def = HEROES[id];
    this.damage = damage;  // set from Progress; changes with level
    this.x = x;
    this.y = y;
    this.cooldown = 0;

    this.body = scene.add.rectangle(x, y, 18, 28, this.def.color).setStrokeStyle(2, 0x1b3d1d);
    this.label = scene.add.text(x, y - 24, this.def.name, {
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
      damage: this.damage,
      speed: this.def.projectileSpeed,
      color: this.def.projectileColor,
      size: this.def.projectileSize,
    });
  }

  // Closest living enemy to the house that's within range.
  pickTarget(enemies) {
    let best = null;
    for (const e of enemies) {
      if (!e.alive) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) > this.def.range) continue;
      if (!best || e.x < best.x) best = e;
    }
    return best;
  }
}
