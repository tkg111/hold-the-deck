import Phaser from 'phaser';
import { DISPLAY } from '../config.js';

export class Enemy {
  constructor(scene, def, { x, yOffset, hpMultiplier, damageMultiplier, gold }) {
    this.scene = scene;
    this.def = def;
    this.maxHp = Math.round(def.hp * hpMultiplier);
    this.hp = this.maxHp;
    this.damage = def.damage * damageMultiplier;
    this.speed = def.speed;
    this.gold = gold;
    this.attackCooldown = 0;
    this.alive = true;

    this.x = x;
    this.y = DISPLAY.groundY - def.height / 2 + yOffset;

    this.body = scene.add.rectangle(this.x, this.y, def.width, def.height, def.color)
      .setStrokeStyle(2, 0x333333);
    this.hpBar = scene.add.graphics();
    this.nameTag = def.boss
      ? scene.add.text(this.x, 0, def.name, {
        fontFamily: 'sans-serif', fontSize: '13px', color: '#ff8a80',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5, 1)
      : null;
    this.drawHpBar();
  }

  get hpBarWidth() { return this.def.boss ? 80 : this.def.width + 8; }
  get hpBarY() { return this.y - this.def.height / 2 - 8; }

  update(dt, house) {
    if (!this.alive) return;

    const frontX = this.x - this.def.width / 2;
    if (frontX > house.right) {
      this.x = Math.max(house.right + this.def.width / 2, this.x - this.speed * dt / 1000);
    } else if (this.def.stealPercent) {
      this.steal();
      return;
    } else {
      this.attackCooldown -= dt;
      if (this.attackCooldown <= 0) {
        house.takeDamage(this.damage);
        this.attackCooldown = this.def.attackInterval;
        // Little lunge so attacks read visually
        this.scene.tweens.add({ targets: this.body, angle: -15, duration: 80, yoyo: true });
      }
    }

    this.body.x = this.x;
    this.nameTag?.setPosition(this.x, this.hpBarY - 2);
    this.drawHpBar();
  }

  // Thief behaviour: grab gold and vanish without hurting the house.
  steal() {
    this.alive = false;
    this.scene.events.emit('enemy-stole', this);
    this.hpBar.destroy();
    this.scene.tweens.add({
      targets: this.body,
      x: this.x + 40,
      alpha: 0,
      duration: 250,
      onComplete: () => this.body.destroy(),
    });
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    this.body.setFillStyle(0xff5555);
    this.scene.time.delayedCall(60, () => this.alive && this.body.setFillStyle(this.def.color));
    if (this.hp <= 0) this.die();
    else this.drawHpBar();
  }

  die() {
    this.alive = false;
    this.scene.events.emit('enemy-killed', this);
    this.hpBar.destroy();
    this.nameTag?.destroy();
    this.scene.tweens.add({
      targets: this.body,
      alpha: 0,
      scaleY: 0.2,
      duration: 200,
      onComplete: () => this.body.destroy(),
    });
  }

  // Removes immediately without death animation (wave reset).
  destroy() {
    this.alive = false;
    this.body.destroy();
    this.hpBar.destroy();
    this.nameTag?.destroy();
  }

  drawHpBar() {
    const w = this.hpBarWidth;
    const x = this.x - w / 2;
    const y = this.hpBarY;
    const pct = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.6).fillRect(x, y, w, 4);
    this.hpBar.fillStyle(0xe53935).fillRect(x, y, w * pct, 4);
  }
}
