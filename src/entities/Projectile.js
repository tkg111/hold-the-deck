// Homing shot: flies toward its target and hits on contact.
// If the target dies mid-flight, the shot fizzles.
export class Projectile {
  constructor(scene, { x, y, target, damage, speed, color, size }) {
    this.target = target;
    this.damage = damage;
    this.speed = speed;
    this.done = false;
    this.sprite = scene.add.circle(x, y, size, color);
  }

  update(dt) {
    if (this.done) return;
    if (!this.target.alive) return this.destroy();

    const dx = this.target.x - this.sprite.x;
    const dy = this.target.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    const step = this.speed * dt / 1000;

    if (dist <= step) {
      this.target.takeDamage(this.damage);
      this.destroy();
      return;
    }
    const angle = Math.atan2(dy, dx);
    this.sprite.x += Math.cos(angle) * step;
    this.sprite.y += Math.sin(angle) * step;
  }

  destroy() {
    this.done = true;
    this.sprite.destroy();
  }
}
