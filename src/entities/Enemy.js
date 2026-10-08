import Phaser from 'phaser';
import { DISPLAY } from '../config.js';

const STUN_COLOR = 0xffeb3b;
const SLOW_COLOR = 0x4fc3f7;
const CURSE_COLOR = 0xb620e0;
const POISON_COLOR = 0x76ff03;

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

    // Remaining ms for each status effect.
    this.stunTime = 0;
    this.slowTime = 0;
    this.slowFactor = 1;
    this.curseTime = 0;
    this.curseBonus = 0;
    this.poisonTime = 0;
    this.poisonDps = 0;

    this.x = x;
    this.y = DISPLAY.groundY - def.height / 2 + yOffset;

    this.body = scene.add.rectangle(this.x, this.y, def.width, def.height, def.color)
      .setStrokeStyle(2, 0x333333);
    this.statusFx = scene.add.graphics();
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
  get isStunned() { return this.stunTime > 0; }
  get isSlowed() { return this.slowTime > 0; }
  get isCursed() { return this.curseTime > 0; }
  get isPoisoned() { return this.poisonTime > 0; }

  // --- Status effects ---

  applyStun(duration) {
    this.stunTime = Math.max(this.stunTime, duration * (this.def.statusResist ?? 1));
  }

  applySlow(factor, duration) {
    this.slowFactor = this.isSlowed ? Math.min(this.slowFactor, factor) : factor;
    this.slowTime = Math.max(this.slowTime, duration * (this.def.statusResist ?? 1));
  }

  applyCurse(bonus, duration) {
    this.curseBonus = this.isCursed ? Math.max(this.curseBonus, bonus) : bonus;
    this.curseTime = Math.max(this.curseTime, duration);
  }

  // Re-poisoning refreshes the timer and keeps the stronger tick.
  applyPoison(damagePerSecond, duration) {
    this.poisonDps = this.isPoisoned ? Math.max(this.poisonDps, damagePerSecond) : damagePerSecond;
    this.poisonTime = Math.max(this.poisonTime, duration);
  }

  tickStatus(dt) {
    if (this.isPoisoned) {
      const tick = Math.min(dt, this.poisonTime);
      this.poisonTime -= tick;
      this.takeDamage(this.poisonDps * tick / 1000, { flash: false });
      if (!this.alive) return;
    }
    this.stunTime = Math.max(0, this.stunTime - dt);
    this.slowTime = Math.max(0, this.slowTime - dt);
    this.curseTime = Math.max(0, this.curseTime - dt);
  }

  // --- Behaviour ---

  update(dt, ship) {
    if (!this.alive) return;
    this.tickStatus(dt);
    if (!this.alive) return;  // poison can finish it off

    if (!this.isStunned) {
      // Slow affects both walking and attack rate.
      const sdt = this.isSlowed ? dt * this.slowFactor : dt;
      const frontX = this.x - this.def.width / 2;
      if (frontX > ship.right) {
        this.x = Math.max(ship.right + this.def.width / 2, this.x - this.speed * sdt / 1000);
      } else if (this.def.stealPercent) {
        this.steal();
        return;
      } else {
        this.attackCooldown -= sdt;
        if (this.attackCooldown <= 0) {
          ship.takeDamage(this.damage);
          this.attackCooldown = this.def.attackInterval;
          // Little lunge so attacks read visually
          this.scene.tweens.add({ targets: this.body, angle: -15, duration: 80, yoyo: true });
        }
      }
    }

    this.body.x = this.x;
    this.nameTag?.setPosition(this.x, this.hpBarY - 2);
    this.drawHpBar();
    this.drawStatus();
  }

  // Thief behaviour: grab gold and vanish without hurting the ship.
  steal() {
    this.alive = false;
    this.scene.events.emit('enemy-stole', this);
    this.removeOverlays();
    this.scene.tweens.add({
      targets: this.body,
      x: this.x + 40,
      alpha: 0,
      duration: 250,
      onComplete: () => this.body.destroy(),
    });
  }

  // flash: false for damage over time, so poison ticks don't strobe the body.
  takeDamage(amount, { flash = true } = {}) {
    if (!this.alive) return;
    this.hp -= this.isCursed ? amount * (1 + this.curseBonus) : amount;
    if (flash) {
      this.body.setFillStyle(0xff5555);
      this.scene.time.delayedCall(60, () => this.alive && this.body.setFillStyle(this.def.color));
    }
    if (this.hp <= 0) this.die();
    else this.drawHpBar();
  }

  die() {
    this.alive = false;
    this.scene.events.emit('enemy-killed', this);
    this.removeOverlays();
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
    this.removeOverlays();
  }

  removeOverlays() {
    this.hpBar.destroy();
    this.statusFx.destroy();
    this.nameTag?.destroy();
  }

  // --- Drawing ---

  drawHpBar() {
    const w = this.hpBarWidth;
    const x = this.x - w / 2;
    const y = this.hpBarY;
    const pct = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.6).fillRect(x, y, w, 4);
    const barColor = this.isCursed ? CURSE_COLOR : this.isPoisoned ? POISON_COLOR : 0xe53935;
    this.hpBar.fillStyle(barColor).fillRect(x, y, w * pct, 4);
  }

  drawStatus() {
    const g = this.statusFx;
    g.clear();
    const { width: w, height: h } = this.def;
    const left = this.x - w / 2;
    const top = this.y - h / 2;
    const t = this.scene.time.now;

    // Curse: pulsing purple aura around the body.
    if (this.isCursed) {
      const pulse = 0.5 + 0.5 * Math.sin(t / 120);
      g.fillStyle(CURSE_COLOR, 0.25).fillRect(left, top, w, h);
      g.lineStyle(3, CURSE_COLOR, 0.5 + 0.5 * pulse).strokeRect(left - 3, top - 3, w + 6, h + 6);
    }

    // Poison: sickly green tint with bubbles rising off the body.
    if (this.isPoisoned) {
      g.fillStyle(POISON_COLOR, 0.28).fillRect(left, top, w, h);
      for (let i = 0; i < 3; i++) {
        const phase = (t / 700 + i / 3) % 1;
        const bx = this.x + Math.sin(i * 2.4 + t / 300) * w * 0.35;
        const by = top + h * 0.4 - phase * (h * 0.4 + 14);
        g.fillStyle(POISON_COLOR, 1 - phase).fillCircle(bx, by, 2.8 * (1 - phase * 0.5));
      }
    }

    // Slow: blue net drawn over the body.
    if (this.isSlowed) {
      g.lineStyle(1.5, SLOW_COLOR, 0.95);
      for (let x = left; x <= left + w; x += 6) g.lineBetween(x, top, x, top + h);
      for (let y = top; y <= top + h; y += 6) g.lineBetween(left, y, left + w, y);
      g.strokeRect(left, top, w, h);
    }

    // Stun: yellow stars circling above the head.
    if (this.isStunned) {
      const cy = this.hpBarY - (this.def.boss ? 22 : 8);
      g.fillStyle(STUN_COLOR, 1);
      for (let i = 0; i < 3; i++) {
        const a = t / 130 + i * (Math.PI * 2 / 3);
        g.fillCircle(this.x + Math.cos(a) * 11, cy + Math.sin(a) * 3, 2.5);
      }
    }
  }
}
