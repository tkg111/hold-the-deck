// Homing shot: flies toward its target and calls onHit(target, x, y) on arrival.
// If the target dies mid-flight, the shot keeps going to where the target was
// and calls onHit with target = null (area shots still land; single shots fizzle).
export class Projectile {
  constructor(scene, { x, y, target, speed, color, size, onHit }) {
    this.target = target;
    this.speed = speed;
    this.onHit = onHit;
    this.done = false;
    this.destX = target.x;
    this.destY = target.y;
    this.sprite = scene.add.circle(x, y, size, color).setDepth(5);
  }

  update(dt) {
    if (this.done) return;
    if (this.target && this.target.alive) {
      this.destX = this.target.x;
      this.destY = this.target.y;
    } else {
      this.target = null;
    }

    const dx = this.destX - this.sprite.x;
    const dy = this.destY - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt / 1000;

    if (dist <= step) {
      this.onHit(this.target, this.destX, this.destY);
      this.destroy();
      return;
    }
    this.sprite.x += dx / dist * step;
    this.sprite.y += dy / dist * step;
  }

  destroy() {
    this.done = true;
    this.sprite.destroy();
  }
}

// Arcing shot that lands at a fixed point after flightTime, then calls
// onHit(null, x, y). Used with an area effect.
export class LobProjectile {
  constructor(scene, { x, y, destX, destY, flightTime, arcHeight, color, size, onHit }) {
    this.startX = x;
    this.startY = y;
    this.destX = destX;
    this.destY = destY;
    this.flightTime = flightTime;
    this.arcHeight = arcHeight;
    this.onHit = onHit;
    this.elapsed = 0;
    this.done = false;
    // Spiky look: a dark outline around the fruit.
    this.sprite = scene.add.star(x, y, 7, size * 0.7, size, color).setStrokeStyle(2, 0x33691e).setDepth(5);
  }

  update(dt) {
    if (this.done) return;
    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / this.flightTime);
    this.sprite.x = this.startX + (this.destX - this.startX) * t;
    this.sprite.y = this.startY + (this.destY - this.startY) * t - this.arcHeight * 4 * t * (1 - t);
    this.sprite.angle += dt * 0.3;
    if (t >= 1) {
      this.onHit(null, this.destX, this.destY);
      this.destroy();
    }
  }

  destroy() {
    this.done = true;
    this.sprite.destroy();
  }
}

// Flies down to the front of the enemy line, then skims along it (toward the
// incoming enemies) for `length` px, hitting each enemy it passes once, up to
// maxTargets. Calls onHit(enemy, x, y) per enemy.
export class PiercingProjectile {
  constructor(scene, { x, y, target, speed, color, size, length, maxTargets, hitRadius, enemies, onHit }) {
    this.speed = speed;
    this.hitRadius = hitRadius;
    this.maxTargets = maxTargets;
    this.enemies = enemies;
    this.onHit = onHit;
    this.hits = new Set();
    this.done = false;
    const laneY = target.y;
    this.waypoints = [
      { x: target.x - target.def.width, y: laneY },
      { x: target.x - target.def.width + length, y: laneY },
    ];
    this.sprite = scene.add.ellipse(x, y, size * 2, size * 0.9, color).setStrokeStyle(2, 0xc8a165).setDepth(5);
    this.spin = 0;
  }

  update(dt) {
    if (this.done) return;
    let step = this.speed * dt / 1000;
    while (step > 0 && this.waypoints.length) {
      const wp = this.waypoints[0];
      const dx = wp.x - this.sprite.x;
      const dy = wp.y - this.sprite.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= step) {
        this.sprite.setPosition(wp.x, wp.y);
        this.waypoints.shift();
        step -= dist;
      } else {
        this.sprite.x += dx / dist * step;
        this.sprite.y += dy / dist * step;
        step = 0;
      }
    }

    // Frisbee wobble.
    this.spin += dt;
    this.sprite.scaleY = 0.6 + 0.4 * Math.abs(Math.sin(this.spin / 60));

    for (const e of this.enemies()) {
      if (!e.alive || this.hits.has(e)) continue;
      const reach = this.hitRadius + e.def.width / 2;
      if (Math.abs(e.x - this.sprite.x) <= reach && Math.abs(e.y - this.sprite.y) <= e.def.height / 2 + this.hitRadius) {
        this.hits.add(e);
        this.onHit(e, e.x, e.y);
        if (this.hits.size >= this.maxTargets) break;
      }
    }

    if (!this.waypoints.length || this.hits.size >= this.maxTargets) this.destroy();
  }

  destroy() {
    this.done = true;
    this.sprite.destroy();
  }
}
