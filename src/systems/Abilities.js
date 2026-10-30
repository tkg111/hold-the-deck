import Phaser from 'phaser';
import { ABILITIES, ABILITY_BAR, ALLIES } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { LAYOUT, laneFeetY } from '../layout.js';
import { AllySkeleton } from '../entities/Ally.js';
import { LobProjectile, nearestLiving, Projectile } from '../entities/Projectile.js';
import { DEPTH } from '../entities/Ship.js';
import { FX_DEPTH, fxDuration, fxSize, fxSprite, playFx } from '../fx.js';
import { fxKey } from '../sprites.js';
import { cssColor, formatNum } from '../ui/format.js';

// Active abilities for the crew on the ship: one per crewmate (ABILITIES in
// config), each on its own cooldown. Used from the ability bar or keys 1-6,
// or fired automatically when ready with Auto on. Everything runs on the
// battle's dt, so x2 speed speeds abilities up too.
export class AbilitySystem {
  constructor(scene) {
    this.scene = scene;
    this.slots = [];
    this.effects = [];   // ongoing effects: update(dt) -> false when finished
    this.allies = [];    // friendly units on the lane (the Bone Caller's skeletons)
  }

  // heroes: the Hero objects on the ship, in slot order.
  setCrew(heroes, progress) {
    this.clear();
    this.slots = heroes.map((hero) => ({
      hero,
      id: hero.id,
      def: hero.abilityDef ?? ABILITIES[hero.id],   // an awakened crewmate's (AWAKEN.crew)
      scale: progress.abilityScale(hero.id),
      cooldown: 0,
    }));
  }

  // Every ability starts ready at the beginning of a wave.
  resetCooldowns() {
    for (const s of this.slots) s.cooldown = 0;
  }

  // Remaining cooldown as a fraction (0 = ready).
  remaining(i) {
    const s = this.slots[i];
    return s ? s.cooldown / s.def.cooldown : 0;
  }

  isReady(i) { return this.slots[i]?.cooldown <= 0; }

  // Only worth using with an enemy on screen it can reach (in range of the
  // crewmate, for the attack speed boosts; flyers in the air only count for
  // abilities with air), or what `needs` asks for: a flyer (Flock), a walker
  // (Haunt, Tidal Wave) or hull to mend (Patch Up; with Auto, only once at
  // least a full repair's worth is missing, so none of it is wasted) or
  // 'near' an enemy within def.radius of the ship (Wail).
  hasTarget({ hero, def }, auto = false) {
    if (def.needs === 'repairs') {
      const { ship } = this.scene;
      const missing = ship.maxHp - ship.hp;
      return auto ? missing >= ship.maxHp * def.heal : missing > 0;
    }
    const range = def.needsRange ? ABILITY_BAR.supportRange : Infinity;
    return this.targets({ air: def.air, needs: def.needs, near: def.radius })
      .some((e) => Math.hypot(e.x - hero.x, e.y - hero.y) <= range);
  }

  // Fire ability i if it's ready and has a target. Returns whether it fired.
  trigger(i, { auto = false } = {}) {
    const s = this.slots[i];
    if (!s || s.cooldown > 0) return false;
    if (!this.hasTarget(s, auto)) {
      if (!auto) sfx.play('ui_error');
      return false;
    }
    s.cooldown = s.def.cooldown;
    this.scene.stats?.abilityUsed(s.id);
    sfx.play('ui_open');
    const { hero } = s;
    this.scene.floatText(hero.x, hero.y - 22, s.def.name.toUpperCase(), cssColor(s.def.color));
    ACTIONS[s.id](this, s);
    return true;
  }

  update(dt, auto) {
    this.scene.crewBuffs = crewBuffs(this.scene.heroes ?? []);
    for (const s of this.slots) s.cooldown = Math.max(0, s.cooldown - dt);
    this.scene.ship.tickShield?.(dt);
    this.effects = this.effects.filter((fx) => {
      if (fx.update(dt)) return true;
      fx.destroy();
      return false;
    });
    this.allies = this.allies.filter((a) => a.alive);
    if (auto) this.slots.forEach((_, i) => this.trigger(i, { auto: true }));
  }

  // End of a wave: stop every ongoing effect.
  clear() {
    for (const fx of this.effects) fx.destroy();
    this.effects = [];
    for (const a of this.allies) a.destroy();
    this.allies = [];
  }

  // Enemies an ability can affect: those on the lane, plus flyers in the
  // air with air; only flyers with needs 'flyers', only walkers (that can
  // be scared or pushed) with 'movable', only those within `near` px of where
  // walkers stop at the ship with 'near'.
  targets({ air = false, needs = null, near = Infinity } = {}) {
    return this.scene.enemies.filter((e) => e.canBeHit(air)
      && (needs !== 'flyers' || e.def.flies)
      && (needs !== 'ranged' || e.def.ranged)
      && (needs !== 'movable' || e.canBeMoved)
      && (needs !== 'near' || nearShip(e) <= near));
  }

  // An arcing throw of the ability's sprite from the hero at an enemy (bends
  // to another if it dies).
  lob({ hero, def }, target, { aimAt, onLand }) {
    this.scene.projectiles.push(new LobProjectile(this.scene, {
      x: hero.x, y: hero.y, target,
      flightTime: def.flightTime, arcHeight: def.arcHeight, sprite: def.sprite,
      findTarget: (x, y) => nearestLiving(this.scene.enemies, x, y, (e) => e.canBeHit(false)),
      aimAt,
      onHit: (_hit, x, y) => onLand(x, y),
    }));
  }
}

// What each ability does, by hero id: (system, slot) => void.
const ACTIONS = {
  // Rapid Fire: the Cabin Boy attacks faster for a while.
  cabinBoy(sys, { hero, def, scale }) {
    hero.addBoost(def.attackSpeed, def.duration * scale, def.fx);
  },

  // Hot Stew: a pot lobbed at the thickest crowd stuns everything it splashes.
  shipsCook(sys, slot) {
    const { hero, def, scale } = slot;
    const enemies = sys.targets();
    let best = enemies[0];
    let bestCount = -1;
    for (const e of enemies) {
      const count = enemies.filter((o) => Math.hypot(o.x - e.x, o.y - e.y) <= def.radius).length;
      if (count > bestCount || (count === bestCount && e.x < best.x)) {
        best = e;
        bestCount = count;
      }
    }
    sys.lob(slot, best, {
      aimAt: (e, ms) => hero.leadPoint(e, ms),
      onLand: (x, y) => {
        for (const e of sys.targets()) {
          if (Math.hypot(e.x - x, e.y - y) > def.radius) continue;
          e.applyStun(def.stun * scale);
          sys.scene.stats?.add(hero.id, 'stuns');
        }
        playFx(sys.scene, def.impact, x, y);
        sfx.play('hit_heavy');
      },
    });
  },

  // Big Net: slows every enemy on screen, grounding flyers.
  netThrower(sys, { hero, def, scale }) {
    const duration = def.duration * scale;
    const caught = sys.targets({ air: true });
    for (const e of caught) e.applySlow(def.slow, duration);
    sys.scene.stats?.add(hero.id, 'slowed', caught.length);
    sys.effects.push(new NetDrop(sys.scene, def, duration));
  },

  // Grog Barrel: smashes in front of the leading enemy, leaving a poison puddle.
  grogBrewer(sys, slot) {
    const { hero, def, scale } = slot;
    const { width } = fxSize(sys.scene, def.puddle);
    const lead = sys.targets().reduce((a, e) => (!a || e.x < a.x ? e : a), null);
    const spot = (x) => Math.max(LAYOUT.shipContactX + width / 2, x - width / 4);
    sys.lob(slot, lead, {
      aimAt: (e, ms) => {
        const x = spot(hero.leadPoint(e, ms).x);
        return { x, y: laneFeetY(x) - 2 };
      },
      onLand: (x, y) => {
        playFx(sys.scene, def.impact, x, y);
        sys.effects.push(new Puddle(sys, x, def, hero.damage * def.damagePerSecond, def.duration * scale, hero.source.effect));
        sfx.play('hit_heavy');
      },
    });
  },

  // Whale Harpoon: sweeps the whole lane, hitting every enemy once (through armour).
  harpooner(sys, { hero, def }) {
    sys.effects.push(new WhaleHarpoon(sys, def, hero.damage * def.damage, hero.source.ability));
    shake(sys.scene, def.shake);
  },

  // Hex: the Priestess casts, then curses every enemy on screen.
  voodooPriestess(sys, { hero, def, scale }) {
    sys.effects.push(new HexCast(sys, hero, def, scale));
  },

  // Broadside: cannonballs rain down spread along the lane.
  cannoneer(sys, { hero, def }) {
    sys.effects.push(new Broadside(sys, def, hero.damage * def.damage, hero.source.ability));
  },

  // Lunge: the Duelist's next hits go to the toughest enemy, all crits.
  duelist(sys, { hero, def }) {
    hero.startLunge(def.hits, hero.toughest(sys.scene.enemies), def.impact);
    sys.effects.push(new LungeMark(sys.scene, hero, def.mark));
  },

  // All Hands!: the whole crew attacks faster.
  captain(sys, { def, scale }) {
    for (const h of sys.scene.heroes) h.addBoost(def.attackSpeed, def.duration * scale, def.fx);
  },

  // Flock: a parrot homes on every flyer on screen, and more fly across the sky.
  parrotKeeper(sys, { hero, def }) {
    const damage = hero.damage * def.damage;
    for (const e of sys.targets({ air: true, needs: 'flyers' })) {
      sys.scene.projectiles.push(new Projectile(sys.scene, {
        x: hero.x, y: hero.y, target: e, speed: def.speed, sprite: def.sprite,
        onHit: (hit, x, y) => {
          hit.takeDamage(damage, { source: hero.source.ability });
          playFx(sys.scene, def.impact, x, y);
        },
        findTarget: () => null,   // a parrot whose flyer is gone flies off
      }));
    }
    sys.effects.push(new FlockFlight(sys.scene, hero, def));
  },

  // Patch Up: mends part of the hull, with crosses rising over it.
  shipsDoctor(sys, { hero, def }) {
    const { ship } = sys.scene;
    const healed = ship.heal(ship.maxHp * def.heal);
    sys.scene.stats?.add(hero.id, 'healed', healed);
    sys.effects.push(new HealRise(sys.scene, def));
    const at = ship.hullTarget();
    sys.scene.floatText(at.x, at.y - def.rise, `+${formatNum(Math.round(healed))} HP`, cssColor(def.color));
    if (def.shieldMs) ship.shield(def.shieldMs);
  },

  // Deadeye: marks the toughest enemy, then one huge shot at it.
  sharpshooter(sys, { hero, def }) {
    sys.effects.push(new Deadeye(sys, hero, def));
  },

  // Haunt: every walker on screen flees back toward the island.
  ghostPirate(sys, { def, scale }) {
    for (const e of sys.targets({ needs: 'movable' })) e.applyFear(def.duration * scale, def.fearBonus ?? 0);
  },

  // Tidal Wave: a wave rolls along the lane, pushing walkers back.
  stormCaller(sys, { hero, def }) {
    sys.effects.push(new TidalWave(sys, def, hero.damage * def.damage, hero.source.ability));
  },

  // Drop Anchor: an anchor slams onto the frontmost enemy on the lane.
  anchorBosun(sys, { hero, def, scale }) {
    const front = sys.targets().reduce((a, e) => (!a || e.x < a.x ? e : a), null);
    sys.effects.push(new AnchorDrop(sys, hero, def, front, scale));
  },

  // Powder Barrage: bombs lobbed to spots spread along the lane.
  powderMonkey(sys, slot) {
    sys.effects.push(new PowderBarrage(sys, slot));
  },

  // Inferno: a wall of fire on the lane that burns walkers going through.
  fireBreather(sys, { hero, def, scale }) {
    sys.effects.push(new InfernoWall(sys, def, hero.damage * def.damagePerSecond, def.duration * scale, hero.source.effect));
    if (def.burnsFlyers) {
      for (const e of sys.targets({ air: true, needs: 'flyers' })) {
        e.applyBurn(hero.damage * def.damagePerSecond, def.duration * scale, hero.source.effect);
      }
    }
    sfx.play('cook');
  },

  // Temper Steel: the whole crew hits harder for a while.
  blacksmith(sys, { def, scale }) {
    for (const h of sys.scene.heroes) h.addBoost(1 + def.bonus, def.duration * scale, def.fx, 'damage', def.crit ?? null);
  },

  // Whale Hunt: one huge spear at the enemy with the most HP.
  whaler(sys, { hero, def }) {
    const { scene } = sys;
    const toughest = () => sys.targets({ air: true }).reduce((a, e) => (!a || e.hp > a.hp ? e : a), null);
    scene.projectiles.push(new Projectile(scene, {
      ...hero.muzzlePoint(), target: toughest(), speed: def.speed, sprite: def.sprite, rotate: true,
      onHit: (hit, x, y) => {
        hit.takeDamage(hero.damage * def.damage, { ignoreArmor: true, source: hero.source.ability });
        if (def.freeze && hit.alive && !hit.applyFreeze(def.freeze)) hit.applyStun(def.freeze);
        playFx(scene, def.impact, x, y);
        shake(scene, def.shake);
        sfx.play('cannon');
      },
      findTarget: () => toughest(),
    }));
  },

  // Aurora Veil: the sky lights up and every enemy freezes (bosses slow).
  auroraSeer(sys, { hero, def, scale }) {
    const duration = def.duration * scale;
    let frozen = 0;
    for (const e of sys.targets({ air: true })) {
      if (e.def.boss) e.applyChill(def.slow, duration);
      else if (e.applyFreeze(duration)) frozen++;
      if (def.after && !e.def.boss) e.applyChill(def.after.factor, duration + def.after.duration);
    }
    sys.scene.stats?.add(hero.id, 'stuns', frozen);
    sys.effects.push(new AuroraVeil(sys.scene, def, duration));
    sfx.play('freeze');
  },

  // Wail: a shriek from the ship hits, shoves back and scares what's near.
  banshee(sys, { hero, def, scale }) {
    const { scene } = sys;
    const ring = playFx(scene, def.sprite, LAYOUT.shipContactX + def.ringX, laneFeetY(LAYOUT.shipContactX) - def.ringY);
    ring.setOrigin(0, 0.5).setScale(def.ringScale);
    for (const e of sys.targets({ air: true, needs: 'near', near: def.radius })) {
      if (def.breakShields) e.stripShields();
      e.takeDamage(hero.damage * def.damage, { source: hero.source.ability });
      if (!e.alive) continue;
      e.pushBack(def.push, def.pushSpeed);
      e.applyFear(def.duration * scale);
    }
    shake(scene, { duration: 200, intensity: 0.002 });
  },

  // Raise the Crew: friendly skeletons rise near the ship and walk out to fight.
  boneCaller(sys, { hero, def, scale }) {
    const spec = ALLIES.skeleton;
    const raised = Array.from({ length: def.count }, (_, i) => new AllySkeleton(sys.scene, def.x + i * def.spread, {
      hp: spec.hp * hero.damage,
      damage: spec.damage * hero.damage,
      duration: def.duration * scale,
      source: hero.source.ability,
      circle: def.circle,
      explode: def.explode ? { radius: def.explode.radius, damage: def.explode.damage * hero.damage } : null,
    }));
    sys.allies.push(...raised);
    sys.effects.push(new AlliesOut(raised));
  },
};

// --- The Uncharted Seas' crew ---

// What the crew aboard gives the whole crew (HEROES crewAura, reveals),
// while each giver can act (not stunned or frozen): { attackSpeed, range }
// multipliers and whether hidden foes are revealed.
export function crewBuffs(heroes) {
  const buffs = { attackSpeed: 1, range: 1, reveal: false };
  for (const h of heroes) {
    if (h.isStunned || h.isFrozen) continue;
    const a = h.def.crewAura;
    if (a?.attackSpeed) buffs.attackSpeed += a.attackSpeed;
    if (a?.range) buffs.range += a.range;
    if (h.def.reveals) buffs.reveal = true;
  }
  return buffs;
}

Object.assign(ACTIONS, {
  // Rope Swing: a hook at every flyer on screen, grounding it.
  rigger(sys, { hero, def }) {
    for (const e of sys.targets({ air: true, needs: 'flyers' })) {
      sys.scene.projectiles.push(new Projectile(sys.scene, {
        x: hero.x, y: hero.y, target: e, speed: def.speed, sprite: def.sprite, rotate: true,
        rope: { from: { x: hero.x, y: hero.y }, color: hero.def.rope },
        onHit: (hit, x, y) => {
          hit.takeDamage(hero.damage * def.damage * (hero.def.flyerBonus ?? 1), { source: hero.source.ability });
          if (hit.alive) hit.applyGround(def.ground, !!def.pin);
          playFx(sys.scene, 'hit_spark', x, y);
        },
        findTarget: () => null,
      }));
    }
    sfx.play('cannon_small');
  },

  // Fan the Hammer: a quick string of shots at random foes.
  gunslinger(sys, slot) {
    sys.effects.push(new FanTheHammer(sys, slot));
  },

  // Minefield: mines lobbed down the lane.
  pearlDiver(sys, slot) {
    sys.effects.push(new Minefield(sys, slot));
  },

  // Lullaby: every foe slowed (awakened: and hushed, its attacks stopped).
  tideSinger(sys, { hero, def, scale }) {
    const duration = def.duration * scale;
    const lulled = sys.targets({ air: true });
    for (const e of lulled) {
      e.applyChill(def.slow, duration);
      if (def.hush) e.applyHush(duration);
    }
    sys.scene.stats?.add(hero.id, 'slowed', lulled.length);
    sys.effects.push(new SongNotes(sys.scene, hero, def));
    sfx.play('siren_song', { volume: 0.6 });
  },

  // Flare: every foe marked (more damage taken, seen); awakened, the crew crits.
  lookout(sys, { def, scale }) {
    const duration = def.duration * scale;
    const flare = playFx(sys.scene, def.sprite, def.x, def.y);
    flare.setScale(2);
    for (const e of sys.targets({ air: true })) e.applyFlare(def.bonus, duration);
    for (const e of sys.scene.enemies) if (e.alive && e.def.lurks) e.applyFlare(def.bonus, duration);
    if (def.crit) for (const h of sys.scene.heroes) h.addBoost(1, duration, null, 'damage', def.crit);
    sfx.play('cannon_small');
  },

  // Ink Cloud: ranged foes inside can't shoot.
  octopusTamer(sys, { def, scale }) {
    sys.effects.push(new InkCloud(sys, def, def.duration * scale));
    sfx.play('splash');
  },

  // Reef Wall: a coral wall the horde must hack through.
  coralDruid(sys, { hero, def, scale }) {
    const wall = new CoralWall(sys.scene, def, {
      hp: def.hp * hero.damage, duration: def.duration * scale, reflect: def.reflect ?? 0, source: hero.source.ability,
    });
    sys.allies.push(wall);
    sys.effects.push(new AlliesOut([wall]));
    sfx.play('hit_heavy');
  },

  // Axe Storm: an axe sweeps the lane out and back (awakened: twice over).
  berserker(sys, { hero, def }) {
    sys.effects.push(new AxeStorm(sys, def, hero, def.storms));
    shake(sys.scene, { duration: 120, intensity: 0.002 });
  },
});

// A Pearl Diver's sea mine on the lane (from her throw, landing first, or
// Minefield): the first walker or swimmer within trigger px (plus half its
// width) sets it off, blasting everything on the lane within radius for
// `damage` (awakened: chilling them too). owner: the Pearl Diver whose
// throw it was (her count of mines out), or null.
export class SeaMine {
  constructor(sys, owner, {
    x, trigger, radius, damage, chill = null, source = null,
  }) {
    this.sys = sys;
    this.owner = owner;
    Object.assign(this, {
      x, trigger, radius, damage, chill, source,
    });
    this.landed = false;
    this.spent = false;
    this.sprite = null;
  }

  land() {
    if (this.spent || this.landed) return;
    this.landed = true;
    this.sprite = fxSprite(this.sys.scene, 'sea_mine', Math.round(this.x), Math.round(laneFeetY(this.x)) + 1)
      .setOrigin(0.5, 1).setDepth(DEPTH.foreground + 0.4);
  }

  update() {
    if (this.spent) return false;
    if (!this.landed) return true;
    const hit = this.sys.targets().some((e) => !e.anchored && Math.abs(e.x - this.x) <= this.trigger + e.def.width / 2);
    if (hit) this.blast();
    return !this.spent;
  }

  blast() {
    this.spent = true;
    const { scene } = this.sys;
    for (const e of this.sys.targets()) {
      if (Math.abs(e.x - this.x) > this.radius + e.def.width / 2) continue;
      e.takeDamage(this.damage, { lobbed: true, source: this.source });
      if (this.chill && e.alive) e.applyChill(this.chill.factor, this.chill.duration);
    }
    playFx(scene, 'mine_blast', Math.round(this.x), Math.round(laneFeetY(this.x)) + 2).setOrigin(0.5, 1);
    sfx.play('cannon');
  }

  destroy() { this.sprite?.destroy(); }
}

// Minefield: def.mines mines lobbed from the Pearl Diver, def.interval ms
// apart, to spots spread down the lane (shuffled), each a SeaMine of
// def.damage x her damage. They don't count against her own mines.
class Minefield {
  constructor(sys, { hero, def }) {
    this.sys = sys;
    this.hero = hero;
    this.def = def;
    this.time = 0;
    const { radius, trigger } = hero.def.mines;
    const from = LAYOUT.shipContactX + radius;
    const to = LAYOUT.enemySpawnX - radius;
    const spots = Array.from({ length: def.mines }, (_, i) => from + (to - from) * (i + 0.5) / def.mines);
    this.throws = Phaser.Utils.Array.Shuffle(spots).map((x, i) => ({ x, start: i * def.interval, thrown: false }));
    this.spec = { trigger, radius, chill: def.chill ?? null };
  }

  update(dt) {
    this.time += dt;
    const { sys, hero, def } = this;
    for (const t of this.throws) {
      if (t.thrown || this.time < t.start) continue;
      t.thrown = true;
      const mine = new SeaMine(sys, null, {
        x: t.x, ...this.spec, damage: hero.damage * def.damage, source: hero.source.ability,
      });
      sys.effects.push(mine);
      const at = { alive: true, x: t.x, y: laneFeetY(t.x) - 2 };
      sys.scene.projectiles.push(new LobProjectile(sys.scene, {
        x: hero.x, y: hero.y, target: at, flightTime: def.flightTime, arcHeight: def.arcHeight, sprite: 'sea_mine',
        aimAt: () => at, findTarget: () => null, onHit: () => mine.land(),
      }));
    }
    return this.throws.some((t) => !t.thrown);
  }

  destroy() {}
}

// An awakened Octopus Tamer's grab: when the hold ends, a slam for slam x
// his damage.
export class GrabHold {
  constructor(hero, enemy, ms, slam) {
    Object.assign(this, { hero, enemy, slam });
    this.time = ms;
  }

  update(dt) {
    this.time -= dt;
    if (this.time > 0) return true;
    const { enemy, hero } = this;
    if (enemy.alive) {
      enemy.takeDamage(hero.damage * this.slam, { source: hero.source.attack });
      playFx(hero.scene, 'hit_spark', enemy.x, enemy.y);
      sfx.play('hit_heavy');
    }
    return false;
  }

  destroy() {}
}

// Fan the Hammer: def.shots pistol shots, def.interval ms apart, each at a
// random foe on screen (flyers too) for def.damage x his damage.
class FanTheHammer {
  constructor(sys, { hero, def }) {
    Object.assign(this, { sys, hero, def });
    this.left = def.shots;
    this.timer = 0;
  }

  update(dt) {
    const { sys, hero, def } = this;
    this.timer -= dt;
    while (this.timer <= 0 && this.left > 0) {
      this.timer += def.interval;
      this.left--;
      const foes = sys.targets({ air: true });
      if (!foes.length) continue;
      const target = foes[Math.floor(Math.random() * foes.length)];
      sys.scene.projectiles.push(new Projectile(sys.scene, {
        ...hero.muzzlePoint(), target, speed: def.speed, sprite: def.sprite, rotate: true,
        onHit: (hit, x, y) => {
          hit.takeDamage(hero.damage * def.damage, { source: hero.source.ability });
          playFx(sys.scene, 'hit_spark', x, y);
        },
        findTarget: (x, y) => nearestLiving(sys.scene.enemies, x, y, (e) => e.canBeHit(true)),
      }));
      sfx.play('cannon_small', { volume: 0.7 });
    }
    return this.left > 0;
  }

  destroy() {}
}

// Lullaby's look: def.notes song notes drifting up from the Tide Singer.
class SongNotes {
  constructor(scene, hero, def) {
    this.notes = Array.from({ length: def.notes }, (_, i) => ({
      sprite: fxSprite(scene, def.sprite, hero.x + 6 * (i % 3) - 6, hero.top).setDepth(FX_DEPTH),
      vx: 30 + 12 * i, vy: -14 - 3 * (i % 4), delay: i * 90,
    }));
    this.time = 0;
  }

  update(dt) {
    this.time += dt;
    for (const n of this.notes) {
      if (this.time < n.delay) continue;
      n.sprite.x += n.vx * dt / 1000;
      n.sprite.y += n.vy * dt / 1000;
      n.sprite.setAlpha(Math.max(0, 1 - (this.time - n.delay) / 1500));
    }
    return this.time < 1500 + this.notes.length * 90;
  }

  destroy() { for (const n of this.notes) n.sprite.destroy(); }
}

// Ink Cloud: def.tiles ink_cloud tiles side by side centred on def.x, over
// where ranged foes stop, for the duration (fading at the end). Ranged foes
// in it can't shoot (Enemy.inkTime).
class InkCloud {
  constructor(sys, def, duration) {
    Object.assign(this, { sys, def });
    this.time = duration;
    const { width } = fxSize(sys.scene, def.sprite);
    this.half = (def.tiles * width) / 2;
    this.tiles = Array.from({ length: def.tiles }, (_, i) => {
      const x = def.x - this.half + width * (i + 0.5);
      return fxSprite(sys.scene, def.sprite, Math.round(x), Math.round(laneFeetY(x)) - 4)
        .setOrigin(0.5, 1).setDepth(DEPTH.enemyOverlay - 0.2);
    });
  }

  update(dt) {
    this.time -= dt;
    for (const e of this.sys.scene.enemies) {
      if (e.alive && e.def.ranged && Math.abs(e.x - this.def.x) <= this.half) e.inkTime = Math.max(e.inkTime ?? 0, Math.min(this.time, 200));
    }
    const alpha = Phaser.Math.Clamp(this.time / this.def.fadeTime, 0, 1);
    for (const t of this.tiles) t.setAlpha(alpha);
    return this.time > 0;
  }

  destroy() { for (const t of this.tiles) t.destroy(); }
}

// Reef Wall: coral_wall grown on the lane at def.x (def.width wide) for the
// duration. Like a skeleton, it holds walkers up and they hack at it (it
// has hp); awakened, it hurts each attacker for reflect x the blow.
class CoralWall {
  constructor(scene, def, {
    hp, duration, reflect, source,
  }) {
    Object.assign(this, {
      scene, def, hp, reflect, source,
    });
    this.x = def.x;
    this.width = def.width;
    this.time = duration;
    this.alive = true;
    this.sprite = fxSprite(scene, def.sprite, Math.round(this.x), Math.round(laneFeetY(this.x)) + 2)
      .setOrigin(0.5, 1).setDepth(DEPTH.ally);
  }

  get blocks() { return this.alive; }

  update(dt) {
    if (!this.alive) return false;
    this.time -= dt;
    if (this.time <= 0) this.crumble();
    return this.alive;
  }

  // A blow from `attacker` (an enemy), reflected in part when awakened.
  takeDamage(amount, attacker = null) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.reflect && attacker?.alive) attacker.takeDamage(amount * this.reflect, { ignoreArmor: true, source: this.source });
    if (this.hp <= 0) this.crumble();
  }

  crumble() {
    if (!this.alive) return;
    this.alive = false;
    this.scene.tweens.add({ targets: this.sprite, alpha: 0, duration: 250, onComplete: () => this.sprite.destroy() });
  }

  destroy() {
    this.alive = false;
    this.sprite.destroy();
  }
}

// Axe Storm: axe_spin from the ship to the far edge and back; each foe on
// the lane it reaches is hit once each way. `storms` of them, def.gapMs apart.
class AxeStorm {
  constructor(sys, def, hero, storms) {
    Object.assign(this, { sys, def, hero });
    this.left = storms;
    this.start();
  }

  start() {
    this.left--;
    this.wait = 0;
    this.dir = 1;
    this.x = LAYOUT.shipContactX;
    this.hit = new Set();
    this.sprite ??= fxSprite(this.sys.scene, this.def.sprite, 0, 0).setDepth(FX_DEPTH);
    this.sprite.setVisible(true);
  }

  update(dt) {
    const { sys, def, hero } = this;
    if (this.wait > 0) {
      this.wait -= dt;
      if (this.wait <= 0) this.start();
      return true;
    }
    this.x += this.dir * def.speed * dt / 1000;
    const right = sys.scene.view.right;
    for (const e of sys.targets()) {
      if (this.hit.has(e) || Math.abs(e.x - this.x) > e.def.width / 2 + 6) continue;
      this.hit.add(e);
      e.takeDamage(hero.damage * def.damage, { source: hero.source.ability });
    }
    if (this.dir > 0 && this.x >= right) {
      this.dir = -1;
      this.hit = new Set();
    }
    this.sprite.setPosition(Math.round(this.x), Math.round(laneFeetY(this.x) - 14));
    if (this.dir < 0 && this.x <= LAYOUT.shipContactX) {
      if (this.left <= 0) return false;
      this.sprite.setVisible(false);
      this.wait = def.gapMs;
    }
    return true;
  }

  destroy() { this.sprite?.destroy(); }
}

// Raise the Crew's skeletons, stepped along with the other effects while
// any is still up (the system keeps the list, for enemies to find them).
class AlliesOut {
  constructor(allies) {
    this.allies = allies;
  }

  update(dt) {
    let up = false;
    for (const a of this.allies) if (a.update(dt)) up = true;
    return up;
  }

  destroy() {}
}

// Drop Anchor: anchor_drop stands bottom-centre on its target (following it
// until it lands); def.impactAt ms in it hits for def.damage x his damage,
// stuns and shoves the target back (bosses resist, as usual), with a shake.
class AnchorDrop {
  constructor(sys, hero, def, target, scale) {
    this.sys = sys;
    this.hero = hero;
    this.def = def;
    this.scale = scale;
    this.target = target;
    this.time = 0;
    this.landed = false;
    this.sprite = fxSprite(sys.scene, def.sprite, Math.round(target.x), Math.round(target.feetY))
      .setOrigin(0.5, 1).setDepth(FX_DEPTH);
    this.showMs = Math.max(def.impactAt, fxDuration(sys.scene, def.sprite));
  }

  update(dt) {
    this.time += dt;
    const { def, target } = this;
    if (!this.landed) {
      if (target.alive) this.sprite.setPosition(Math.round(target.x), Math.round(target.feetY));
      if (this.time < def.impactAt) return true;
      this.landed = true;
      if (target.alive) {
        target.takeDamage(this.hero.damage * def.damage, { lobbed: true, source: this.hero.source.ability });
        if (target.alive) {
          target.applyStun(def.stun * this.scale);
          target.pushBack(def.push, def.pushSpeed);
          this.sys.scene.stats?.add(this.hero.id, 'stuns');
        }
      }
      shake(this.sys.scene, def.shake);
      sfx.play('cannon');
    }
    return this.time < this.showMs;
  }

  destroy() { this.sprite.destroy(); }
}

// Powder Barrage: def.bombs powder bombs lobbed from the Powder Monkey,
// def.interval ms apart, to spots spread along the lane (in a shuffled
// order); each blasts everything on the lane within def.radius.
class PowderBarrage {
  constructor(sys, { hero, def }) {
    this.sys = sys;
    this.hero = hero;
    this.def = def;
    this.time = 0;
    const from = LAYOUT.shipContactX + def.radius;
    const to = LAYOUT.enemySpawnX - def.radius;
    const spots = Array.from({ length: def.bombs }, (_, i) => from + (to - from) * (i + 0.5) / def.bombs);
    this.bombs = Phaser.Utils.Array.Shuffle(spots).map((x, i) => ({ x, start: i * def.interval, thrown: false }));
  }

  update(dt) {
    this.time += dt;
    const { sys, hero, def } = this;
    for (const b of this.bombs) {
      if (b.thrown || this.time < b.start) continue;
      b.thrown = true;
      const spot = { alive: true, x: b.x, y: laneFeetY(b.x) - 4 };
      sys.scene.projectiles.push(new LobProjectile(sys.scene, {
        x: hero.x, y: hero.y, target: spot, flightTime: def.flightTime, arcHeight: def.arcHeight, sprite: def.sprite,
        findTarget: () => null,
        aimAt: () => spot,
        onHit: (_hit, x, y) => this.land(x, y),
      }));
    }
    return this.bombs.some((b) => !b.thrown);
  }

  land(x, y) {
    const { sys, hero, def } = this;
    for (const e of sys.targets()) {
      if (Math.abs(e.x - x) <= def.radius + e.def.width / 2) {
        e.takeDamage(hero.damage * def.damage, { lobbed: true, source: hero.source.ability });
      }
    }
    playFx(sys.scene, def.impact, x, y - 8);
    sfx.play('hit_heavy');
  }

  destroy() {}
}

// Inferno: def.tiles inferno_wall sprites side by side on the lane, centred
// on def.x, for the duration (fading at the end). Ground enemies in it burn
// (dps), and keep burning for def.burnMs after they're through.
class InfernoWall {
  constructor(sys, def, dps, duration, source) {
    this.sys = sys;
    this.def = def;
    this.dps = dps;
    this.source = source;
    this.time = duration;
    const { width } = fxSize(sys.scene, def.sprite);
    this.half = (def.tiles * width) / 2;
    this.tiles = Array.from({ length: def.tiles }, (_, i) => {
      const x = def.x - this.half + width * (i + 0.5);
      return fxSprite(sys.scene, def.sprite, Math.round(x), Math.round(laneFeetY(x)) + 2)
        .setOrigin(0.5, 1).setDepth(DEPTH.ally + 0.1);
    });
  }

  update(dt) {
    this.time -= dt;
    for (const e of this.sys.targets()) {
      if (Math.abs(e.x - this.def.x) <= this.half + e.def.width / 2) e.applyBurn(this.dps, this.def.burnMs, this.source);
    }
    const alpha = Phaser.Math.Clamp(this.time / this.def.fadeTime, 0, 1);
    for (const t of this.tiles) t.setAlpha(alpha);
    return this.time > 0;
  }

  destroy() { for (const t of this.tiles) t.destroy(); }
}

// Aurora Veil: aurora_veil tiled across the sky (its top def.skyY px under
// the view's top) while enemies are frozen, fading out at the end.
class AuroraVeil {
  constructor(scene, def, duration) {
    this.def = def;
    this.time = duration;
    const { width } = fxSize(scene, def.sprite);
    const { left, right, top } = scene.view;
    this.tiles = [];
    for (let x = left; x < right; x += width) {
      this.tiles.push(fxSprite(scene, def.sprite, Math.round(x), Math.round(top + def.skyY)).setOrigin(0).setDepth(FX_DEPTH - 1));
    }
  }

  update(dt) {
    this.time -= dt;
    const alpha = Phaser.Math.Clamp(this.time / this.def.fadeTime, 0, 1);
    for (const t of this.tiles) t.setAlpha(alpha);
    return this.time > 0;
  }

  destroy() { for (const t of this.tiles) t.destroy(); }
}

// How far an enemy's front edge is from where walkers stop at the ship.
const nearShip = (e) => e.x - e.def.width / 2 - LAYOUT.shipContactX;

// Flock's show: def.extra parrots fly from the ship across the sky (spread
// over def.spread px of height), off the right edge of the view.
class FlockFlight {
  constructor(scene, hero, def) {
    this.scene = scene;
    this.def = def;
    this.parrots = Array.from({ length: def.extra }, (_, i) => fxSprite(scene, def.sprite,
      hero.x - i * 14, hero.y - 10 - (def.spread * i) / Math.max(1, def.extra - 1)).setDepth(FX_DEPTH));
    this.parrots.forEach((p, i) => { p.climb = (i % 2 ? -1 : 1) * 6; });
  }

  update(dt) {
    const step = this.def.extraSpeed * dt / 1000;
    for (const p of this.parrots) {
      p.x += step;
      p.y -= p.climb * dt / 1000;
    }
    return this.parrots.some((p) => p.x - p.width < this.scene.view.right);
  }

  destroy() { for (const p of this.parrots) p.destroy(); }
}

// Patch Up: def.count heal_plus crosses over random spots on the hull, each
// starting def.interval ms after the last and rising def.rise px as it fades.
class HealRise {
  constructor(scene, def) {
    this.def = def;
    this.time = 0;
    this.crosses = Array.from({ length: def.count }, (_, i) => {
      const { x, y } = scene.ship.hullTarget();
      const sprite = fxSprite(scene, def.sprite, Math.round(x), Math.round(y)).setOrigin(0.5, 1)
        .setDepth(DEPTH.slotMarkers).setVisible(false);
      return { sprite, y, start: i * def.interval };
    });
  }

  update(dt) {
    this.time += dt;
    const { def } = this;
    let running = false;
    for (const c of this.crosses) {
      const t = (this.time - c.start) / def.riseMs;
      if (t < 0) {
        running = true;
        continue;
      }
      c.sprite.setVisible(t < 1);
      if (t >= 1) continue;
      running = true;
      c.sprite.setY(Math.round(c.y - def.rise * t)).setAlpha(Math.min(1, 2 * (1 - t)));
    }
    return running;
  }

  destroy() { for (const c of this.crosses) c.sprite.destroy(); }
}

// Deadeye: deadeye_mark on the toughest enemy the Sharpshooter can hit
// while he aims (def.aimMs, re-picking if it dies), then one musket shot from
// his musket at it for def.damage x his damage, ignoring armour and shields.
class Deadeye {
  constructor(sys, hero, def) {
    this.sys = sys;
    this.hero = hero;
    this.def = def;
    this.time = 0;
    this.target = hero.toughest(sys.scene.enemies);
    this.mark = fxSprite(sys.scene, def.mark, 0, 0).setOrigin(0.5).setDepth(DEPTH.enemyOverlay);
  }

  update(dt) {
    this.time += dt;
    const { hero, def } = this;
    if (!this.target?.targetable) this.target = hero.toughest(this.sys.scene.enemies);
    const e = this.target;
    if (!e) return false;
    this.mark.setPosition(Math.round(e.x), Math.round(e.y));
    if (this.time < def.aimMs) return true;
    const { scene } = this.sys;
    const { projectile } = hero.def;
    scene.projectiles.push(new Projectile(scene, {
      ...hero.muzzlePoint(), target: e, speed: def.speed, sprite: projectile.sprite, rotate: true,
      onHit: (hit, x, y) => {
        hit.takeDamage(hero.damage * def.damage, { ignoreArmor: true, throughShield: true, source: hero.source.ability });
        // An awakened Sharpshooter's finishes off what's left (not a boss).
        if (def.execute && hit.alive && !hit.def.boss && hit.hp < hit.maxHp * def.execute) {
          hit.takeDamage(hit.hp, { ignoreArmor: true, throughShield: true, source: hero.source.ability });
        }
        playFx(scene, projectile.impact, x, y);
        shake(scene, def.shake);
      },
      findTarget: (x, y) => nearestLiving(scene.enemies, x, y, (o) => hero.canHit(o)),
    }));
    sfx.play('cannon');
    return false;
  }

  destroy() { this.mark.destroy(); }
}

// Tidal Wave: tidal_wave rolls right along the lane from the ship (its
// bottom def.sink px under the walkers' feet) to the far edge; each walker
// it reaches takes the damage and is pushed def.push px back.
class TidalWave {
  constructor(sys, def, damage, source) {
    this.sys = sys;
    this.def = def;
    this.damage = damage;
    this.source = source;
    this.sprite = fxSprite(sys.scene, def.sprite, 0, 0).setOrigin(1, 1).setDepth(DEPTH.foreground + 0.5);
    this.x = LAYOUT.shipContactX;   // the wave's front
    this.hit = new Set();
    this.update(0);
  }

  update(dt) {
    const { def } = this;
    this.x += def.speed * dt / 1000;
    for (const e of this.sys.targets({ needs: 'movable' })) {
      if (this.hit.has(e) || e.x - e.def.width / 2 > this.x) continue;
      this.hit.add(e);
      e.takeDamage(this.damage, { source: this.source });
      e.pushBack(def.push, def.speed);
    }
    this.sprite.setPosition(Math.round(this.x), Math.round(laneFeetY(this.x) + def.sink));
    return this.x - this.sprite.width < this.sys.scene.view.right;
  }

  destroy() { this.sprite.destroy(); }
}

// A light camera shake: { duration (ms), intensity }.
function shake(scene, { duration, intensity }) {
  scene.cameras.main.shake(duration, intensity);
}

// --- Ongoing effects (update(dt) returns false when done; destroy() cleans up) ---

// Hex: hex_cast on the Priestess (its ring at her feet); curseAt ms in, every
// enemy on screen is cursed with a hex_hit burst, and its curse mark shows
// once the burst has played.
class HexCast {
  constructor(sys, hero, def, scale) {
    this.sys = sys;
    this.hero = hero;
    this.def = def;
    this.scale = scale;
    this.time = 0;
    this.cursed = false;
    const cast = playFx(sys.scene, def.cast, hero.x, hero.feetY);
    cast.setOrigin(0.5, (def.castRingRow + 0.5) / cast.height);
  }

  update(dt) {
    this.time += dt;
    if (this.time < this.def.curseAt) return true;
    const { def } = this;
    const burst = fxDuration(this.sys.scene, def.impact);
    for (const e of this.sys.targets({ air: true })) {
      e.applyCurse(def.bonus, def.duration * this.scale, this.hero.source.effect, def.curseJump ?? 0);
      e.delayCurseMark(burst);
      playFx(this.sys.scene, def.impact, e.x, e.y);
    }
    return false;
  }

  destroy() {}
}

// lunge_target looping on the Duelist's target while Lunge crits remain:
// the enemy his next shot will go to (the toughest), over its 32x32 box.
class LungeMark {
  constructor(scene, hero, sprite) {
    this.hero = hero;
    this.sprite = fxSprite(scene, sprite, 0, 0).setDepth(DEPTH.enemyOverlay);
    this.update();
  }

  update() {
    const { lunge } = this.hero;
    if (!lunge) return false;
    const e = lunge.target?.targetable ? lunge.target : this.hero.toughest(this.hero.scene.enemies);
    this.sprite.setVisible(!!e);
    if (e) {
      if (e.large) this.sprite.setOrigin(0.5).setPosition(Math.round(e.x), Math.round(e.y));
      else this.sprite.setOrigin(0.5, 1).setPosition(Math.round(e.x), Math.round(e.feetY));
    }
    return true;
  }

  destroy() { this.sprite.destroy(); }
}

// A huge net (its sheet tiled along the lane) dropping from above the view
// onto the lane, then lying there until the slow ends, fading out at the end.
class NetDrop {
  constructor(scene, def, duration) {
    this.scene = scene;
    this.def = def;
    this.duration = duration;
    this.time = 0;
    this.height = fxSize(scene, def.sprite).height;
    this.bottom = LAYOUT.waterY + 8;  // just below the walkers' feet
    const left = LAYOUT.shipContactX - 8;
    this.net = scene.add.tileSprite(left, 0, scene.view.right - left, this.height, fxKey(def.sprite), 0)
      .setOrigin(0).setDepth(FX_DEPTH - 1);
    this.update(0);
  }

  update(dt) {
    this.time += dt;
    const { def } = this;
    const drop = Math.min(1, this.time / def.dropTime);
    const top = Phaser.Math.Linear(this.scene.view.top - this.height, this.bottom - this.height, drop * drop);
    this.net.setY(Math.round(top));
    this.net.setAlpha(Phaser.Math.Clamp((this.duration - this.time) / def.fadeTime, 0, 1));
    return this.time < this.duration;
  }

  destroy() { this.net.destroy(); }
}

// The poison puddle lying on the lane while it lasts: enemies standing in it
// are poisoned. Fades out at the end.
class Puddle {
  constructor(sys, x, def, dps, duration, source) {
    this.sys = sys;
    this.def = def;
    this.dps = dps;
    this.source = source;
    this.x = x;
    this.time = duration;
    // Over the near water, so it shows where walkers wade.
    this.sprite = fxSprite(sys.scene, def.puddle, Math.round(x), Math.round(laneFeetY(x)))
      .setDepth(DEPTH.foreground + 0.5);
    this.half = this.sprite.width / 2;
  }

  update(dt) {
    this.time -= dt;
    for (const e of this.sys.targets()) {
      if (Math.abs(e.x - this.x) <= this.half + e.def.width / 2) e.applyPoison(this.dps, this.def.lingerTime, this.source);
    }
    this.sprite.setAlpha(Phaser.Math.Clamp(this.time / this.def.fadeTime, 0, 1));
    return this.time > 0;
  }

  destroy() { this.sprite.destroy(); }
}

// A giant harpoon skimming the lane from the ship to the far edge, turned to
// follow the lane's slope.
class WhaleHarpoon {
  constructor(sys, def, damage, source) {
    this.sys = sys;
    this.def = def;
    this.damage = damage;
    this.source = source;
    this.sprite = fxSprite(sys.scene, def.sprite, 0, 0).setOrigin(1, 0.5).setDepth(FX_DEPTH);
    this.length = this.sprite.width;
    this.x = LAYOUT.shipContactX - this.length;  // the tip
    this.hits = new Set();
    this.update(0);
  }

  // The tip runs at the walkers' mid-body height.
  yAt(x) { return laneFeetY(x) - 14; }

  update(dt) {
    const { def } = this;
    const fromX = this.x;
    this.x += def.speed * dt / 1000;
    for (const e of this.sys.targets()) {
      if (this.hits.has(e) || e.x - e.def.width / 2 > this.x) continue;
      this.hits.add(e);
      e.takeDamage(this.damage, { ignoreArmor: true, source: this.source });
      playFx(this.sys.scene, def.impact, e.x, e.y);
    }
    const y = this.yAt(this.x);
    this.sprite.setPosition(Math.round(this.x), Math.round(y));
    if (this.x > fromX) this.sprite.rotation = Math.atan2(y - this.yAt(fromX), this.x - fromX);
    return this.x - this.length < this.sys.scene.view.right;
  }

  destroy() { this.sprite.destroy(); }
}

// Cannonballs falling one after another at spots spread along the lane, each
// exploding where it lands (through armour).
class Broadside {
  constructor(sys, def, damage, source) {
    this.sys = sys;
    this.def = def;
    this.damage = damage;
    this.source = source;
    this.time = 0;
    const from = LAYOUT.shipContactX + def.radius / 2;
    const to = LAYOUT.enemySpawnX - 10;
    const spots = Array.from({ length: def.balls }, (_, i) => from + (to - from) * (i + 0.5) / def.balls);
    this.balls = Phaser.Utils.Array.Shuffle(spots)
      .map((x, i) => ({ x, start: i * def.interval, sprite: null, landed: false }));
  }

  update(dt) {
    this.time += dt;
    const { def } = this;
    const top = this.sys.scene.view.top - 10;
    for (const b of this.balls) {
      if (b.landed || this.time < b.start) continue;
      const t = Math.min(1, (this.time - b.start) / def.fallTime);
      const groundY = laneFeetY(b.x) - 4;
      if (t >= 1) {
        b.landed = true;
        b.sprite?.destroy();
        this.land(b.x, groundY);
        continue;
      }
      b.sprite ??= fxSprite(this.sys.scene, def.sprite, 0, 0).setDepth(FX_DEPTH);
      b.sprite.setPosition(Math.round(b.x), Math.round(Phaser.Math.Linear(top, groundY, t * t)));
    }
    return this.balls.some((b) => !b.landed);
  }

  land(x, y) {
    const { def } = this;
    for (const e of this.sys.targets()) {
      if (Math.abs(e.x - x) <= def.radius + e.def.width / 2) e.takeDamage(this.damage, { lobbed: true, ignoreArmor: true, source: this.source });
    }
    playFx(this.sys.scene, def.impact, x, y - 12);
    shake(this.sys.scene, def.shake);
    sfx.play('cannon');
  }

  destroy() {
    for (const b of this.balls) b.sprite?.destroy();
  }
}
