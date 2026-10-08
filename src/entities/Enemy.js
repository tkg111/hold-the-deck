import Phaser from 'phaser';
import { SPRITES } from '../config.js';
import { LAYOUT, laneFeetY } from '../layout.js';
import { findAnim, sheetKey, SPLASH_ANIM } from '../sprites.js';
import { light, text, UI } from '../ui/kit.js';
import { DEPTH } from './Ship.js';

const STUN_COLOR = 0xffeb3b;
const SLOW_COLOR = 0x4fc3f7;
const CURSE_COLOR = 0xb620e0;
const POISON_COLOR = 0x76ff03;
const HIT_COLOR = 0xff5555;

export class Enemy {
  // Walkers enter at layout.json's enemySpawnX and follow the lane (x is only
  // an override for testing); an emerging enemy (The Kraken) rises out of the
  // sea at layout.kraken instead.
  constructor(scene, def, { x = LAYOUT.enemySpawnX, hpMultiplier, damageMultiplier, gold }) {
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

    // Sprites and rectangles alike stand with their feet at (x, feetY);
    // this.y is the middle of the body (def.width x def.height).
    // Animated ones loop "walk" while moving, or "idle" all the time and
    // play "attack" on each hit.
    this.walkAnim = def.sprite && findAnim(scene, def.sprite, 'walk');
    this.idleAnim = def.sprite && findAnim(scene, def.sprite, 'idle');
    this.attackAnim = def.sprite && findAnim(scene, def.sprite, 'attack');
    if (this.walkAnim || this.idleAnim) {
      this.body = scene.add.sprite(0, 0, sheetKey(def.sprite));
      if (this.idleAnim) {
        this.body.play(this.idleAnim);
        if (this.attackAnim) this.body.on(`animationcomplete-${this.attackAnim}`, () => this.body.play(this.idleAnim));
      }
    } else if (def.sprite) {
      this.body = scene.add.image(0, 0, def.sprite);
    } else {
      this.body = scene.add.rectangle(0, 0, def.width, def.height, def.color).setStrokeStyle(1, 0x333333);
    }
    this.body.setOrigin(0.5, 1).setDepth(def.emerges ? DEPTH.kraken : DEPTH.enemy);

    // An emerging enemy rises at layout.kraken (whose x / y are the top-left
    // of its frame) with a splash, can't be hit until fully risen, then
    // glides left to toX and attacks.
    this.riseTime = 0;
    this.splash = null;
    if (def.emerges) {
      const k = LAYOUT.kraken;
      this.frameW = this.body.displayWidth;
      this.frameH = this.body.displayHeight;
      this.x = k.x + this.frameW / 2;
      this.stopX = k.toX + this.frameW / 2;
      this.riseTime = k.riseMs;
      this.setFeetY(k.fromY + this.frameH);
      const s = SPRITES.krakenSplash;
      this.splash = scene.add.sprite(k.x, LAYOUT.waterY - s.aboveWater, s.key)
        .setOrigin(0).setDepth(DEPTH.splash).play(SPLASH_ANIM);
    } else {
      this.x = x;
      this.stopX = LAYOUT.shipContactX + def.width / 2;  // front edge at the ship
      this.setFeetY(laneFeetY(this.x));
    }

    this.statusFx = scene.add.graphics().setDepth(DEPTH.enemyOverlay);
    this.hpBar = scene.add.graphics().setDepth(DEPTH.enemyOverlay);
    this.nameTag = def.boss
      ? text(scene, this.x, 0, def.name.toUpperCase(), { font: 'small', ...light({ color: UI.colors.warn }) })
        .setOrigin(0.5, 1).setDepth(DEPTH.enemyOverlay)
      : null;
    this.drawHpBar();
  }

  setFeetY(feetY) {
    this.feetY = feetY;
    this.y = feetY - this.def.height / 2;
    this.body.setPosition(this.x, feetY);
  }

  get isRising() { return this.riseTime > 0; }
  // Whether heroes can aim at or hit it.
  get targetable() { return this.alive && !this.isRising; }
  get hpBarWidth() { return this.def.boss ? 40 : this.def.width + 4; }
  get hpBarY() { return Math.round(this.y - this.def.height / 2 - 4); }
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

    let moving = false;
    if (this.isRising) {
      this.rise(dt);
    } else if (!this.isStunned) {
      // Slow affects both walking and attack rate.
      const sdt = this.isSlowed ? dt * this.slowFactor : dt;
      if (this.x > this.stopX) {
        this.x = Math.max(this.stopX, this.x - this.speed * sdt / 1000);
        moving = true;
      } else if (this.def.stealPercent) {
        this.steal();
        return;
      } else {
        this.attackCooldown -= sdt;
        if (this.attackCooldown <= 0) {
          ship.takeDamage(this.damage);
          this.attackCooldown = this.def.attackInterval;
          if (this.attackAnim) this.body.play(this.attackAnim);
          // Otherwise a little lunge so attacks read visually
          else this.scene.tweens.add({ targets: this.body, angle: -15, duration: 80, yoyo: true });
        }
      }
    }
    this.animate(moving);

    this.setFeetY(this.def.emerges ? this.feetY : laneFeetY(this.x));
    this.nameTag?.setPosition(this.x, this.hpBarY - 2);
    this.drawHpBar();
    this.drawStatus();
  }

  rise(dt) {
    const k = LAYOUT.kraken;
    this.riseTime = Math.max(0, this.riseTime - dt);
    const t = 1 - this.riseTime / k.riseMs;
    this.feetY = Phaser.Math.Linear(k.fromY, k.toY, t) + this.frameH;
    if (!this.isRising) this.removeSplash();
  }

  removeSplash() {
    this.splash?.destroy();
    this.splash = null;
  }

  // Walk only while moving; animations freeze while stunned and slow down
  // with the enemy.
  animate(moving) {
    const anims = this.body.anims;
    if (!anims) return;
    anims.timeScale = this.isSlowed ? this.slowFactor : 1;
    if (this.walkAnim) {
      if (moving) this.body.play(this.walkAnim, true);
      else anims.stop();
    } else if (this.isStunned) {
      anims.pause();
    } else if (anims.isPaused) {
      anims.resume();
    }
  }

  // Thief behaviour: grab gold and vanish without hurting the ship.
  steal() {
    this.alive = false;
    this.scene.events.emit('enemy-stole', this);
    this.removeOverlays();
    this.scene.tweens.add({
      targets: this.body,
      x: this.x + 20,
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
      this.setFlash(true);
      this.scene.time.delayedCall(60, () => this.alive && this.setFlash(false));
    }
    if (this.hp <= 0) this.die();
    else this.drawHpBar();
  }

  setFlash(on) {
    if (this.def.sprite) {
      if (on) this.body.setTintFill(HIT_COLOR);
      else this.body.clearTint();
    } else {
      this.body.setFillStyle(on ? HIT_COLOR : this.def.color);
    }
  }

  die() {
    this.alive = false;
    this.scene.events.emit('enemy-killed', this);
    this.removeOverlays();
    this.scene.tweens.add({
      targets: this.body,
      alpha: 0,
      scaleY: this.body.scaleY * 0.2,
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
    this.removeSplash();
    this.hpBar.destroy();
    this.statusFx.destroy();
    this.nameTag?.destroy();
  }

  // --- Drawing ---

  drawHpBar() {
    const w = this.hpBarWidth;
    const x = Math.round(this.x - w / 2);
    const y = this.hpBarY;
    const pct = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.6).fillRect(x, y, w, 2);
    const barColor = this.isCursed ? CURSE_COLOR : this.isPoisoned ? POISON_COLOR : 0xe53935;
    this.hpBar.fillStyle(barColor).fillRect(x, y, Math.round(w * pct), 2);
  }

  drawStatus() {
    const g = this.statusFx;
    g.clear();
    const { width: w, height: h } = this.def;
    const left = Math.round(this.x - w / 2);
    const top = Math.round(this.y - h / 2);
    const t = this.scene.time.now;

    // Curse: pulsing purple aura around the body.
    if (this.isCursed) {
      const pulse = 0.5 + 0.5 * Math.sin(t / 120);
      g.fillStyle(CURSE_COLOR, 0.25).fillRect(left, top, w, h);
      g.lineStyle(1, CURSE_COLOR, 0.5 + 0.5 * pulse).strokeRect(left - 2, top - 2, w + 4, h + 4);
    }

    // Poison: sickly green tint with bubbles rising off the body.
    if (this.isPoisoned) {
      g.fillStyle(POISON_COLOR, 0.28).fillRect(left, top, w, h);
      for (let i = 0; i < 3; i++) {
        const phase = (t / 700 + i / 3) % 1;
        const bx = this.x + Math.sin(i * 2.4 + t / 300) * w * 0.35;
        const by = top + h * 0.4 - phase * (h * 0.4 + 7);
        g.fillStyle(POISON_COLOR, 1 - phase).fillRect(Math.round(bx), Math.round(by), phase < 0.5 ? 2 : 1, phase < 0.5 ? 2 : 1);
      }
    }

    // Slow: blue net drawn over the body.
    if (this.isSlowed) {
      g.lineStyle(1, SLOW_COLOR, 0.95);
      for (let x = left; x <= left + w; x += 3) g.lineBetween(x, top, x, top + h);
      for (let y = top; y <= top + h; y += 3) g.lineBetween(left, y, left + w, y);
      g.strokeRect(left, top, w, h);
    }

    // Stun: yellow stars circling above the head.
    if (this.isStunned) {
      const cy = this.hpBarY - (this.def.boss ? 11 : 4);
      g.fillStyle(STUN_COLOR, 1);
      for (let i = 0; i < 3; i++) {
        const a = t / 130 + i * (Math.PI * 2 / 3);
        g.fillRect(Math.round(this.x + Math.cos(a) * 6) - 1, Math.round(cy + Math.sin(a) * 2) - 1, 2, 2);
      }
    }
  }
}
