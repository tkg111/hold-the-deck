import {
  AUDIO, CHARM, FREEZE, FX, HEROES, SHIP, SPRITES,
} from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { FX_DEPTH, fxSprite, playFx } from '../fx.js';
import {
  awakenedKey, findAnim, fxKey, sheetKey, unchartedKey,
} from '../sprites.js';
import { damageSource } from '../systems/BattleStats.js';
import { abilityDef, heroDef } from '../systems/Uncharted.js';
import { DEPTH } from './Ship.js';
import {
  ChainLightning, LobProjectile, nearestLiving, PiercingProjectile, Projectile,
} from './Projectile.js';

export class Hero {
  // damage and attackInterval come from Progress (level, stars, deck buffs);
  // aura ({ from, damage, speed }): The Captain's deck buff, if he buffs
  // this crewmate (for the Captain's Log); bossDamage: x damage of its
  // attacks on bosses (the active meal's).
  // The hero stands with its feet at (x, feetY); this.y is the middle of its
  // body, where shots start.
  // awakened: Crew Awakening's (its awakened definitions, sheet and aura).
  constructor(scene, id, { index, x, feetY }, {
    damage, attackInterval, buffed = false, aura = null, bossDamage = 1, awakened = false,
  }) {
    this.scene = scene;
    this.id = id;
    this.awakened = awakened;
    this.def = heroDef(id, awakened);
    this.abilityDef = abilityDef(id, awakened);
    this.aura = aura;
    this.slot = index;
    this.deck = Math.floor(index / SHIP.slotsPerDeck);   // 0 = the bottom deck
    // Captain's Log credit for each kind of damage (see BattleStats).
    this.source = {
      attack: damageSource(id, 'attack'), ability: damageSource(id, 'ability'), effect: damageSource(id, 'effect'),
    };
    this.baseDamage = damage;
    this.bossDamage = bossDamage;
    this.attackInterval = attackInterval;
    this.cooldown = 0;
    // Abilities: attack speed and damage boosts ({ kind, mult, time, fx }:
    // kind 'speed' or 'damage', time in ms left and fx the sprite shown while
    // it lasts) and The Duelist's Lunge
    // ({ hits } left, each a guaranteed crit on the toughest enemy, and the
    // impact played on each).
    this.boosts = [];
    this.lunge = null;
    this.boostSprites = {};   // fx sprite name -> sprite
    // Stunned by the Siren's song or a lava bomb: no attacks (cooldown
    // paused), stun stars over the head.
    this.stunTime = 0;
    this.stunStars = null;
    // Frozen (Frostbite Reef's blizzard, the Frost Wyrm and the Frost Giant):
    // no attacks either, in a block of ice until it melts or is tapped.
    this.freezeTime = 0;
    this.iceBlock = null;
    // Charmed (the Siren Queen's song): attacks its own hull until it wears
    // off or is tapped. charmer: the Siren Queen, blamed for that damage.
    this.charmTime = 0;
    this.charmer = null;
    this.charmMark = null;
    this.charmImmune = 0;   // ms after a charm ends before another can land (CHARM.immuneMs)
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
    // Awakened: its awakened sheet (same frames), with the aura behind it.
    const look = sprite && awakened && findAnim(scene, awakenedKey(sprite.key), 'idle') ? awakenedKey(sprite.key) : sprite?.key;
    if (look && look !== sprite.key && scene.anims.exists(unchartedKey('aura'))) {
      this.auraSprite = scene.add.sprite(x, feetY, unchartedKey('aura')).setOrigin(0.5, 1)
        .setDepth(DEPTH.hero - 0.55).play(unchartedKey('aura'));
    }
    this.shotCount = 0;    // shots fired (an awakened nthShot counts them)
    this.markTimer = 0;    // an awakened Captain's mark: ms until he picks again
    this.idleAnim = sprite && findAnim(scene, look, 'idle');
    this.attackAnim = sprite && findAnim(scene, look, 'attack');
    if (this.idleAnim) {
      this.body = scene.add.sprite(x, feetY, sheetKey(look)).setOrigin(0.5, 1);
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
  // boost lasts, behind the hero or (default) over them. kind: 'speed'
  // (attack speed, the default) or 'damage' (Temper Steel).
  // crit: { chance, multiplier } (an awakened Blacksmith's; see critBoost).
  addBoost(mult, duration, fx, kind = 'speed', crit = null) {
    this.boosts.push({
      kind, mult, time: duration, fx, crit,
    });
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

  // End of a wave: boosts, Lunge, stuns, ice and charms end with it.
  clearAbilities() {
    this.boosts = [];
    this.lunge = null;
    this.stunTime = 0;
    this.tickAbilities(0);
    this.tickStun(0);
    this.thaw({ quiet: true });
    this.breakCharm({ quiet: true });
    this.charmImmune = 0;
    if (this.def.mark) this.setMark(null);
  }

  // An awakened Captain marks the toughest enemy (def.mark): the whole crew
  // deals bonus more to it (Enemy.damageTaken), with the mark over it.
  updateMark(dt, enemies) {
    const { mark } = this.def;
    this.markTimer -= dt;
    const current = this.scene.crewMark?.enemy;
    if (this.markTimer > 0 && current?.alive) {
      this.markSprite?.setPosition(Math.round(current.x), Math.round(current.y));
      return;
    }
    this.markTimer = mark.every;
    let best = null;
    for (const e of enemies) if (e.targetable && !e.def.hazard && (!best || e.hp > best.hp)) best = e;
    this.setMark(best);
  }

  setMark(enemy) {
    const { mark } = this.def;
    this.scene.crewMark = enemy ? { enemy, bonus: mark.bonus } : null;
    if (!enemy) {
      this.markSprite?.destroy();
      this.markSprite = null;
      return;
    }
    this.markSprite ??= fxSprite(this.scene, mark.sprite, 0, 0).setDepth(DEPTH.slotMarkers);
    this.markSprite.setPosition(Math.round(enemy.x), Math.round(enemy.y));
  }

  // The Siren's note or a lava bomb on this deck: no attacks for ms.
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
    if (!this.isFrozen) this.body.anims?.resume();
  }

  get isStunned() { return this.stunTime > 0; }

  // Frozen for ms in a block of ice (FREEZE). cause: what froze them
  // ('blizzard', 'wyrm', 'giant'), for counting.
  freeze(ms, cause = null) {
    this.freezeTime = Math.max(this.freezeTime, ms);
    this.freezeCause = cause;
    if (!this.iceBlock) {
      this.iceBlock = fxSprite(this.scene, FREEZE.sprite, Math.round(this.x), Math.round(this.feetY))
        .setOrigin(0.5, 1).setDepth(DEPTH.slotMarkers);
      sfx.play('freeze');
    }
    this.body.anims?.pause();
  }

  // The ice melts or is tapped away (with a frost_hit on them; quiet: just
  // gone, at the end of a wave). Returns whether they were frozen.
  thaw({ quiet = false } = {}) {
    if (!this.iceBlock) return false;
    this.freezeTime = 0;
    this.iceBlock.destroy();
    this.iceBlock = null;
    if (!quiet) {
      playFx(this.scene, FREEZE.breakFx, Math.round(this.x), Math.round(this.y));
      sfx.play('hit_heavy');
    }
    if (!this.isStunned) this.body.anims?.resume();
    return true;
  }

  tickFreeze(dt) {
    this.freezeTime = Math.max(0, this.freezeTime - dt);
    if (this.freezeTime <= 0 && this.iceBlock) this.thaw();
  }

  get isFrozen() { return this.freezeTime > 0; }

  // Charmed for ms by `charmer` (the Siren Queen): it turns to face the ship
  // and its attacks hit the hull (see attackOwnShip), with CHARM.status
  // looping over its head. Not while still immune from the last one (see
  // canBeCharmed). Shorter with the active meal's Ghost Carp Soup.
  charm(ms, charmer = null) {
    if (!this.canBeCharmed) return;
    this.charmTime = Math.max(this.charmTime, ms * (this.scene.progress?.mealMods.charm ?? 1));
    this.charmer = charmer;
    if (!this.charmMark) {
      this.charmMark = fxSprite(this.scene, CHARM.status, Math.round(this.x), Math.round(this.top) - FX.statusGap)
        .setOrigin(0.5, 1).setDepth(DEPTH.slotMarkers);
      this.body.setFlipX?.(true);
    }
  }

  // The charm wears off or is tapped away (with CHARM.breakFx on them; quiet:
  // just gone, at the end of a wave). Returns whether they were charmed.
  // For CHARM.immuneMs after, they can't be charmed again.
  breakCharm({ quiet = false } = {}) {
    if (!this.charmMark) return false;
    this.charmTime = 0;
    this.charmImmune = CHARM.immuneMs;
    this.charmer = null;
    this.charmMark.destroy();
    this.charmMark = null;
    this.body.setFlipX?.(false);
    if (!quiet) playFx(this.scene, CHARM.breakFx, Math.round(this.x), Math.round(this.y));
    return true;
  }

  tickCharm(dt) {
    this.charmImmune = Math.max(0, this.charmImmune - dt);
    this.charmTime = Math.max(0, this.charmTime - dt);
    if (this.charmTime <= 0 && this.charmMark) this.breakCharm({ quiet: true });
  }

  get isCharmed() { return this.charmTime > 0; }
  // Not charmed now, nor just after a charm (CHARM.immuneMs).
  get canBeCharmed() { return !this.isCharmed && this.charmImmune <= 0; }

  // A tap on this crewmate during a wave: breaks the ice and the charm.
  // Returns whether it freed them from anything.
  tapFree() {
    const thawed = this.thaw();
    return this.breakCharm() || thawed;
  }

  // Charmed: an attack into its own hull, at a random spot on it, for
  // CHARM.selfDamage x its damage (lobbed, flying straight or, the Storm
  // Caller's bolt and the Fire Breather's flame, at once). The Captain's Log
  // blames the charmer.
  attackOwnShip() {
    const { scene, def } = this;
    const { ship } = scene;
    const spot = ship.hullTarget();
    const charmer = this.charmer;
    const damage = this.damage * CHARM.selfDamage;
    const land = (x, y) => {
      playFx(scene, def.chain ? def.chain.impact : def.projectile.impact, x, y);
      ship.takeDamage(damage, charmer, this);
    };
    if (def.chain || def.jet) {
      land(spot.x, spot.y);
      return null;
    }
    const common = {
      ...this.muzzlePoint(), target: { alive: true, ...spot },
      sprite: def.projectile.sprite, rotate: def.projectile.rotate,
      onHit: (_t, x, y) => land(x, y),
      findTarget: () => null,
    };
    if (def.lob) {
      return new LobProjectile(scene, {
        ...common, flightTime: def.lob.flightTime, arcHeight: def.lob.arcHeight, aimAt: (t) => ({ x: t.x, y: t.y }),
      });
    }
    return new Projectile(scene, { ...common, speed: def.projectileSpeed });
  }

  // Whether this crewmate can hit (or, the Net Thrower, net) the enemy.
  canHit(e) { return e.canBeHit(this.antiAir); }

  get speedMult() { return this.boostMult('speed'); }
  // Its damage now: Progress's (level, stars, deck buffs) x damage boosts.
  get damage() { return this.baseDamage * this.boostMult('damage'); }
  boostMult(kind) {
    let m = 1;
    for (const b of this.boosts) if (b.kind === kind) m *= b.mult;
    return m;
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
    this.tickFreeze(dt);
    this.tickCharm(dt);
    if (this.def.mark) this.updateMark(dt, enemies);
    if (this.def.aura || this.isStunned || this.isFrozen) return null;  // support hero: never attacks
    this.cooldown -= dt * this.speedMult;
    if (this.cooldown > 0) return null;

    if (this.isCharmed) {
      this.cooldown = this.attackInterval;
      if (this.attackAnim) this.body.play(this.attackAnim);
      return this.attackOwnShip();
    }

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
    this.playShot();
    const shot = this.fire(target, lunge);
    // An awakened Parrot Keeper sends more parrots, each at another foe.
    if (!(this.def.shots > 1) || lunge) return shot;
    const shots = [shot];
    let left = enemies.filter((e) => e !== target);
    for (let i = 1; i < this.def.shots; i++) {
      const other = this.pickTarget(left);
      if (!other) break;
      shots.push(this.fire(other));
      left = left.filter((e) => e !== other);
    }
    return shots;
  }

  // The shot's sound (its shotSound, or cannon_small), quieter for crew
  // who fire very rapidly.
  playShot() {
    const rapid = this.attackInterval / this.speedMult < AUDIO.rapidShotMs;
    sfx.play(this.def.shotSound ?? 'cannon_small', { volume: rapid ? AUDIO.rapidVolume : 1 });
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
    if (def.jet) return this.breatheFire(target);
    // Awakened: every nthShot.every-th shot is a bigger one (see onHit), or
    // a spread of lobbed shots either side of the target.
    const nth = def.nthShot && ++this.shotCount % def.nthShot.every === 0 ? def.nthShot : null;
    const state = { first: true };   // a piercing shot's: nobody hit yet
    const common = {
      ...this.muzzlePoint(), target,
      sprite: def.projectile.sprite, rotate: def.projectile.rotate,
      onHit: (hit, x, y) => this.onHit(hit, x, y, lunge, null, { nth, state }),
      // Used when the target dies mid-flight.
      findTarget: (x, y) => nearestLiving(this.scene.enemies, x, y, (e) => this.canHit(e)),
    };
    if (def.lob) {
      const lob = { flightTime: def.lob.flightTime, arcHeight: def.lob.arcHeight };
      const main = new LobProjectile(this.scene, {
        ...common, ...lob, aimAt: (enemy, msLeft) => this.leadPoint(enemy, msLeft),
      });
      if (!nth?.spread) return main;
      const spot = this.leadPoint(target, lob.flightTime);
      const sides = [-1, 1].slice(0, nth.spread.count - 1).map((side) => new LobProjectile(this.scene, {
        ...common,
        ...lob,
        target: { alive: true, x: spot.x + side * nth.spread.px, y: spot.y },
        aimAt: (t) => ({ x: t.x, y: t.y }),
        findTarget: () => null,
      }));
      return [main, ...sides];
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
      const bonus = (e.def.flies ? this.def.flyerBonus ?? 1 : 1) * (e.def.boss ? this.bossDamage : 1);
      e.takeDamage(damage * bonus, { source: this.source.attack });
      damage *= chain.falloff;
    }
    return new ChainLightning(this.scene, { points, sprite: chain.segment, showMs: chain.segmentMs });
  }

  // The Fire Breather: a flame from his torch (the projectile sprite, its
  // left edge there, turned to the target) that plays out once; the hit
  // lands at once on the target and everything within jet.splash of it.
  breatheFire(target) {
    const { jet, projectile } = this.def;
    const x = Math.round(this.x + jet.from.x);
    const y = Math.round(this.feetY + jet.from.y);
    playFx(this.scene, projectile.sprite, x, y).setOrigin(0, 0.5).setRotation(Math.atan2(target.y - y, target.x - x));
    this.onHit(target, target.x, target.y, null, jet.splash);
    return null;
  }

  // Where an enemy will be after msLeft, for lobbed shots: walking left at its
  // current (possibly slowed, or hurried by a fire puddle) speed, standing
  // still if stunned, scared or pushed, never past where it stops. Walkers
  // follow the lane up or down, boats the waterline. Flyers and anchored
  // enemies (the Siren, the Ghost Galleon, the Molten Leviathan) are aimed
  // at where they are.
  leadPoint(enemy, msLeft) {
    const { def } = enemy;
    if (def.flies || enemy.anchored) return { x: enemy.x, y: enemy.y };
    const still = enemy.isStunned || enemy.isAfraid || enemy.pushLeft > 0;
    const lead = still ? 0 : enemy.speed * enemy.pace * enemy.moveBoost * msLeft / 1000;
    const x = Math.max(enemy.stopX, enemy.x - lead);
    const y = def.emerges || def.floats ? enemy.y : enemy.groundY(x) - def.height / 2;
    return { x, y };
  }

  // Closest living enemy to the ship that's within range (and that it can
  // hit: flyers in the air need anti-air); the furthest instead for the
  // Sharpshooter (targets: 'furthest'). The Voodoo Priestess prefers
  // enemies that aren't cursed yet, the Grog Brewer ones not yet poisoned,
  // so their effects spread across the wave, and the Net Thrower flyers still
  // in the air, to ground them. A fog bank (Fogbound Isle) and a stage's
  // Night Watch shorten the range.
  pickTarget(enemies) {
    const { curse, poison, netsFlyers } = this.def;
    const furthest = this.def.targets === 'furthest';
    const range = this.def.range * (this.scene.mists?.rangeMult ?? 1) * (this.scene.currents?.rangeMult ?? 1);
    let best = null;
    let bestFresh = null;
    for (const e of enemies) {
      if (!this.canHit(e)) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) > range) continue;
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
  // splash: a radius to hit around (x, y) when the hero has no area (the
  // Fire Breather's flame).
  // Awakened (AWAKEN.crew): nth: this shot's nthShot (its area and stun
  // instead); strikes: each foe is hit again for strikes.damage x; execute:
  // a foe (not a boss) left under that share of its HP falls; dragFirst:
  // the first foe a piercing shot hits is dragged back (state: that shot's);
  // cluster: more blasts either side; curseJump: see Enemy.passCurse. A
  // Temper Steel with crit (critBoost) lets anyone crit.
  onHit(target, x, y, lunge = null, splash = null, { nth = null, state = null } = {}) {
    const {
      slow, curse, poison, lob, flyerBonus, passesShields, ignoresArmor, knockback, burn, chill,
      strikes, execute, dragFirst, cluster,
    } = this.def;
    const area = nth?.area ?? this.def.area;
    const stun = nth?.stun ?? this.def.stun;
    const boost = this.critBoost;
    const crit = this.def.crit || boost
      ? { chance: (this.def.crit?.chance ?? 0) + (boost?.chance ?? 0), multiplier: this.def.crit?.multiplier ?? boost.multiplier }
      : null;
    playFx(this.scene, this.def.projectile.impact, x, y);
    const radius = area?.radius ?? splash;
    const victims = radius
      ? this.scene.enemies.filter((e) => this.canHit(e) && (e === target || Math.hypot(e.x - x, e.y - y) <= radius))
      : (target && this.canHit(target) ? [target] : []);

    const { stats } = this.scene;
    const source = lunge ? this.source.ability : this.source.attack;
    // One hit sound for the shot: heavy for a crit or a lunge.
    let heavy = !!lunge;
    for (const e of victims) {
      for (let k = 0; k < (strikes?.count ?? 1) && e.alive; k++) {
        let damage = this.damage * (k > 0 ? strikes.damage : 1);
        if (crit && (lunge || Math.random() < crit.chance)) {
          damage *= crit.multiplier;
          heavy = true;
          this.scene.floatText(e.x, e.y - e.def.height / 2 - 13, 'CRIT!', '#ffca28');
        }
        if (lunge) playFx(this.scene, lunge.impact, e.x, e.y, FX_DEPTH + 1);
        if (flyerBonus && e.def.flies) damage *= flyerBonus;
        if (e.def.boss) damage *= this.bossDamage;
        e.takeDamage(damage, {
          lobbed: !!lob, throughShield: !!passesShields, ignoreArmor: !!ignoresArmor, source,
        });
      }
      if (execute && e.alive && !e.def.boss && !e.hasShield && !e.hasIceShield && e.hp < e.maxHp * execute) {
        e.takeDamage(e.hp, { ignoreArmor: true, source });
      }
      if (dragFirst && state?.first && e.alive && !e.def.boss) e.pushBack(dragFirst.px, dragFirst.speed);
      if (state) state.first = false;
      if (!e.alive) continue;
      if (stun && Math.random() < stun.chance) {
        e.applyStun(stun.duration);
        stats?.add(this.id, 'stuns');
      }
      if (slow) {
        e.applySlow(slow.factor, slow.duration);
        stats?.add(this.id, 'slowed');
      }
      if (curse) e.applyCurse(curse.bonus, curse.duration, this.source.effect, this.def.curseJump ?? 0);
      if (poison) e.applyPoison(this.damage * poison.ratio, poison.duration, this.source.effect);
      if (burn) e.applyBurn(this.damage * burn.ratio, burn.duration, this.source.effect);
      if (chill) e.applyChill(chill.factor, chill.duration);
      // The Anchor Bosun's anchor: a shove back (not bosses).
      if (knockback && !e.def.boss) e.pushBack(knockback.px, knockback.speed);
    }
    if (victims.length) sfx.play(heavy ? 'hit_heavy' : 'hit');
    // An awakened Powder Monkey's bomb splits: smaller blasts either side.
    if (cluster) {
      for (let k = 0; k < cluster.count; k++) {
        const bx = x + (k % 2 ? 1 : -1) * cluster.px * (Math.floor(k / 2) + 1);
        playFx(this.scene, this.def.projectile.impact, bx, y);
        for (const e of this.scene.enemies) {
          if (!this.canHit(e) || Math.hypot(e.x - bx, e.y - y) > (area?.radius ?? 16)) continue;
          e.takeDamage(this.damage * cluster.damage, { lobbed: !!lob, source });
        }
      }
    }
  }

  // A Temper Steel from an awakened Blacksmith: { chance, multiplier } of a
  // crit for anyone, while it lasts (the strongest), or null.
  get critBoost() {
    let best = null;
    for (const b of this.boosts) if (b.crit && (!best || b.crit.chance > best.chance)) best = b.crit;
    return best;
  }

  destroy() {
    this.auraSprite?.destroy();
    if (this.def.mark && this.markSprite) this.setMark(null);
    this.buffRing?.destroy();
    this.stunStars?.destroy();
    this.iceBlock?.destroy();
    this.charmMark?.destroy();
    for (const sprite of Object.values(this.boostSprites)) sprite.destroy();
    this.body.destroy();
  }
}
