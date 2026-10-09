import { FX_DEPTH, fxSprite } from '../fx.js';

// Every projectile is an fx sheet (`sprite`, see fx.json), drawn flying
// right; with `rotate` it turns to its flight angle, otherwise it keeps its
// own animation (the spinning ones).
//
// All projectiles take `findTarget(x, y)`, which returns the nearest living,
// targetable enemy (or null). When a projectile's target dies before it lands, it switches
// to that enemy instead of wasting the shot on an empty spot; it fizzles only
// when no enemies are left.

export function nearestLiving(enemies, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const e of enemies) {
    if (!e.targetable) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestDist) {
      best = e;
      bestDist = d;
    }
  }
  return best;
}

// Homing shot: flies straight toward its target and calls onHit(target, x, y)
// on arrival.
export class Projectile {
  constructor(scene, { x, y, target, speed, sprite, rotate = false, onHit, findTarget }) {
    this.target = target;
    this.speed = speed;
    this.rotate = rotate;
    this.onHit = onHit;
    this.findTarget = findTarget;
    this.done = false;
    this.sprite = fxSprite(scene, sprite, x, y).setDepth(FX_DEPTH);
  }

  update(dt) {
    if (this.done) return;
    if (!this.target.alive) {
      this.target = this.findTarget(this.sprite.x, this.sprite.y);
      if (!this.target) return this.destroy();  // nothing left to hit
    }

    const dx = this.target.x - this.sprite.x;
    const dy = this.target.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt / 1000;

    if (dist <= step) {
      this.onHit(this.target, this.target.x, this.target.y);
      this.destroy();
      return;
    }
    this.sprite.x += dx / dist * step;
    this.sprite.y += dy / dist * step;
    if (this.rotate) this.sprite.rotation = Math.atan2(dy, dx);
  }

  destroy() {
    this.done = true;
    this.sprite.destroy();
  }
}

// Arcing shot aimed at where its target will be when it lands (aimAt(target,
// msLeft) -> {x, y}), then calls onHit(target, x, y) with whichever enemy it
// was last aimed at (area shots hit around the point instead).
// If the target dies mid-flight, the landing point moves to the nearest living
// enemy; the arc bends smoothly rather than jumping.
export class LobProjectile {
  constructor(scene, { x, y, target, flightTime, arcHeight, sprite, onHit, findTarget, aimAt }) {
    this.target = target;
    this.flightTime = flightTime;
    this.arcHeight = arcHeight;
    this.onHit = onHit;
    this.findTarget = findTarget;
    this.aimAt = aimAt;
    this.elapsed = 0;
    this.done = false;
    this.startX = x;
    this.startY = y;
    ({ x: this.destX, y: this.destY } = aimAt(target, flightTime));
    this.sprite = fxSprite(scene, sprite, x, y).setDepth(FX_DEPTH);
  }

  // Position along the arc at progress t (0..1).
  pointAt(t) {
    return {
      x: this.startX + (this.destX - this.startX) * t,
      y: this.startY + (this.destY - this.startY) * t - this.arcHeight * 4 * t * (1 - t),
    };
  }

  retarget(t) {
    const target = this.findTarget(this.destX, this.destY);
    if (!target) return false;
    this.target = target;
    const { x, y } = this.aimAt(target, this.flightTime - this.elapsed);
    // Move the virtual start point so the arc passes through where the ball
    // is right now: keeps the motion continuous with the new landing point.
    const here = this.pointAt(t);
    const baseY = here.y + this.arcHeight * 4 * t * (1 - t);
    this.destX = x;
    this.destY = y;
    this.startX = (here.x - x * t) / (1 - t);
    this.startY = (baseY - y * t) / (1 - t);
    return true;
  }

  update(dt) {
    if (this.done) return;
    const prevT = Math.min(1, this.elapsed / this.flightTime);
    if (!this.target.alive && prevT < 1 && !this.retarget(prevT)) {
      this.destroy();  // nothing left to hit
      return;
    }

    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / this.flightTime);
    const { x, y } = this.pointAt(t);
    this.sprite.setPosition(x, y);
    if (t >= 1) {
      this.onHit(this.target, this.destX, this.destY);
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
// maxTargets. Calls onHit(enemy, x, y) per enemy. If the target dies before the
// harpoon reaches the line, it re-aims at the nearest living enemy; once skimming
// it hits whatever is on the line.
export class PiercingProjectile {
  constructor(scene, { x, y, target, speed, sprite, length, maxTargets, hitRadius, enemies, onHit, findTarget }) {
    this.speed = speed;
    this.length = length;
    this.hitRadius = hitRadius;
    this.maxTargets = maxTargets;
    this.enemies = enemies;
    this.onHit = onHit;
    this.findTarget = findTarget;
    this.hits = new Set();
    this.done = false;
    // Points the way it flies.
    this.sprite = fxSprite(scene, sprite, x, y).setDepth(FX_DEPTH);
    this.aimAt(target);
  }

  aimAt(target) {
    this.target = target;
    const startX = target.x - target.def.width;
    this.waypoints = [
      { x: startX, y: target.y },
      { x: startX + this.length, y: target.y },
    ];
  }

  get skimming() { return this.waypoints.length < 2; }

  update(dt) {
    if (this.done) return;
    if (!this.skimming && !this.target.alive) {
      const next = this.findTarget(this.sprite.x, this.sprite.y);
      if (!next) return this.destroy();  // nothing left to hit
      this.aimAt(next);
    }

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

    // Point along the direction of travel.
    const wp = this.waypoints[0];
    if (wp) this.sprite.rotation = Math.atan2(wp.y - this.sprite.y, wp.x - this.sprite.x);

    for (const e of this.enemies()) {
      if (!e.targetable || this.hits.has(e)) continue;
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
