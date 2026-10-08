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
