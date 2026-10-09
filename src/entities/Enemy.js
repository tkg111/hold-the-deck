import Phaser from 'phaser';
import { FX, SPRITES } from '../config.js';
import { fxSprite } from '../fx.js';
import { LAYOUT, laneFeetY } from '../layout.js';
import { findAnim, sheetKey, SPLASH_ANIM } from '../sprites.js';
import { light, text, UI } from '../ui/kit.js';
import { DEPTH } from './Ship.js';

// HP bar colours while cursed / poisoned.
const CURSE_COLOR = 0xb620e0;
const POISON_COLOR = 0x76ff03;

// Status sprites (fx sheets) and when each shows.
const STATUS = {
  stun: { sprite: 'stun_stars', active: (e) => e.isStunned },
  curse: { sprite: 'curse_mark', active: (e) => e.isCursed },
  poison: { sprite: 'poison_bubbles', active: (e) => e.isPoisoned },
  slow: { sprite: 'net_draped', active: (e) => e.isSlowed },
};

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

    this.statusSprites = {};  // STATUS key -> sprite, while that status lasts
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

  // The view was resized mid-wave and the island moved (spawn x from
  // oldSpawnX to newSpawnX): keep the same share of the way left to walk.
  rescaleLane(oldSpawnX, newSpawnX) {
    if (!this.alive || this.x <= this.stopX) return;
    const k = (newSpawnX - this.stopX) / (oldSpawnX - this.stopX);
    this.x = Math.max(this.stopX, this.stopX + (this.x - this.stopX) * k);
    if (this.splash) this.splash.setX(Math.round(this.x - this.frameW / 2));
    this.setFeetY(this.def.emerges ? this.feetY : laneFeetY(this.x));
    this.nameTag?.setPosition(this.x, this.hpBarY - 2);
    this.drawHpBar();
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
      this.scene.time.delayedCall(FX.hitFlashMs, () => this.alive && this.setFlash(false));
    }
    if (this.hp <= 0) this.die();
    else this.drawHpBar();
  }

  setFlash(on) {
    if (this.def.sprite) {
      if (on) this.body.setTintFill(FX.hitFlashColor);
      else this.body.clearTint();
    } else {
      this.body.setFillStyle(on ? FX.hitFlashColor : this.def.color);
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
    for (const sprite of Object.values(this.statusSprites)) sprite.destroy();
    this.statusSprites = {};
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

  // Status sprites: a net draped over a slowed enemy (the same 32x32 box as
  // its sprite, feet on the bottom row), poison bubbles over its body, and
  // stun stars then the curse mark stacked above its HP bar.
  drawStatus() {
    for (const [key, { sprite, active }] of Object.entries(STATUS)) {
      const on = active(this);
      if (on && !this.statusSprites[key]) {
        this.statusSprites[key] = fxSprite(this.scene, sprite, 0, 0).setDepth(DEPTH.enemyOverlay);
      } else if (!on && this.statusSprites[key]) {
        this.statusSprites[key].destroy();
        delete this.statusSprites[key];
      }
    }
    const { slow, poison, stun, curse } = this.statusSprites;
    const x = Math.round(this.x);
    if (slow) {
      if (this.def.emerges) slow.setOrigin(0.5).setPosition(x, Math.round(this.y));
      else slow.setOrigin(0.5, 1).setPosition(x, Math.round(this.feetY));
    }
    poison?.setPosition(x, Math.round(this.y - this.def.height / 4));
    let above = this.hpBarY - (this.nameTag ? 10 : 0) - FX.statusGap;
    for (const mark of [stun, curse]) {
      if (!mark) continue;
      mark.setOrigin(0.5, 1).setPosition(x, above);
      above -= mark.height + FX.statusGap;
    }
  }
}
