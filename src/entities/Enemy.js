import Phaser from 'phaser';
import { ELITE, FX, SPRITES, WAVES } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { fxSprite, playFx } from '../fx.js';
import { LAYOUT, laneFeetY } from '../layout.js';
import { findAnim, sheetKey, SPLASH_ANIM } from '../sprites.js';
import { light, text, UI } from '../ui/kit.js';
import { Projectile } from './Projectile.js';
import { DEPTH } from './Ship.js';

// HP bar colours while cursed / poisoned.
const CURSE_COLOR = 0xb620e0;
const POISON_COLOR = 0x76ff03;

// Status sprites (fx sheets) and when each shows.
const STATUS = {
  stun: { sprite: 'stun_stars', active: (e) => e.isStunned },
  curse: { sprite: 'curse_mark', active: (e) => e.isCursed && e.curseMarkDelay <= 0 },
  poison: { sprite: 'poison_bubbles', active: (e) => e.isPoisoned },
  slow: { sprite: 'net_draped', active: (e) => e.isSlowed },
};

export class Enemy {
  // Walkers enter at layout.json's enemySpawnX and follow the lane (x is only
  // an override for testing); an emerging enemy (The Kraken) rises out of the
  // sea at layout.kraken instead, a flyer (Storm Harpy) cruises in at
  // layout.harpyFlightY and the Siren appears on her rock at layout.siren.
  //   elite:  3x HP (ELITE), gold tint; gold is already multiplied by the caller
  //   leader: in an escorted formation, the enemy this one keeps behind
  //   key:    its ENEMIES key (for the Wanted Board)
  constructor(scene, def, {
    x = LAYOUT.enemySpawnX, hpMultiplier, damageMultiplier, gold, elite = false, leader = null, key = null,
  }) {
    this.scene = scene;
    this.def = def;
    this.key = key;
    this.elite = elite;
    const eliteHp = elite ? ELITE.hpMultiplier : 1;
    this.maxHp = Math.round(def.hp * hpMultiplier * eliteHp);
    this.hp = this.maxHp;
    this.damage = def.damage * damageMultiplier;
    this.speed = def.speed;
    this.gold = gold;
    this.attackCooldown = 0;
    this.alive = true;
    // Shield and keg blast grow with the wave like HP does, armour like damage.
    this.armor = (def.armor ?? 0) * damageMultiplier;
    this.shieldMax = def.shield ? Math.round(def.shield.hp * hpMultiplier * eliteHp) : 0;
    this.shieldHp = this.shieldMax;
    this.blastDamage = def.blast ? def.blast.enemyDamage * hpMultiplier : 0;
    this.leader = leader;

    // Remaining ms for each status effect.
    this.stunTime = 0;
    this.slowTime = 0;
    this.slowFactor = 1;
    this.curseTime = 0;
    this.curseBonus = 0;
    this.curseMarkDelay = 0;  // ms before the curse mark shows (after Hex's burst)
    this.poisonTime = 0;
    this.poisonDps = 0;
    this.hasteTime = 0;       // sped up by the Siren's song
    this.hasteMult = 1;

    // Sprites and rectangles alike stand with their feet at (x, feetY);
    // this.y is the middle of the body (def.width x def.height).
    // Animated ones loop "walk" while moving, or "idle" all the time and
    // play "attack" on each hit.
    this.walkAnim = def.sprite && findAnim(scene, def.sprite, def.walkAnim ?? 'walk');
    this.idleAnim = def.sprite && findAnim(scene, def.sprite, def.idleAnim ?? 'idle');
    this.attackAnim = def.sprite && findAnim(scene, def.sprite, 'attack');
    if (this.walkAnim || this.idleAnim) {
      this.body = scene.add.sprite(0, 0, sheetKey(def.sprite));
      if (this.idleAnim) {
        this.body.play(this.idleAnim);
        if (this.attackAnim) this.body.on(`animationcomplete-${this.attackAnim}`, () => this.body.play(this.idleAnim));
      }
    } else if (def.sprite && !def.sheetOnly) {
      this.body = scene.add.image(0, 0, def.sprite);
    } else {
      this.body = scene.add.rectangle(0, 0, def.width, def.height, def.color).setStrokeStyle(1, 0x333333);
    }
    const depth = def.emerges ? DEPTH.kraken : def.flies ? DEPTH.flyer : DEPTH.enemy;
    this.body.setOrigin(0.5, 1).setDepth(depth);
    if (elite) this.setFlash(false);  // gold tint

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
    } else if (def.stationary) {
      // The Siren: her frame's top-left at layout.siren; she fades in.
      const { x: sx, y: sy } = LAYOUT.siren;
      this.x = sx + this.body.displayWidth / 2;
      this.stopX = this.x;
      this.setFeetY(sy + def.height);
      this.songTimer = def.song.firstAt;
      this.singTime = 0;
      this.singAnim = findAnim(scene, def.sprite, 'sing');
      this.body.setAlpha(0);
      scene.tweens.add({ targets: this.body, alpha: 1, duration: def.fadeInMs });
    } else if (def.flies) {
      // Cruises in at a random height, then dives at the top deck.
      const { min, max } = LAYOUT.flightY;
      this.x = x;
      this.cruiseY = Phaser.Math.Between(min, max);
      const hover = scene.ship.flyerHoverPoint(def.flies);
      const spread = def.flies.hoverSpread;
      this.hover = { x: hover.x + Phaser.Math.Between(-spread, spread), y: hover.y + Phaser.Math.Between(-spread, spread) };
      this.stopX = this.hover.x;
      this.phase = 'cruise';   // then 'dive', then 'attack'
      this.groundTime = 0;     // netted: on the lane, hittable by anyone
      this.diveAnim = findAnim(scene, def.sprite, 'dive');
      this.setY(this.cruiseY);
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

  // Position by the middle of the body (flyers).
  setY(y) {
    this.setFeetY(y + this.def.height / 2);
  }

  // The view was resized mid-wave and the island moved (spawn x from
  // oldSpawnX to newSpawnX): keep the same share of the way left to walk.
  rescaleLane(oldSpawnX, newSpawnX) {
    if (!this.alive || this.def.stationary || this.x <= this.stopX) return;
    const k = (newSpawnX - this.stopX) / (oldSpawnX - this.stopX);
    this.x = Math.max(this.stopX, this.stopX + (this.x - this.stopX) * k);
    if (this.splash) this.splash.setX(Math.round(this.x - this.frameW / 2));
    if (this.def.flies) this.setFeetY(this.feetY);
    else this.setFeetY(this.def.emerges ? this.feetY : laneFeetY(this.x));
    this.nameTag?.setPosition(this.x, this.hpBarY - 2);
    this.drawHpBar();
  }

  get isRising() { return this.riseTime > 0; }
  // Whether heroes can aim at or hit it (anti-air aside, see airborne).
  get targetable() { return this.alive && !this.isRising; }
  // A flyer in the air: only anti-air crew can hit it.
  get airborne() { return !!this.def.flies && !this.isGrounded; }
  get isGrounded() { return this.groundTime > 0; }
  get hpBarWidth() { return this.def.boss ? 40 : this.def.width + 4; }
  get hpBarY() { return Math.round(this.y - this.def.height / 2 - 4); }
  get isStunned() { return this.stunTime > 0; }
  get isSlowed() { return this.slowTime > 0; }
  get isCursed() { return this.curseTime > 0; }
  get isPoisoned() { return this.poisonTime > 0; }
  get isHasted() { return this.hasteTime > 0; }
  get hasShield() { return this.shieldHp > 0; }
  // How fast it moves and attacks: slows and the Siren's haste multiply.
  get pace() { return (this.isSlowed ? this.slowFactor : 1) * (this.isHasted ? this.hasteMult : 1); }

  // Whether a hero (or ability) can hit it: anything targetable on the lane,
  // and flyers in the air only with anti-air.
  canBeHit(antiAir) {
    return this.targetable && (antiAir || !this.airborne);
  }

  // --- Status effects ---

  applyStun(duration) {
    this.stunTime = Math.max(this.stunTime, duration * (this.def.statusResist ?? 1));
  }

  // Only nets slow, so a slowed flyer is netted: it drops to the lane for
  // as long as the slow lasts.
  applySlow(factor, duration) {
    this.slowFactor = this.isSlowed ? Math.min(this.slowFactor, factor) : factor;
    this.slowTime = Math.max(this.slowTime, duration * (this.def.statusResist ?? 1));
    if (this.def.flies) this.groundTime = this.slowTime;
  }

  applyCurse(bonus, duration) {
    this.curseBonus = this.isCursed ? Math.max(this.curseBonus, bonus) : bonus;
    this.curseTime = Math.max(this.curseTime, duration);
  }

  // Hold back the curse mark for ms (while something else plays on the enemy).
  delayCurseMark(ms) {
    this.curseMarkDelay = ms;
  }

  // Re-poisoning refreshes the timer and keeps the stronger tick.
  applyPoison(damagePerSecond, duration) {
    this.poisonDps = this.isPoisoned ? Math.max(this.poisonDps, damagePerSecond) : damagePerSecond;
    this.poisonTime = Math.max(this.poisonTime, duration);
  }

  applyHaste(mult, duration) {
    this.hasteMult = this.isHasted ? Math.max(this.hasteMult, mult) : mult;
    this.hasteTime = Math.max(this.hasteTime, duration);
  }

  tickStatus(dt) {
    if (this.isPoisoned) {
      const tick = Math.min(dt, this.poisonTime);
      this.poisonTime -= tick;
      this.takeDamage(this.poisonDps * tick / 1000, { flash: false, dot: true });
      if (!this.alive) return;
    }
    this.stunTime = Math.max(0, this.stunTime - dt);
    this.slowTime = Math.max(0, this.slowTime - dt);
    this.groundTime = Math.max(0, this.groundTime - dt);
    this.curseTime = Math.max(0, this.curseTime - dt);
    this.curseMarkDelay = Math.max(0, this.curseMarkDelay - dt);
    this.hasteTime = Math.max(0, this.hasteTime - dt);
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
      // Slow and haste affect both moving and attack rate.
      const sdt = dt * this.pace;
      if (this.def.flies) {
        moving = this.fly(sdt, dt, ship);
      } else if (this.def.stationary) {
        this.sing(sdt);
      } else if (this.x > this.stopX) {
        moving = this.walk(sdt);
      } else if (this.def.stealPercent) {
        this.steal();
        return;
      } else if (this.def.blast) {
        this.blowUpAtShip(ship);
        return;
      } else {
        this.attack(sdt, ship);
      }
    }
    this.animate(moving);

    if (!this.def.emerges && !this.def.flies && !this.def.stationary) this.setFeetY(laneFeetY(this.x));
    else this.setFeetY(this.feetY);
    this.nameTag?.setPosition(this.x, this.hpBarY - 2);
    this.drawHpBar();
    this.drawStatus();
  }

  // Left along the lane; in an escorted formation, never closer than
  // followGap behind the leader while it walks. Returns whether it moved.
  walk(sdt) {
    let minX = this.stopX;
    const { leader } = this;
    if (leader?.alive && leader.x > leader.stopX) {
      minX = Math.max(minX, leader.x + (leader.def.width + this.def.width) / 2 + WAVES.followGap);
    }
    const x = Math.max(minX, this.x - this.speed * sdt / 1000);
    const moved = x < this.x;
    if (moved) this.x = x;
    return moved;
  }

  attack(sdt, ship) {
    this.attackCooldown -= sdt;
    if (this.attackCooldown > 0) return;
    ship.takeDamage(this.damage);
    this.attackCooldown = this.def.attackInterval;
    if (this.attackAnim) this.body.play(this.attackAnim);
    // Otherwise a little lunge so attacks read visually
    else this.scene.tweens.add({ targets: this.body, angle: -15, duration: 80, yoyo: true });
  }

  // Storm Harpy: cruise left at its height, dive at the hover point off the
  // top deck, then attack from there. Netted, it drops to the lane and
  // struggles until the net is gone, then climbs back. Returns whether it
  // moved (sdt is paced by slow and haste; dt isn't, for falling).
  fly(sdt, dt, ship) {
    const f = this.def.flies;
    if (this.isGrounded) {
      const ground = laneFeetY(this.x);
      this.feetY = Math.min(ground, this.feetY + f.fallSpeed * dt / 1000);
      this.y = this.feetY - this.def.height / 2;
      return false;
    }
    if (this.phase === 'cruise') {
      this.x = Math.max(this.hover.x + f.diveFrom, this.x - this.speed * sdt / 1000);
      this.y = approach(this.y, this.cruiseY, f.climbSpeed * sdt / 1000);
      if (this.x <= this.hover.x + f.diveFrom) {
        this.phase = 'dive';
        if (this.diveAnim) this.body.play(this.diveAnim);
      }
    } else {
      const speed = this.phase === 'dive' ? f.diveSpeed : f.climbSpeed;
      const arrived = this.moveToward(this.hover.x, this.hover.y, speed * sdt / 1000);
      if (arrived && this.phase === 'dive') {
        this.phase = 'attack';
        if (this.idleAnim) this.body.play(this.idleAnim);
      }
      if (arrived && this.phase === 'attack') this.attack(sdt, ship);
    }
    this.feetY = this.y + this.def.height / 2;
    return true;
  }

  // Step toward (x, y) by up to step px; returns whether it's there.
  moveToward(x, y, step) {
    const dx = x - this.x;
    const dy = y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= step) {
      this.x = x;
      this.y = y;
      return true;
    }
    this.x += dx / dist * step;
    this.y += dy / dist * step;
    return false;
  }

  // The Siren: every song.interval, sing at a random crewmate (a note that
  // stuns them) and speed up the enemies around her.
  sing(sdt) {
    const { song } = this.def;
    if (this.singTime > 0) {
      this.singTime -= sdt;
      if (this.singTime <= 0 && this.idleAnim) this.body.play(this.idleAnim);
    }
    this.songTimer -= sdt;
    if (this.songTimer > 0) return;
    this.songTimer = song.interval;
    this.singTime = song.singMs;
    if (this.singAnim) this.body.play(this.singAnim);
    sfx.sirenSong();

    const crew = this.scene.heroes;
    if (crew.length) {
      const hero = crew[Math.floor(Math.random() * crew.length)];
      // Homing on the crewmate (who never moves); it can't be dodged.
      const target = { alive: true, x: hero.x, y: hero.y };
      this.scene.projectiles.push(new Projectile(this.scene, {
        x: this.x - 8, y: this.y - 12, target, speed: song.noteSpeed, sprite: song.note,
        onHit: () => hero.stun(song.stun),
        findTarget: () => null,
      }));
    }
    for (const e of this.scene.enemies) {
      if (e === this || !e.alive) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) <= song.hasteRadius) e.applyHaste(song.hasteMult, song.hasteDuration);
    }
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

  // Walk only while moving; animations freeze while stunned and follow the
  // enemy's pace (slow, haste).
  animate(moving) {
    const anims = this.body.anims;
    if (!anims) return;
    anims.timeScale = this.pace;
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

  // Keg Runner at the ship: it blows up on the hull (no gold).
  blowUpAtShip(ship) {
    this.alive = false;
    ship.takeDamage(this.damage);
    this.explode();
    this.removeOverlays();
    this.body.destroy();
  }

  // The keg's explosion (2x size) and camera shake; hits nothing by itself.
  explode() {
    const { blast } = this.def;
    playFx(this.scene, blast.fx, this.x, this.y).setScale(blast.fxScale);
    this.scene.cameras.main.shake(blast.shake.duration, blast.shake.intensity);
    sfx.boom();
  }

  // amount: the hit's damage. Options:
  //   flash: false for damage over time, so poison ticks don't strobe the body
  //   dot:   damage over time (poison): armour and shields don't stop it
  //   lobbed: an arcing hit, which goes over a Barnacle Knight's shield
  takeDamage(amount, { flash = true, dot = false, lobbed = false } = {}) {
    if (!this.alive) return;
    let damage = this.isCursed ? amount * (1 + this.curseBonus) : amount;
    if (this.armor && !dot) damage = Math.max(this.def.minDamage, damage - this.armor);
    if (flash) {
      this.setFlash(true);
      this.scene.time.delayedCall(FX.hitFlashMs, () => this.alive && this.setFlash(false));
    }
    if (this.hasShield && !dot && !lobbed) {
      this.shieldHp -= damage;
      if (!this.hasShield) this.breakShield();
      this.drawHpBar();
      return;
    }
    this.hp -= damage;
    if (this.hp <= 0) this.die();
    else this.drawHpBar();
  }

  // shield_break plays where the shield was, and it walks on without it.
  breakShield() {
    const { shield } = this.def;
    this.shieldHp = 0;
    playFx(this.scene, shield.fx, this.x + shield.offsetX, this.feetY + shield.offsetY);
    sfx.shieldBreak();
    const anim = findAnim(this.scene, this.def.sprite, shield.brokenAnim);
    if (anim) {
      this.walkAnim = anim;
      if (this.body.anims.isPlaying) this.body.play(anim);
      else this.body.setFrame(this.scene.anims.get(anim).frames[0].textureFrame);
    }
  }

  // White while hit; otherwise an Elite's gold tint (or none).
  setFlash(on) {
    if (this.body.setTintFill) {
      if (on) this.body.setTintFill(FX.hitFlashColor);
      else if (this.elite) this.body.setTint(ELITE.tint);
      else this.body.clearTint();
    } else {
      this.body.setFillStyle(on ? FX.hitFlashColor : this.elite ? ELITE.tint : this.def.color);
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
    if (this.def.blast) this.blastEnemies();
  }

  // A Keg Runner killed before reaching the ship: its keg goes off where it
  // fell, hitting every enemy on the lane within the blast radius.
  blastEnemies() {
    this.explode();
    const { radius } = this.def.blast;
    for (const e of this.scene.enemies) {
      if (e === this || !e.canBeHit(false)) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) <= radius) e.takeDamage(this.blastDamage, { lobbed: true });
    }
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

  // The HP bar, with a Barnacle Knight's shield bar just above it while it
  // lasts.
  drawHpBar() {
    const w = this.hpBarWidth;
    const x = Math.round(this.x - w / 2);
    const y = this.hpBarY;
    const pct = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.6).fillRect(x, y, w, 2);
    const barColor = this.isCursed ? CURSE_COLOR : this.isPoisoned ? POISON_COLOR : 0xe53935;
    this.hpBar.fillStyle(barColor).fillRect(x, y, Math.round(w * pct), 2);
    if (this.hasShield) {
      const shieldPct = Phaser.Math.Clamp(this.shieldHp / this.shieldMax, 0, 1);
      this.hpBar.fillStyle(0x000000, 0.6).fillRect(x, y - 2, w, 2);
      this.hpBar.fillStyle(this.def.shield.barColor).fillRect(x, y - 2, Math.round(w * shieldPct), 2);
    }
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
    let above = this.hpBarY - (this.nameTag ? 10 : 0) - (this.hasShield ? 2 : 0) - FX.statusGap;
    for (const mark of [stun, curse]) {
      if (!mark) continue;
      mark.setOrigin(0.5, 1).setPosition(x, above);
      above -= mark.height + FX.statusGap;
    }
  }
}

// value moved toward target by up to step.
function approach(value, target, step) {
  return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
}
