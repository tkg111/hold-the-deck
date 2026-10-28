import { ALLIES } from '../config.js';
import { fxSprite, playFx } from '../fx.js';
import { LAYOUT, laneFeetY } from '../layout.js';
import { findAnim, sheetKey, sheetSpec } from '../sprites.js';
import { DEPTH } from './Ship.js';

// Whether a friendly unit can fight this enemy: one walking the lane (not
// a flyer, a boat, the Kraken or anything anchored), in reach.
export const fightsOnLane = (e) => e.canBeHit(false) && !e.def.flies && !e.def.floats && !e.def.emerges && !e.anchored;

// A friendly skeleton on the lane (the Bone Caller's Raise the Crew; see
// ALLIES.skeleton): it rises from a summon circle at x, then walks right
// until the first ground enemy ahead and fights it, for `duration` ms or
// until beaten. Enemies that walk into it stop and fight it (see
// Enemy.allyAhead). hp, damage: its own numbers (from the Bone Caller's
// damage); source: who its hits are credited to (BattleStats). explode:
// { radius, damage } when an awakened Bone Caller raised it: beaten, it
// blows up on the enemies near it.
export class AllySkeleton {
  constructor(scene, x, {
    hp, damage, duration, source, circle, explode = null,
  }) {
    this.explode = explode;
    const spec = ALLIES.skeleton;
    this.scene = scene;
    this.spec = spec;
    this.x = x;
    this.feetY = laneFeetY(x);
    this.width = spec.width;
    this.maxHp = hp;
    this.hp = hp;
    this.damage = damage;
    this.source = source;
    this.time = duration;
    this.cooldown = 0;
    this.alive = true;
    const rise = sheetSpec(scene, spec.sprite)?.rise;
    this.riseTime = rise?.frames ? rise.frames.length * 1000 / rise.fps : spec.riseMs;
    this.walkAnim = findAnim(scene, spec.sprite, 'walk');
    const riseAnim = findAnim(scene, spec.sprite, 'rise');
    this.circle = circle ? fxSprite(scene, circle, Math.round(x), Math.round(this.feetY)).setDepth(DEPTH.ally - 0.1) : null;
    this.body = scene.add.sprite(Math.round(x), Math.round(this.feetY), sheetKey(spec.sprite)).setOrigin(0.5, 1).setDepth(DEPTH.ally);
    if (riseAnim) this.body.play(riseAnim);
    this.hpBar = scene.add.graphics().setDepth(DEPTH.enemyOverlay);
    this.moving = false;
  }

  // Up and fighting: it holds walkers up.
  get blocks() { return this.alive && this.riseTime <= 0; }

  // The first ground enemy ahead of it (it faces the island), or null.
  frontEnemy() {
    let best = null;
    for (const e of this.scene.enemies) {
      if (!fightsOnLane(e) || e.x < this.x - this.width) continue;
      if (!best || e.x < best.x) best = e;
    }
    return best;
  }

  update(dt) {
    if (!this.alive) return false;
    this.time -= dt;
    if (this.time <= 0) {
      this.crumble();
      return false;
    }
    if (this.riseTime > 0) {
      this.riseTime -= dt;
      if (this.riseTime <= 0) {
        this.circle?.destroy();
        this.circle = null;
      }
      this.draw();
      return true;
    }
    const { spec } = this;
    const target = this.frontEnemy();
    const reach = target ? (this.width + target.def.width) / 2 + 1 : 0;
    let moving = false;
    if (!target || target.x - this.x > reach) {
      const limit = target ? target.x - reach : LAYOUT.enemySpawnX - this.width;
      const x = Math.min(limit, this.x + spec.speed * dt / 1000);
      moving = x > this.x;
      this.x = Math.max(this.x, x);
    } else {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this.cooldown = spec.attackInterval;
        target.takeDamage(this.damage, { source: this.source });
        playFx(this.scene, 'hit_spark', target.x, target.y);
        this.scene.tweens.add({ targets: this.body, angle: 15, duration: 80, yoyo: true });
      }
    }
    if (moving !== this.moving) {
      this.moving = moving;
      if (this.walkAnim && moving) this.body.play(this.walkAnim, true);
      else this.body.anims?.stop();
    }
    this.feetY = laneFeetY(this.x);
    this.draw();
    return true;
  }

  takeDamage(amount) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp > 0) return;
    if (this.explode) this.blowUp();
    this.crumble();
  }

  blowUp() {
    const { radius, damage } = this.explode;
    playFx(this.scene, 'explosion', Math.round(this.x), Math.round(this.feetY - 10));
    for (const e of this.scene.enemies) {
      if (e.alive && !e.airborne && Math.abs(e.x - this.x) <= radius) e.takeDamage(damage, { lobbed: true, source: this.source });
    }
  }

  // Its time is up or it's beaten: it fades away.
  crumble() {
    if (!this.alive) return;
    this.alive = false;
    this.circle?.destroy();
    this.hpBar.destroy();
    this.scene.tweens.add({
      targets: this.body, alpha: 0, duration: this.spec.fadeMs, onComplete: () => this.body.destroy(),
    });
  }

  draw() {
    this.body.setPosition(Math.round(this.x), Math.round(this.feetY));
    const w = this.width + 4;
    const x = Math.round(this.x - w / 2);
    const y = Math.round(this.feetY - this.spec.height - 4);
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.6).fillRect(x, y, w, 2);
    this.hpBar.fillStyle(this.spec.hpBarColor).fillRect(x, y, Math.round(w * Math.max(0, this.hp / this.maxHp)), 2);
  }

  // Gone at once (the wave ended).
  destroy() {
    this.alive = false;
    this.circle?.destroy();
    this.hpBar.destroy();
    this.body.destroy();
  }
}
