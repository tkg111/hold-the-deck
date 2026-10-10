import { FX, HEROES, SPRITES } from '../config.js';
import { laneFeetY } from '../layout.js';
import { FX_DEPTH, fxSprite, playFx } from '../fx.js';
import { findAnim, fxKey, sheetKey } from '../sprites.js';
import { damageSource } from '../systems/BattleStats.js';
import { DEPTH } from './Ship.js';
import {
  ChainLightning, LobProjectile, nearestLiving, PiercingProjectile, Projectile,
} from './Projectile.js';

export class Hero {
  // damage and attackInterval come from Progress (level, stars, deck buffs);
  // aura ({ from, damage, speed }): The Captain's deck buff, if he buffs
  // this crewmate (for the Captain's Log).
  // The hero stands with its feet at (x, feetY); this.y is the middle of its
  // body, where shots start.
  constructor(scene, id, { index, x, feetY }, {
    damage, attackInterval, buffed = false, aura = null,
  }) {
    this.scene = scene;
    this.id = id;
    this.def = HEROES[id];
    this.aura = aura;
    // Captain's Log credit for each kind of damage (see BattleStats).
    this.source = {
      attack: damageSource(id, 'attack'), ability: damageSource(id, 'ability'), effect: damageSource(id, 'effect'),
    };
    this.damage = damage;
    this.attackInterval = attackInterval;
    this.cooldown = 0;
    // Abilities: attack speed boosts ({ mult, time, fx } with time in ms left
    // and fx the sprite shown while it lasts) and The Duelist's Lunge
    // ({ hits } left, each a guaranteed crit on the toughest enemy, and the
    // impact played on each).
    this.boosts = [];
    this.lunge = null;
    this.boostSprites = {};   // fx sprite name -> sprite
    // Stunned by the Siren's song: no attacks (cooldown paused), stun stars
    // over the head.
    this.stunTime = 0;
    this.stunStars = null;
    // Anti-air crew can hit flyers in the air; the Net Thrower can aim at
    // them too (his net grounds them).
    this.antiAir = !!(this.def.antiAir || this.def.netsFlyers);

    const sprite = SPRITES.heroes[id];
    const { width } = SPRITES.placeholderHero;
    const height = sprite ? sprite.height : SPRITES.placeholderHero.height;
    this.x = x;
    this.feetY = feetY;
    this.y = feetY - height / 2;
    this.top = feetY - height;

    // Buff ring under the feet while boosted: always for a hero The Captain
    // buffs (deck buff), and while an ability boost lasts. The Captain
    // himself stands on a still, dimmed one otherwise (the buff's source).
    this.buffed = buffed;
    this.buffRing = null;
    this.buffRingMode = null;   // "boosted", "source" or null
    this.syncBuffRing();
    this.idleAnim = sprite && findAnim(scene, sprite.key, 'idle');
    this.attackAnim = sprite && findAnim(scene, sprite.key, 'attack');
    if (this.idleAnim) {
      this.body = scene.add.sprite(x, feetY, sheetKey(sprite.key)).setOrigin(0.5, 1);
      this.playIdle(index);
      if (this.attackAnim) {
        this.body.on(`animationcomplete-${this.attackAnim}`, () => this.playIdle());
      }
    } else if (sprite) {
      this.body = scene.add.image(x, feetY, sprite.key).setOrigin(0.5, 1);
    } else {
      this.body = scene.add.rectangle(x, feetY, width, height, this.def.color).setOrigin(0.5, 1).setStrokeStyle(1, 0x1b1b1b);
    }
    this.body.setDepth(DEPTH.hero);
  }

  // --- Abilities ---

  // fx: { sprite, behind } — an fx sheet standing on the hero's slot while the
  // boost lasts, behind the hero or (default) over them.
  addBoost(mult, duration, fx) {
    this.boosts.push({ mult, time: duration, fx });
    const name = fx.sprite;
    if (!this.boostSprites[name]) {
      this.boostSprites[name] = fxSprite(this.scene, name, this.x, this.feetY).setOrigin(0.5, 1)
        .setDepth(fx.behind ? DEPTH.hero - 0.5 : DEPTH.slotMarkers);
    }
    this.syncBuffRing();
  }

  startLunge(hits, target, impact) {
    this.lunge = { hits, target, impact };
    this.cooldown = 0;  // first lunge straight away
  }

  syncBuffRing() {
    const boosted = this.buffed || this.boosts.length > 0;
    const mode = boosted ? 'boosted' : this.def.aura ? 'source' : null;
    if (mode === this.buffRingMode) return;
    this.buffRingMode = mode;
    if (!mode) {
      this.buffRing?.destroy();
      this.buffRing = null;
      return;
    }
    const { sprite, footRow, sourceAlpha } = FX.buffRing;
    if (!this.buffRing) {
      this.buffRing = fxSprite(this.scene, sprite, this.x, this.feetY);
      this.buffRing.setOrigin(0.5, (footRow + 0.5) / this.buffRing.height).setDepth(DEPTH.hero - 0.6);
    }
    const anim = fxKey(sprite);
    if (mode === 'boosted') {
      this.buffRing.setAlpha(1);
      if (this.scene.anims.exists(anim)) this.buffRing.play(anim);
    } else {
      this.buffRing.setAlpha(sourceAlpha).stop();
      if (this.scene.anims.exists(anim)) this.buffRing.setFrame(0);
    }
  }

  // End of a wave: boosts, Lunge and stuns end with it.
  clearAbilities() {
    this.boosts = [];
    this.lunge = null;
    this.stunTime = 0;
    this.tickAbilities(0);
    this.tickStun(0);
  }

  // The Siren's note: no attacks for ms.
  stun(ms) {
    this.stunTime = Math.max(this.stunTime, ms);
    if (!this.stunStars) {
      this.stunStars = fxSprite(this.scene, 'stun_stars', Math.round(this.x), Math.round(this.top) - FX.statusGap)
        .setOrigin(0.5, 1).setDepth(DEPTH.slotMarkers);
    }
    this.body.anims?.pause();
  }

  tickStun(dt) {
    this.stunTime = Math.max(0, this.stunTime - dt);
    if (this.stunTime > 0 || !this.stunStars) return;
    this.stunStars.destroy();
    this.stunStars = null;
    this.body.anims?.resume();
  }

  get isStunned() { return this.stunTime > 0; }

  // Whether this crewmate can hit (or, the Net Thrower, net) the enemy.
  canHit(e) { return e.canBeHit(this.antiAir); }

  get speedMult() {
    return this.boosts.reduce((m, b) => m * b.mult, 1);
  }

  tickAbilities(dt) {
    for (const b of this.boosts) b.time -= dt;
    this.boosts = this.boosts.filter((b) => b.time > 0);
    for (const [name, sprite] of Object.entries(this.boostSprites)) {
      if (this.boosts.some((b) => b.fx.sprite === name)) continue;
      sprite.destroy();
      delete this.boostSprites[name];
    }
    this.syncBuffRing();
  }

  // The enemy with the most HP left (Lunge's target).
  toughest(enemies) {
    let best = null;
    for (const e of enemies) if (this.canHit(e) && (!best || e.hp > best.hp)) best = e;
    return best;
  }

  // Loop the idle animation. When placed on the ship, the start frame is
  // staggered by slot so the crew doesn't all bob in sync.
  playIdle(slot = 0) {
    const frames = this.scene.anims.get(this.idleAnim).getTotalFrames();
    this.body.play({ key: this.idleAnim, startFrame: slot % frames });
  }

  // Returns a new projectile if the hero fired this frame.
  update(dt, enemies) {
    this.tickAbilities(dt);
    this.tickStun(dt);
    if (this.def.aura || this.isStunned) return null;  // support hero: never attacks
    this.cooldown -= dt * this.speedMult;
    if (this.cooldown > 0) return null;

    const lunging = this.lunge != null;
    const target = lunging ? this.toughest(enemies) : this.pickTarget(enemies);
    if (!target) return null;

    this.cooldown = this.attackInterval;
    if (this.attackAnim) this.body.play(this.attackAnim);
    else this.scene.tweens.add({ targets: this.body, scaleX: this.body.scaleX * 1.2, duration: 60, yoyo: true });
    let lunge = null;
    if (lunging) {
      lunge = this.lunge;
      lunge.target = target;
      if (--lunge.hits <= 0) this.lunge = null;
    }
    return this.fire(target, lunge);
  }

  // Where shots leave from: the musket's tip for the Sharpshooter (with its
  // flash), the middle of the body for everyone else.
  muzzlePoint() {
    const { muzzle } = this.def;
    if (!muzzle) return { x: this.x, y: this.y };
    const x = Math.round(this.x + muzzle.x);
    const y = Math.round(this.feetY + muzzle.y);
    if (muzzle.fx) playFx(this.scene, muzzle.fx, x, y).setOrigin(0, 0.5);
    return { x, y };
  }

  // lunge: set for a Lunge shot, which always crits (for heroes that can
  // crit) and plays its impact on the target.
  fire(target, lunge = null) {
    const { def } = this;
    if (def.chain) return this.chainLightning(target);
    const common = {
      ...this.muzzlePoint(), target,
      sprite: def.projectile.sprite, rotate: def.projectile.rotate,
      onHit: (hit, x, y) => this.onHit(hit, x, y, lunge),
      // Used when the target dies mid-flight.
      findTarget: (x, y) => nearestLiving(this.scene.enemies, x, y, (e) => this.canHit(e)),
    };
    if (def.lob) {
      return new LobProjectile(this.scene, {
        ...common,
        flightTime: def.lob.flightTime, arcHeight: def.lob.arcHeight,
        aimAt: (enemy, msLeft) => this.leadPoint(enemy, msLeft),
      });
    }
    if (def.pierce) {
      return new PiercingProjectile(this.scene, {
        ...common, ...def.pierce,
        speed: def.projectileSpeed,
        enemies: () => this.scene.enemies,
        canHit: (e) => this.canHit(e),
      });
    }
    return new Projectile(this.scene, { ...common, speed: def.projectileSpeed });
  }

  // The Storm Caller: lightning from his staff to the target, then on to
  // the nearest enemy not yet hit within chain.jump, up to chain.targets;
  // each jump hits for chain.falloff x the last. Hits land at once; the bolt
  // shows for a moment.
  chainLightning(first) {
    const { chain } = this.def;
    const targets = [first];
    while (targets.length < chain.targets) {
      const last = targets[targets.length - 1];
      const next = nearestLiving(this.scene.enemies, last.x, last.y,
        (e) => this.canHit(e) && !targets.includes(e) && Math.hypot(e.x - last.x, e.y - last.y) <= chain.jump);
      if (!next) break;
      targets.push(next);
    }
    const from = { x: Math.round(this.x + chain.from.x), y: Math.round(this.feetY + chain.from.y) };
    const points = [from, ...targets.map((e) => ({ x: e.x, y: e.y }))];
    let damage = this.damage;
    for (const e of targets) {
      playFx(this.scene, chain.impact, e.x, e.y);
      e.takeDamage(damage * (e.def.flies ? this.def.flyerBonus ?? 1 : 1), { source: this.source.attack });
      damage *= chain.falloff;
    }
    return new ChainLightning(this.scene, { points, sprite: chain.segment, showMs: chain.segmentMs });
  }

  // Where an enemy will be after msLeft, for lobbed shots: walking left at its
  // current (possibly slowed) speed, standing still if stunned, scared or
  // pushed, never past where it stops. Walkers follow the lane up or down,
  // boats the waterline. Flyers, the Siren and the Ghost Galleon are aimed at
  // where they are.
  leadPoint(enemy, msLeft) {
    const { def } = enemy;
    if (def.flies || def.stationary || def.galleon) return { x: enemy.x, y: enemy.y };
    const still = enemy.isStunned || enemy.isAfraid || enemy.pushLeft > 0;
    const lead = still ? 0 : enemy.speed * enemy.pace * msLeft / 1000;
    const x = Math.max(enemy.stopX, enemy.x - lead);
    const y = def.emerges || def.floats ? enemy.y : laneFeetY(x) - def.height / 2;
    return { x, y };
  }

  // Closest living enemy to the ship that's within range (and that it can
  // hit: flyers in the air need anti-air); the furthest instead for the
  // Sharpshooter (targets: 'furthest'). The Voodoo Priestess prefers
  // enemies that aren't cursed yet, the Grog Brewer ones not yet poisoned,
  // so their effects spread across the wave, and the Net Thrower flyers still
  // in the air, to ground them.
  pickTarget(enemies) {
    const { curse, poison, netsFlyers } = this.def;
    const furthest = this.def.targets === 'furthest';
    let best = null;
    let bestFresh = null;
    for (const e of enemies) {
      if (!this.canHit(e)) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) > this.def.range) continue;
      if (!best || (furthest ? e.x > best.x : e.x < best.x)) best = e;
      const fresh = (curse && !e.isCursed) || (poison && !e.isPoisoned) || (netsFlyers && e.airborne);
      if (fresh && (!bestFresh || e.x < bestFresh.x)) bestFresh = e;
    }
    return bestFresh || best;
  }

  // The shot landed at (x, y): its impact plays there, then damage and
  // effects go to the target (or everything in the area it can hit). Lobbed
  // shots go over a Barnacle Knight's shield and the Ghost Pirate's cutlass
  // passes through it; the Sharpshooter's ignore armour; the Parrot Keeper's
  // hit flyers harder. Lunge shots count as the Duelist's ability in the
  // Captain's Log; curses and poison as effects.
  onHit(target, x, y, lunge = null) {
    const {
      area, stun, slow, curse, poison, crit, lob, flyerBonus, passesShields, ignoresArmor,
    } = this.def;
    playFx(this.scene, this.def.projectile.impact, x, y);
    const victims = area
      ? this.scene.enemies.filter((e) => this.canHit(e) && Math.hypot(e.x - x, e.y - y) <= area.radius)
      : (target && this.canHit(target) ? [target] : []);

    const { stats } = this.scene;
    const source = lunge ? this.source.ability : this.source.attack;
    for (const e of victims) {
      let damage = this.damage;
      if (crit && (lunge || Math.random() < crit.chance)) {
        damage *= crit.multiplier;
        this.scene.floatText(e.x, e.y - e.def.height / 2 - 13, 'CRIT!', '#ffca28');
      }
      if (lunge) playFx(this.scene, lunge.impact, e.x, e.y, FX_DEPTH + 1);
      if (flyerBonus && e.def.flies) damage *= flyerBonus;
      e.takeDamage(damage, {
        lobbed: !!lob, throughShield: !!passesShields, ignoreArmor: !!ignoresArmor, source,
      });
      if (!e.alive) continue;
      if (stun && Math.random() < stun.chance) {
        e.applyStun(stun.duration);
        stats?.add(this.id, 'stuns');
      }
      if (slow) {
        e.applySlow(slow.factor, slow.duration);
        stats?.add(this.id, 'slowed');
      }
      if (curse) e.applyCurse(curse.bonus, curse.duration, this.source.effect);
      if (poison) e.applyPoison(this.damage * poison.ratio, poison.duration, this.source.effect);
    }
  }

  destroy() {
    this.buffRing?.destroy();
    this.stunStars?.destroy();
    for (const sprite of Object.values(this.boostSprites)) sprite.destroy();
    this.body.destroy();
  }
}
