import Phaser from 'phaser';
import {
  CHARM, DISPLAY, ELITE, ENEMIES, FX, SHIP, SPRITES, WAVES,
} from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { fxSprite, playFx } from '../fx.js';
import { LAYOUT, laneFeetY } from '../layout.js';
import {
  ELITE_AURA_KEY, findAnim, sheetKey, sheetSpec, SPLASH_ANIM,
} from '../sprites.js';
import { light, text, UI } from '../ui/kit.js';
import { LobProjectile, Projectile } from './Projectile.js';
import { DEPTH } from './Ship.js';

// HP bar colours while cursed / poisoned.
const CURSE_COLOR = 0xb620e0;
const POISON_COLOR = 0x76ff03;

// Status sprites (fx sheets) and when each shows.
const STATUS = {
  stun: { sprite: 'stun_stars', active: (e) => e.isStunned },
  fear: { sprite: 'fear_mark', active: (e) => e.isAfraid },
  curse: { sprite: 'curse_mark', active: (e) => e.isCursed && e.curseMarkDelay <= 0 },
  poison: { sprite: 'poison_bubbles', active: (e) => e.isPoisoned },
  slow: { sprite: 'net_draped', active: (e) => e.isSlowed },
  charm: { sprite: CHARM.status, active: (e) => e.isCharmed },
};

// An island's spawnPuff (Frostbite Reef's snow_puff as enemies step out of
// the pines): its fx at a random point in its box, over the front scenery.
export function playSpawnPuff(scene, puff) {
  const [x0, x1] = puff.x;
  const [y0, y1] = puff.y;
  const x = Math.round(x0 + Math.random() * (x1 - x0));
  const y = Math.round(y0 + Math.random() * (y1 - y0));
  playFx(scene, puff.fx, x, y, DEPTH.frontScenery + 0.1);
}

// How long an animation in a character's sheet entry runs (ms), and how far
// into it `frame` comes; 0 without the sheet (the balance sim).
function animTiming(spec, anim, frame = null) {
  const a = spec?.[anim];
  if (!a?.frames) return { ms: 0, at: 0 };
  const step = 1000 / a.fps;
  return { ms: a.frames.length * step, at: frame == null ? 0 : Math.max(0, a.frames.indexOf(frame)) * step };
}

export class Enemy {
  // Walkers enter at layout.json's enemySpawnX and follow the lane (x is only
  // an override for testing, or where a golem broke apart); an emerging enemy
  // (The Kraken) rises out of the sea at layout.kraken instead, a flyer
  // (Storm Harpy, Ash Bat) cruises in at layout.harpyFlightY, the Siren
  // appears on her rock at layout.siren, the Ghost Galleon emerges at
  // layout.ghostGalleon and the Molten Leviathan rises at its sheet's
  // `position`. A boarding boat rows in from x (the Galleon launches it) on
  // the waterline; a lava bomb falls at x. The Frost Wyrm swoops in to its
  // perch on the iceberg; the Frost Giant comes in from behind the pines.
  // The Siren Queen rises at her sheet's `pos`; Captain Blackbones steps out
  // of the fog on the lane.
  //   elite:  3x HP (ELITE), gold tint; gold is already multiplied by the caller
  //   eliteStyle: the Abyss's Elites (ABYSS.elites): their own HP and damage
  //           multipliers and tint, and an aura behind them
  //   hullShare: multiplies a hullShare hit (the Abyss's ABYSS.hullShare)
  //   leader: in an escorted formation, the enemy this one keeps behind
  //   key:    its ENEMIES key (for the Wanted Board)
  //   fall:   a lava bomb's { deck, feetY (where it lands), fromY, ms }
  //   boulders: the Frost Giant throws ice boulders while walking (the finale)
  //   rising: a `rises` enemy summoned or raised at x: it rises there first
  constructor(scene, def, {
    x = LAYOUT.enemySpawnX, hpMultiplier, damageMultiplier, gold, elite = false, eliteStyle = null, hullShare = 1, leader = null,
    key = null, fall = null, boulders = false, rising = false,
  }) {
    this.scene = scene;
    this.def = def;
    this.key = key;
    this.elite = elite;
    this.eliteTint = eliteStyle?.tint ?? ELITE.tint;
    this.hullShareMult = hullShare;
    const eliteHp = elite ? eliteStyle?.hp ?? ELITE.hpMultiplier : 1;
    this.maxHp = Math.round(def.hp * hpMultiplier * eliteHp);
    this.hp = this.maxHp;
    this.damage = def.damage * damageMultiplier * (elite && eliteStyle ? eliteStyle.damage : 1);
    this.speed = def.speed;
    this.gold = gold;
    this.attackCooldown = 0;
    this.alive = true;
    // Shield and keg blast grow with the wave like HP does; armour is a
    // share of each hit, the same at every wave.
    this.armor = def.armor ?? 0;
    this.shieldMax = def.shield ? Math.round(def.shield.hp * hpMultiplier * eliteHp) : 0;
    this.shieldHp = this.shieldMax;
    this.blastDamage = def.blast ? def.blast.enemyDamage * hpMultiplier : 0;
    this.leader = leader;
    this.hpMultiplier = hpMultiplier;
    this.damageMultiplier = damageMultiplier;

    // Remaining ms for each status effect.
    this.stunTime = 0;
    this.slowTime = 0;
    this.slowFactor = 1;
    this.curseTime = 0;
    this.curseBonus = 0;
    this.curseMarkDelay = 0;  // ms before the curse mark shows (after Hex's burst)
    this.poisonTime = 0;
    this.poisonDps = 0;
    // Who to credit in the Captain's Log (BattleStats sources): the poison's
    // ticks, the curse's bonus damage, and the blow that killed it (for a
    // Keg Runner's blast).
    this.poisonSource = null;
    this.curseSource = null;
    this.killSource = null;
    this.hasteTime = 0;       // sped up by the Siren's song
    this.hasteMult = 1;
    this.fearTime = 0;        // Haunt: flees back toward the island
    this.pushLeft = 0;        // Tidal Wave: px still to be pushed back
    this.pushSpeed = 0;
    this.boostTime = 0;       // walking faster through a Magma Crab's fire puddle
    this.boostMult = 1;
    // A boss that enrages (the finale) attacks this much faster.
    this.rage = 1;
    this.stunGuard = 0;       // resist.stunGuardMs: ms before it can be stunned again
    // Ship parts: charmed by the Siren Figurehead (fights its own side for
    // charmTime ms, hitting every charmHitMs at charmHit), and the Frostwing
    // Sails' chill (pace x partSlow; 1 = none), set each step by ShipParts.
    this.charmTime = 0;
    this.charmHit = 0;
    this.charmFacing = 1;     // 1: facing the island, -1: the ship
    this.partSlow = 1;
    // The Heartwood Cannons' frozen log: pace x chillFactor for chillTime ms.
    this.chillTime = 0;
    this.chillFactor = 1;
    // An Ice Witch's shield over it: HP left of it, and its size.
    this.iceShieldHp = 0;
    this.iceShieldMax = 0;
    // ms left of an action animation (a throw, cast, roar or smash), during
    // which walking animations leave the body alone.
    this.actionTime = 0;
    // Out of sight and reach for this long: a Fog Wraith faded out, Captain
    // Blackbones sunk into the fog.
    this.fadeTime = 0;
    this.hideTime = 0;

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
    } else if (def.fx) {
      this.body = fxSprite(scene, def.fx, 0, 0);
    } else if (def.sprite && !def.sheetOnly) {
      this.body = scene.add.image(0, 0, def.sprite);
    } else {
      this.body = scene.add.rectangle(0, 0, def.width, def.height, def.color).setStrokeStyle(1, 0x333333);
    }
    // The Ghost Galleon and the Molten Leviathan sit just behind The Kraken
    // (which can surface in front of them), under the near water.
    // The Frost Wyrm perches in the background, behind the ship, and the
    // Siren Queen rises there.
    const depth = def.emerges ? DEPTH.kraken
      : def.galleon || def.leviathan ? DEPTH.kraken - 0.1
        : def.wyrm || def.queen ? DEPTH.perch
          : def.flies || def.falls ? DEPTH.flyer : DEPTH.enemy;
    this.body.setOrigin(...(def.origin ?? [0.5, 1])).setDepth(depth);
    if (elite) this.setFlash(false);  // gold tint (an Abyss Elite's violet)
    // An Abyss Elite's aura, looping behind it, centred on its body.
    this.aura = elite && eliteStyle ? scene.add.sprite(0, 0, ELITE_AURA_KEY).setDepth(depth - 0.01) : null;
    if (this.aura && scene.anims.exists(ELITE_AURA_KEY)) this.aura.play(ELITE_AURA_KEY);

    // An emerging enemy rises at layout.kraken (whose x / y are the top-left
    // of its frame) with a splash, can't be hit until fully risen, then
    // glides left to toX and attacks.
    this.riseTime = 0;
    this.splash = null;
    if (def.emerges) {
      const k = LAYOUT.kraken;
      this.frameW = this.body.displayWidth;
      this.frameH = this.body.displayHeight;
      this.riseLeft = k.x;
      this.x = this.riseLeft + this.frameW / 2;
      this.stopX = k.toX + this.frameW / 2;
      this.riseTime = k.riseMs;
      this.setFeetY(k.fromY + this.frameH);
      const s = SPRITES.krakenSplash;
      this.splash = scene.add.sprite(this.riseLeft, LAYOUT.waterY - s.aboveWater, s.key)
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
    } else if (def.galleon) {
      // The Ghost Galleon: its frame's top-left at layout.ghostGalleon. It
      // plays "emerge" in place (can't be hit meanwhile), then idles and fires.
      const g = def.galleon;
      const { x: gx, y: gy } = LAYOUT.ghostGalleon;
      this.frameW = this.body.displayWidth;
      this.frameH = this.body.displayHeight;
      this.frameLeft = gx;
      this.frameTop = gy;
      this.x = gx + this.frameW / 2;
      this.stopX = this.x;
      this.setFeetY(gy + this.frameH);
      this.riseTime = g.emergeMs;
      this.fireTimer = g.firstFireAt;
      this.boatTimer = g.firstBoatAt;
      this.emergeAnim = findAnim(scene, def.sprite, 'emerge');
      this.fireAnim = findAnim(scene, def.sprite, 'fire');
      this.sinkAnim = findAnim(scene, def.sprite, 'sink');
      if (this.emergeAnim) this.body.play(this.emergeAnim);
      for (const anim of [this.emergeAnim, this.fireAnim]) {
        if (anim) this.body.on(`animationcomplete-${anim}`, () => this.alive && this.body.play(this.idleAnim));
      }
    } else if (def.leviathan) {
      // The Molten Leviathan: its frame's top-left at its sheet's `position`
      // once risen; it rises in place from riseFrom px lower (can't be hit
      // meanwhile), then stays, spitting and roaring.
      const l = def.leviathan;
      const spec = sheetSpec(scene, def.sprite);
      const { x: lx, y: ly } = spec?.position ?? LAYOUT.ghostGalleon;
      this.frameW = spec?.frameWidth ?? this.body.displayWidth;
      this.frameH = spec?.frameHeight ?? this.body.displayHeight;
      this.frameLeft = lx;
      this.frameTop = ly;
      this.riseTop = ly + l.riseFrom;
      this.mouth = spec?.mouth ?? [this.frameW / 4, this.frameH / 2];
      this.x = lx + this.frameW / 2;
      this.stopX = this.x;
      this.setFeetY(this.riseTop + this.frameH);
      this.riseTime = l.riseMs;
      this.steamTimer = 0;
      this.spitTimer = l.firstSpitAt;
      this.roarTimer = l.firstRoarAt;
      this.spitAnim = findAnim(scene, def.sprite, 'spit');
      this.sinkAnim = findAnim(scene, def.sprite, 'sink');
      if (this.spitAnim) this.body.on(`animationcomplete-${this.spitAnim}`, () => this.alive && this.body.play(this.idleAnim));
    } else if (def.wyrm) {
      // The Frost Wyrm: swoops in playing "fly" from wyrm.from to its frame's
      // top-left at its sheet's perchPos (can't be hit meanwhile), then
      // perches there, breathing.
      const w = def.wyrm;
      const spec = sheetSpec(scene, def.sprite);
      this.frameW = spec?.frameWidth ?? this.body.displayWidth;
      this.frameH = spec?.frameHeight ?? this.body.displayHeight;
      const perch = spec?.perchPos ?? { x: 195, y: 68 };
      this.perchX = perch.x + this.frameW / 2;
      this.perchFeetY = perch.y + this.frameH;
      this.fromX = w.from.x + this.frameW / 2;
      this.fromFeetY = w.from.y + this.frameH;
      this.mouth = spec?.mouth ?? [16, 60];
      this.x = this.fromX;
      this.stopX = this.perchX;
      this.setFeetY(this.fromFeetY);
      this.riseTime = w.flyInMs;
      this.breathTimer = w.firstBreathAt;
      this.breathDue = 0;      // ms until the breath under way lands
      this.breaths = 0;        // breaths landed (every freezeEvery-th freezes)
      this.extraBreaths = 0;   // quick breaths still to come (after landing)
      this.airTime = 0;        // lifted off the iceberg, out of reach
      this.lifted = false;
      this.breathTiming = animTiming(spec, 'breath');
      this.flyAnim = findAnim(scene, def.sprite, 'fly');
      this.breathAnim = findAnim(scene, def.sprite, 'breath');
      this.fallAnim = findAnim(scene, def.sprite, 'fall');
      if (this.flyAnim) this.body.play(this.flyAnim);
      if (this.breathAnim) {
        this.body.on(`animationcomplete-${this.breathAnim}`, () => this.alive && this.airTime <= 0 && this.body.play(this.idleAnim));
      }
    } else if (def.giant) {
      // The Frost Giant: in from giant.spawnX behind the pines, out of reach
      // until it has roared at roarX, then down the lane like a walker.
      const g = def.giant;
      const spec = sheetSpec(scene, def.sprite);
      this.frameW = spec?.frameWidth ?? this.body.displayWidth;
      this.frameH = spec?.frameHeight ?? this.body.displayHeight;
      this.feet = spec?.feet ?? [this.frameW / 2, this.frameH];
      this.slamPoint = spec?.slamPoint ?? [0, this.frameH * 0.8];
      this.smashTiming = animTiming(spec, 'smash', spec?.smash?.impactFrame);
      this.x = g.spawnX;
      this.stopX = LAYOUT.shipContactX + def.width / 2;
      this.setFeetY(laneFeetY(this.x));
      this.phase = 'enter';    // then 'roar', 'walk' (or 'throw'), 'smash'
      this.shakeTimer = 0;
      this.puffTimer = 0;
      this.smashDue = 0;
      this.smashes = 0;
      this.throwDue = 0;
      this.boulders = boulders;
      this.boulderTimer = boulders ? g.finaleBoulderEvery : g.boulderEvery;
      this.angry = false;        // below angry.at of its HP: faster, smashing more often
      this.angerDue = false;     // gets angry as soon as what it's doing is done
      this.roarAnim = findAnim(scene, def.sprite, 'roar');
      this.smashAnim = findAnim(scene, def.sprite, 'smash');
      this.shatterAnim = findAnim(scene, def.sprite, 'shatter');
      // Footsteps: a tiny shake on the walk frames that put a foot down.
      this.body.on('animationupdate', (anim, frame) => {
        if (anim.key === this.walkAnim && g.steps.includes(frame.textureFrame)) {
          scene.cameras.main.shake(g.stepShake.duration, g.stepShake.intensity);
        }
      });
    } else if (def.queen) {
      // The Siren Queen: her frame's top-left at her sheet's `pos`, her
      // waterline on the water. She rises there ("rise", out of reach
      // meanwhile), then sings and sends tidal waves from where she is.
      const q = def.queen;
      const spec = sheetSpec(scene, def.sprite);
      this.frameW = spec?.frameWidth ?? this.body.displayWidth;
      this.frameH = spec?.frameHeight ?? this.body.displayHeight;
      const pos = spec?.pos ?? { x: 196, y: 150 };
      this.frameLeft = pos.x;
      this.frameTop = pos.y;
      this.mouth = spec?.mouth ?? [28, 32];
      this.waveHand = spec?.waveHand ?? [4, 49];
      this.x = pos.x + this.frameW / 2;
      this.stopX = this.x;
      this.setFeetY(pos.y + this.frameH * (def.origin?.[1] ?? 1));
      this.riseTime = Math.max(1, animTiming(spec, 'rise').ms);
      this.songTimer = q.firstSongAt;
      this.waveTimer = q.firstWaveAt;
      this.charmTarget = null;  // the crewmate her notes are flying at
      this.notesLeft = 0;
      this.noteTimer = 0;
      this.waveDue = 0;         // ms until the wave under way leaves her hand
      this.singTiming = animTiming(spec, 'sing');
      this.waveTiming = animTiming(spec, 'wave');
      this.riseAnim = findAnim(scene, def.sprite, 'rise');
      this.singAnim = findAnim(scene, def.sprite, 'sing');
      this.waveAnim = findAnim(scene, def.sprite, 'wave');
      this.sinkAnim = findAnim(scene, def.sprite, 'sink');
      if (this.riseAnim) this.body.play(this.riseAnim);
      for (const anim of [this.singAnim, this.waveAnim]) {
        if (anim) this.body.on(`animationcomplete-${anim}`, () => this.alive && this.body.play(this.idleAnim));
      }
    } else if (def.blackbones) {
      // Captain Blackbones: steps out of the fog at spawnX (out of reach
      // until he's out), then down the lane like a walker.
      const b = def.blackbones;
      const spec = sheetSpec(scene, def.sprite);
      this.feet = spec?.feet ?? [32, 62];
      this.muzzle = spec?.muzzle ?? [8, 24];
      this.slashTiming = animTiming(spec, 'slash', spec?.slash?.impactFrame);
      this.shootTiming = animTiming(spec, 'shoot', spec?.shoot?.fireFrame);
      this.fogSinkMs = animTiming(spec, 'fogSink').ms;
      this.fogRiseMs = animTiming(spec, 'fogRise').ms;
      this.summonMs = animTiming(spec, 'summon').ms * (1 + (spec?.summon?.repeat ?? 0));
      this.x = b.spawnX;
      this.stopX = LAYOUT.shipContactX + def.width / 2;
      this.setFeetY(laneFeetY(this.x));
      this.phase = 'enter';    // then 'walk', 'shoot', 'sink', 'rise', 'summon', 'slash'
      this.stepTimer = b.stepEvery;
      this.shotTimer = b.firstShotAt;
      this.shotDue = 0;        // ms until the flintlock under way fires
      this.slashDue = 0;       // ms until the slash under way lands
      this.raisesQueued = 0;   // raiseAt thresholds passed
      this.crewCalls = 0;      // crew raisings still to do
      this.circles = [];       // summon circles on the lane
      this.raiseSpots = [];
      this.fogRiseAnim = findAnim(scene, def.sprite, 'fogRise');
      this.fogSinkAnim = findAnim(scene, def.sprite, 'fogSink');
      this.shootAnim = findAnim(scene, def.sprite, 'shoot');
      this.slashAnim = findAnim(scene, def.sprite, 'slash');
      this.summonAnim = findAnim(scene, def.sprite, 'summon');
      this.deathAnim = findAnim(scene, def.sprite, 'death');
      this.playAction(this.fogRiseAnim, this.fogRiseMs);
      this.fogPuff();
      scene.cameras.main.shake(b.cackle.duration, b.cackle.intensity);
      scene.showBanner?.(def.banner, { color: UI.colors.warn });
      sfx.cackle();
    } else if (def.falls) {
      // A lava bomb: falls straight down from fall.fromY to land on its deck
      // (feet at fall.feetY) after fall.ms, over the warning shown there.
      this.x = x;
      this.stopX = x;
      this.fall = fall;
      this.fallSpeed = (fall.feetY - fall.fromY) / (fall.ms / 1000);
      this.setFeetY(fall.fromY);
      this.warning = fxSprite(scene, def.falls.warning, Math.round(x), Math.round(fall.feetY))
        .setOrigin(0.5, 1).setDepth(DEPTH.slotMarkers);
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
      // Front edge at the ship; a Yeti Raider, Ice Witch, Cursed Cannoneer
      // or Lantern Ghoul stops further out.
      this.stopX = def.ranged?.stopX ?? def.witch?.stopX ?? def.lantern?.stopX ?? LAYOUT.shipContactX + def.width / 2;
      this.setFeetY(def.floats ? LAYOUT.boatWaterY : this.groundY(this.x));
      const act = def.ranged ?? def.witch ?? def.lantern;
      if (act) {
        // Its throw, shot, cast or raise: the animation, how long it plays
        // and (a throw or shot) when the shot leaves.
        this.spec = sheetSpec(scene, def.sprite);
        this.actAnim = findAnim(scene, def.sprite, act.anim);
        this.actTiming = animTiming(this.spec, act.anim, def.ranged?.releaseFrame);
        this.attackCooldown = act.firstAt;
        this.releaseDue = 0;   // ms until the shot under way leaves the hand
        this.raisesLeft = def.lantern?.raises ?? 0;
      }
      if (def.wraith) {
        // A Fog Wraith fades out every so often (see fade).
        const spec = sheetSpec(scene, def.sprite);
        this.fadeTimer = def.wraith.every;
        this.fadeOutMs = animTiming(spec, 'fadeOut').ms;
        this.fadeInMs = animTiming(spec, 'fadeIn').ms;
        this.fadeOutAnim = findAnim(scene, def.sprite, 'fadeOut');
        this.fadeInAnim = findAnim(scene, def.sprite, 'fadeIn');
        if (this.fadeOutAnim) {
          this.body.on(`animationcomplete-${this.fadeOutAnim}`, () => this.fadeTime > 0 && this.body.setAlpha(0));
        }
      }
    }
    // Summoned or raised: it rises where it stands first ("rise"), out of
    // reach until it's up.
    if (rising && def.rises) {
      this.riseTime = Math.max(1, animTiming(sheetSpec(scene, def.sprite), def.rises.anim).ms);
      const anim = findAnim(scene, def.sprite, def.rises.anim);
      if (anim) this.body.play(anim);
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

  // Feet y of a walker at x: on the lane, a Fog Wraith hovering over it.
  groundY(x) { return laneFeetY(x) - (this.def.wraith?.hoverPx ?? 0); }

  get isRising() { return this.riseTime > 0; }
  // Out of reach for now: the Frost Wyrm in the air, the Frost Giant until
  // it roars, a Fog Wraith faded out, Captain Blackbones until he's out of
  // the fog and while he's sunk into it.
  get isHidden() {
    return this.airTime > 0 || (!!this.def.giant && this.phase === 'enter') || this.vanished
      || (!!this.def.blackbones && this.phase === 'enter');
  }
  // Out of sight too: no HP bar or status marks.
  get vanished() { return this.fadeTime > 0 || this.hideTime > 0; }
  // Drawn centred on its body rather than standing in a 32x32 box (status
  // and target marks): The Kraken, the Ghost Galleon, the Molten Leviathan
  // and the bosses since.
  get large() {
    const { def } = this;
    return !!(def.emerges || def.galleon || def.leviathan || def.wyrm || def.giant || def.queen || def.blackbones);
  }
  // Stays where it appeared (or falls straight down): the Siren, the Ghost
  // Galleon, the Molten Leviathan, the Frost Wyrm, the Siren Queen and lava
  // bombs.
  get anchored() {
    const { def } = this;
    return !!(def.stationary || def.galleon || def.leviathan || def.wyrm || def.queen || def.falls);
  }
  // Walkers that Haunt can scare, Tidal Wave can push and fire puddles
  // hurry: not flyers or anything anchored.
  get canBeMoved() { return !this.def.flies && !this.anchored; }
  // How far back toward the island it can be scared or pushed: where it
  // walked in from (The Kraken: where it rose).
  get retreatX() { return this.def.emerges ? this.riseLeft + this.frameW / 2 : LAYOUT.enemySpawnX; }
  get isAfraid() { return this.fearTime > 0; }
  // Whether heroes can aim at or hit it (anti-air aside, see airborne).
  get targetable() { return this.alive && !this.isRising && !this.isHidden; }
  // A flyer in the air (or a falling lava bomb): only anti-air crew can hit it.
  get airborne() { return (!!this.def.flies && !this.isGrounded) || !!this.def.falls; }
  get isGrounded() { return this.groundTime > 0; }
  get hpBarWidth() { return this.def.boss ? 40 : this.def.width + 4; }
  get hpBarY() { return Math.round(this.y - this.def.height / 2 - 4); }
  get isStunned() { return this.stunTime > 0; }
  get isSlowed() { return this.slowTime > 0; }
  get isCursed() { return this.curseTime > 0; }
  get isPoisoned() { return this.poisonTime > 0; }
  get isHasted() { return this.hasteTime > 0; }
  get isCharmed() { return this.charmTime > 0; }
  get hasShield() { return this.shieldHp > 0; }
  get hasIceShield() { return this.iceShieldHp > 0; }
  // How fast it moves and attacks: slows, the Siren's haste and the
  // Frostwing Sails' chill multiply.
  // The Abyss's Frenzied current hurries everyone.
  get pace() {
    return (this.isSlowed ? this.slowFactor : 1) * (this.isHasted ? this.hasteMult : 1) * this.partSlow
      * (this.chillTime > 0 ? this.chillFactor : 1) * (this.scene.currents?.enemyPace ?? 1);
  }
  // Walking only: faster through a fire puddle, slower in a blizzard.
  get moveBoost() { return (this.boostTime > 0 ? this.boostMult : 1) * (this.scene.blizzard?.chill ?? 1); }

  // Whether a hero (or ability) can hit it: anything targetable on the lane,
  // and flyers in the air only with anti-air. The crew leave a charmed one
  // alone while it fights its own side.
  canBeHit(antiAir) {
    return this.targetable && (antiAir || !this.airborne) && !this.isCharmed;
  }

  // The Siren Figurehead can charm walkers on the lane: not bosses, boats,
  // flyers, anything anchored, or one rising or out of reach.
  get canBeCharmed() {
    const { def } = this;
    return this.alive && this.targetable && !def.boss && !def.hazard && !def.floats && !def.flies && !this.anchored;
  }

  // --- Status effects ---

  // With resist.stunGuardMs, a stun can't land again until that long after
  // the last one ends (and doesn't stack or extend meanwhile).
  applyStun(duration) {
    const guard = this.def.resist?.stunGuardMs;
    if (guard && this.stunGuard > 0) return;
    this.stunTime = Math.max(this.stunTime, duration * (this.def.statusResist ?? 1));
    if (guard) this.stunGuard = this.stunTime + guard;
  }

  // Can't be driven back by Haunt or Tidal Wave (resist.immovable).
  get immovable() { return !!this.def.resist?.immovable; }

  // Only nets slow, so a slowed flyer is netted: it drops to the lane for
  // as long as the slow lasts.
  applySlow(factor, duration) {
    this.slowFactor = this.isSlowed ? Math.min(this.slowFactor, factor) : factor;
    this.slowTime = Math.max(this.slowTime, duration * (this.def.statusResist ?? 1));
    if (this.def.flies) this.groundTime = this.slowTime;
  }

  // The Siren Figurehead: for ms it turns round and fights the nearest
  // other enemy (see brawl), each hit hit damage.
  charm(ms, hit) {
    if (!this.canBeCharmed) return false;
    if (!this.isCharmed) this.attackCooldown = 0;
    this.charmTime = Math.max(this.charmTime, ms);
    this.charmHit = hit;
    return true;
  }

  // The Heartwood Cannons' log: moves and attacks factor x as fast for
  // duration (bosses for less, by statusResist). No net: it isn't grounded.
  applyChill(factor, duration) {
    this.chillFactor = this.chillTime > 0 ? Math.min(this.chillFactor, factor) : factor;
    this.chillTime = Math.max(this.chillTime, duration * (this.def.statusResist ?? 1));
  }

  // Haunt: flees back toward the island for duration.
  applyFear(duration) {
    if (!this.canBeMoved) return;
    this.fearTime = Math.max(this.fearTime, duration * (this.def.statusResist ?? 1));
  }

  // Tidal Wave: carried distance px back toward the island at speed.
  pushBack(distance, speed) {
    if (!this.canBeMoved || this.immovable) return;
    this.pushLeft = Math.max(this.pushLeft, distance * (this.def.statusResist ?? 1));
    this.pushSpeed = speed;
  }

  applyCurse(bonus, duration, source = null) {
    if (!this.isCursed || bonus >= this.curseBonus) this.curseSource = source;
    this.curseBonus = this.isCursed ? Math.max(this.curseBonus, bonus) : bonus;
    this.curseTime = Math.max(this.curseTime, duration);
  }

  // Hold back the curse mark for ms (while something else plays on the enemy).
  delayCurseMark(ms) {
    this.curseMarkDelay = ms;
  }

  // Re-poisoning refreshes the timer and keeps the stronger tick (and
  // whoever gave it).
  applyPoison(damagePerSecond, duration, source = null) {
    if (!this.isPoisoned || damagePerSecond >= this.poisonDps) this.poisonSource = source;
    this.poisonDps = this.isPoisoned ? Math.max(this.poisonDps, damagePerSecond) : damagePerSecond;
    this.poisonTime = Math.max(this.poisonTime, duration);
  }

  applyHaste(mult, duration) {
    this.hasteMult = this.isHasted ? Math.max(this.hasteMult, mult) : mult;
    this.hasteTime = Math.max(this.hasteTime, duration);
  }

  // A fire puddle: walks mult x as fast for duration (renewed while in it).
  applyMoveBoost(mult, duration) {
    if (!this.canBeMoved) return;
    this.boostMult = this.boostTime > 0 ? Math.max(this.boostMult, mult) : mult;
    this.boostTime = Math.max(this.boostTime, duration);
  }

  tickStatus(dt) {
    if (this.isPoisoned) {
      const tick = Math.min(dt, this.poisonTime);
      this.poisonTime -= tick;
      this.takeDamage(this.poisonDps * tick / 1000, { flash: false, dot: true, source: this.poisonSource });
      if (!this.alive) return;
    }
    this.stunTime = Math.max(0, this.stunTime - dt);
    this.stunGuard = Math.max(0, this.stunGuard - dt);
    this.slowTime = Math.max(0, this.slowTime - dt);
    this.groundTime = Math.max(0, this.groundTime - dt);
    this.curseTime = Math.max(0, this.curseTime - dt);
    this.curseMarkDelay = Math.max(0, this.curseMarkDelay - dt);
    this.hasteTime = Math.max(0, this.hasteTime - dt);
    this.fearTime = Math.max(0, this.fearTime - dt);
    this.boostTime = Math.max(0, this.boostTime - dt);
    this.charmTime = Math.max(0, this.charmTime - dt);
    this.chillTime = Math.max(0, this.chillTime - dt);
  }

  // --- Behaviour ---

  update(dt, ship) {
    if (!this.alive) return;
    this.tickStatus(dt);
    if (!this.alive) return;  // poison can finish it off

    let moving = false;
    if (this.isRising) {
      this.rise(dt);
    } else if (this.pushLeft > 0) {
      this.pushed(dt);
    } else if (!this.isStunned) {
      // Slow and haste affect both moving and attack rate.
      const sdt = dt * this.pace;
      this.actionTime = Math.max(0, this.actionTime - sdt);
      if (this.def.wraith) this.fade(sdt);
      if (this.def.flies) {
        moving = this.fly(sdt, dt, ship);
      } else if (this.def.falls) {
        if (this.drop(sdt, ship)) return;   // landed
      } else if (this.def.galleon) {
        this.sail(sdt, ship);
      } else if (this.def.leviathan) {
        this.lurk(sdt, ship);
      } else if (this.def.wyrm) {
        this.perch(sdt, ship);
      } else if (this.def.giant) {
        moving = this.stride(sdt, ship);
      } else if (this.def.queen) {
        this.reign(sdt, ship);
      } else if (this.def.blackbones) {
        moving = this.prowl(sdt, ship);
      } else if (this.def.stationary) {
        this.sing(sdt);
      } else if (this.isCharmed) {
        moving = this.brawl(sdt);
      } else if (this.isAfraid) {
        moving = this.flee(sdt);
      } else if (this.x > this.stopX) {
        moving = this.walk(sdt);
      } else if (this.def.stealPercent) {
        this.steal();
        return;
      } else if (this.def.blast) {
        this.blowUpAtShip(ship);
        return;
      } else if (this.def.boards) {
        this.board(ship);
        return;
      } else if (this.def.rams) {
        this.ram(ship);
        return;
      } else if (this.def.ranged) {
        this.throwAt(sdt, ship);
      } else if (this.def.witch) {
        this.cast(sdt);
      } else if (this.def.lantern) {
        this.tendLantern(sdt);
      } else {
        this.attack(sdt, ship);
      }
    }
    this.animate(moving);

    this.followGround();
    this.aura?.setPosition(Math.round(this.x), Math.round(this.y)).setVisible(!this.vanished);
    if (this.nameTag) {
      // Kept on screen (a boss coming in at the right edge).
      const half = Math.ceil(this.nameTag.inkWidth / 2) + 2;
      this.nameTag.setPosition(Phaser.Math.Clamp(Math.round(this.x), half, DISPLAY.width - half), this.hpBarY - 2);
    }
    this.drawHpBar();
    this.drawStatus();
  }

  // Walkers stand on the lane (a Fog Wraith over it), boats on the
  // waterline; the rest keep their own height.
  followGround() {
    const { def } = this;
    if (def.emerges || def.flies || this.anchored) this.setFeetY(this.feetY);
    else this.setFeetY(def.floats ? LAYOUT.boatWaterY : this.groundY(this.x));
  }

  // Tidal Wave: carried back toward the island (even while stunned).
  pushed(dt) {
    const step = Math.min(this.pushLeft, this.pushSpeed * dt / 1000);
    this.pushLeft -= step;
    this.x = Math.min(this.retreatX, this.x + step);
    if (this.x >= this.retreatX) this.pushLeft = 0;
  }

  // Haunt: runs back toward the island at its own pace. Returns whether it moved.
  flee(sdt) {
    if (this.immovable) return false;   // scared, but it stands its ground
    const x = Math.min(this.retreatX, this.x + this.speed * this.moveBoost * sdt / 1000);
    const moved = x > this.x;
    this.x = x;
    return moved;
  }

  // Charmed: walks to the nearest other enemy on the lane and hits it every
  // attackInterval for charmHit. Returns whether it moved.
  brawl(sdt) {
    let target = null;
    for (const e of this.scene.enemies) {
      if (e === this || !e.alive || !e.targetable || e.isCharmed || e.def.hazard || e.airborne) continue;
      if (!target || Math.abs(e.x - this.x) < Math.abs(target.x - this.x)) target = e;
    }
    if (!target) return false;
    this.charmFacing = target.x >= this.x ? 1 : -1;
    const reach = (this.def.width + target.def.width) / 2 + 2;
    const gap = Math.abs(target.x - this.x) - reach;
    if (gap > 0 && !this.anchored) {
      const step = Math.min(gap, this.speed * this.moveBoost * sdt / 1000);
      this.x = Math.min(LAYOUT.enemySpawnX, Math.max(this.stopX, this.x + this.charmFacing * step));
      return step > 0;
    }
    this.attackCooldown -= sdt;
    if (this.attackCooldown > 0) return false;
    this.attackCooldown = this.def.attackInterval;
    if (this.attackAnim) this.body.play(this.attackAnim);
    playFx(this.scene, 'hit_spark', target.x, target.y);
    target.takeDamage(this.charmHit);
    return false;
  }

  // Left along the lane; in an escorted formation, never closer than
  // followGap behind the leader while it walks. Returns whether it moved.
  walk(sdt) {
    let minX = this.stopX;
    const { leader } = this;
    if (leader?.alive && leader.x > leader.stopX) {
      minX = Math.max(minX, leader.x + (leader.def.width + this.def.width) / 2 + WAVES.followGap);
    }
    const x = Math.max(minX, this.x - this.speed * this.moveBoost * sdt / 1000);
    const moved = x < this.x;
    if (moved) this.x = x;
    return moved;
  }

  attack(sdt, ship) {
    this.attackCooldown -= sdt;
    if (this.attackCooldown > 0) return;
    ship.takeDamage(this.damage, this);
    this.attackCooldown = this.def.attackInterval / this.rage;
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

  // The Ghost Galleon, once risen: a volley from every gun port each
  // fireEvery, and a boarding boat each boatEvery (faster when enraged).
  sail(sdt, ship) {
    const g = this.def.galleon;
    const t = sdt * this.rage;
    this.fireTimer -= t;
    this.boatTimer -= t;
    if (this.fireTimer <= 0) {
      this.fireTimer += g.fireEvery;
      this.volley(ship);
    }
    if (this.boatTimer <= 0) {
      this.boatTimer += g.boatEvery;
      this.launchBoat();
    }
  }

  // "fire", and a ghost cannonball lobbed from each gun port at a random
  // spot on the hull.
  volley(ship) {
    const { scene } = this;
    const g = this.def.galleon;
    if (this.fireAnim) this.body.play(this.fireAnim);
    sfx.boom();
    const ports = sheetSpec(scene, this.def.sprite)?.gunPorts ?? [[this.frameW / 2, this.frameH * 0.75]];
    for (const [px, py] of ports) {
      const target = { alive: true, ...ship.hullTarget() };
      scene.projectiles.push(new LobProjectile(scene, {
        x: this.frameLeft + px, y: this.frameTop + py, target,
        flightTime: g.flightTime, arcHeight: g.arcHeight, sprite: g.shot,
        aimAt: (t) => ({ x: t.x, y: t.y }),
        findTarget: () => null,
        onHit: (_t, x, y) => {
          ship.takeDamage(this.damage, this);
          playFx(scene, g.impact, x, y);
        },
      }));
    }
  }

  // A boarding boat sets off from the bow, scaled like the wave.
  launchBoat() {
    const def = ENEMIES.boardingBoat;
    this.spawnFrom('boardingBoat', this.frameLeft + this.def.galleon.boatX + def.width / 2);
  }

  // Another enemy joining the wave from this one (a boarding boat, a broken
  // golem's crabs, a raised Bone Deckhand) at x, scaled like it (never
  // Elite), counted in the wave. rising: it rises there first.
  spawnFrom(key, x, { rising = false } = {}) {
    const { scene } = this;
    const def = ENEMIES[key];
    const enemy = new Enemy(scene, def, {
      x,
      hpMultiplier: this.hpMultiplier,
      damageMultiplier: this.damageMultiplier,
      gold: Math.round(def.gold * (scene.waves?.scaling.gold ?? 1)),
      key: def.minion ? null : key,
      hullShare: this.hullShareMult,
      rising,
    });
    scene.enemies.push(enemy);
    if (scene.waves) scene.waves.total++;
    return enemy;
  }

  // An Obsidian Golem breaks into Magma Crabs where it fell, spread along the
  // lane (never past where walkers stop).
  split() {
    const { into, count, spread } = this.def.splits;
    const minX = LAYOUT.shipContactX + ENEMIES[into].width / 2;
    for (let i = 0; i < count; i++) {
      const x = this.x + (i - (count - 1) / 2) * spread;
      this.spawnFrom(into, Phaser.Math.Clamp(x, minX, LAYOUT.enemySpawnX));
    }
  }

  // A lava bomb falling toward its deck; lands at the bottom. Returns
  // whether it landed (and is gone).
  drop(sdt, ship) {
    this.setFeetY(Math.min(this.fall.feetY, this.feetY + this.fallSpeed * sdt / 1000));
    if (this.feetY < this.fall.feetY) return false;
    this.land(ship);
    return true;
  }

  // The bomb hits its deck: a share of the hull, the deck's crew stunned, a
  // lava splash and a shake.
  land(ship) {
    const { scene } = this;
    const f = this.def.falls;
    this.alive = false;
    ship.takeDamage(this.hullHit(ship), this);
    for (const h of scene.heroes) if (h.deck === this.fall.deck) h.stun(f.stun);
    playFx(scene, f.impact, this.x, this.feetY).setOrigin(0.5, 1);
    scene.cameras.main.shake(f.shake.duration, f.shake.intensity);
    sfx.lavaSplash();
    this.removeOverlays();
    this.body.destroy();
  }

  // The Molten Leviathan, once risen: a magma glob every spitEvery (faster
  // when enraged) and a roar every roarEvery.
  lurk(sdt, ship) {
    const l = this.def.leviathan;
    this.spitTimer -= sdt * this.rage;
    this.roarTimer -= sdt;
    if (this.spitTimer <= 0) {
      this.spitTimer += l.spitEvery;
      this.spit(ship);
    }
    if (this.roarTimer <= 0) {
      this.roarTimer += l.roarEvery;
      this.roar();
    }
  }

  // "spit", and a magma glob lobbed from its mouth at a random spot on the hull.
  spit(ship) {
    const { scene } = this;
    const l = this.def.leviathan;
    if (this.spitAnim) this.body.play(this.spitAnim);
    sfx.spit();
    const [mx, my] = this.mouth;
    const target = { alive: true, ...ship.hullTarget() };
    scene.projectiles.push(new LobProjectile(scene, {
      x: this.frameLeft + mx, y: this.frameTop + my, target,
      flightTime: l.flightTime, arcHeight: l.arcHeight, sprite: l.glob,
      aimAt: (t) => ({ x: t.x, y: t.y }),
      findTarget: () => null,
      onHit: (_t, x, y) => {
        ship.takeDamage(this.damage, this);
        playFx(scene, l.impact, x, y);
        sfx.lavaSplash();
      },
    }));
  }

  // A roar: "spit" with the jaws wide, a shake, and lava bombs at once.
  roar() {
    const { scene } = this;
    const l = this.def.leviathan;
    if (this.spitAnim) this.body.play(this.spitAnim);
    sfx.roar();
    scene.cameras.main.shake(l.roarShake.duration, l.roarShake.intensity);
    scene.volcano?.dropBombs(l.roarBombs);
  }

  // --- Frostbite Reef ---

  // A Yeti Raider (or Cursed Cannoneer) at its spot: "throw" ("fire") every
  // attackInterval, the snowball (grapeshot) leaving on the release frame.
  throwAt(sdt, ship) {
    if (this.releaseDue > 0) {
      this.releaseDue -= sdt;
      if (this.releaseDue <= 0) this.releaseShot(ship);
    }
    this.attackCooldown -= sdt * this.rage;
    if (this.attackCooldown > 0) return;
    this.attackCooldown += this.def.attackInterval;
    this.playAction(this.actAnim, this.actTiming.ms);
    this.releaseDue = Math.max(1, this.actTiming.at);
  }

  // The snowball arcs from the hand (handOnRelease, frame-relative) to a
  // random spot on the hull; grapeshot (flat) flies straight from the
  // muzzle (ranged.from) to the hull at its height.
  releaseShot(ship) {
    const r = this.def.ranged;
    const [hx, hy] = this.spec?.[r.from ?? 'handOnRelease'] ?? [4, 12];
    const shot = {
      x: this.x - 16 + hx, y: this.feetY - 32 + hy,
      sprite: r.shot, impact: r.impact, damage: this.damage * r.damageMult,
    };
    if (r.flat) this.fireAtHull(ship, { ...shot, speed: r.shotSpeed });
    else this.lobAtHull(ship, { ...shot, flightTime: r.flightTime, arcHeight: r.arcHeight });
  }

  // A straight shot from (x, y) at the hull, level with it where the hull
  // reaches that high, hitting for damage with `impact` (the Cursed
  // Cannoneer's grapeshot).
  fireAtHull(ship, {
    x, y, sprite, impact, damage, speed,
  }) {
    const { scene } = this;
    const { minAbove, maxAbove } = SHIP.hull;
    const spot = ship.hullTarget();
    const target = { alive: true, x: spot.x, y: Phaser.Math.Clamp(y, LAYOUT.waterY - maxAbove, LAYOUT.waterY - minAbove) };
    scene.projectiles.push(new Projectile(scene, {
      x, y, target, speed, sprite, rotate: true,
      findTarget: () => null,
      onHit: (_t, hx, hy) => {
        ship.takeDamage(damage, this);
        playFx(scene, impact, hx, hy);
        sfx.musket();
      },
    }));
  }

  // A shot from (x, y) arcing to a random spot on the hull, hitting it for
  // damage with `impact` (a Yeti Raider's snowball, the Frost Giant's boulder).
  lobAtHull(ship, {
    x, y, sprite, impact, flightTime, arcHeight, damage, spin = 0,
  }) {
    const { scene } = this;
    const target = { alive: true, ...ship.hullTarget() };
    scene.projectiles.push(new LobProjectile(scene, {
      x, y, target, flightTime, arcHeight, sprite, spin,
      aimAt: (t) => ({ x: t.x, y: t.y }),
      findTarget: () => null,
      onHit: (_t, hx, hy) => {
        ship.takeDamage(damage, this);
        playFx(scene, impact, hx, hy);
        sfx.frostHit();
      },
    }));
  }

  // An Ice Witch at her spot: "cast" every witch.every, shielding the front
  // enemy that has no shield.
  cast(sdt) {
    const w = this.def.witch;
    this.attackCooldown -= sdt * this.rage;
    if (this.attackCooldown > 0) return;
    this.attackCooldown += w.every;
    let front = null;
    for (const e of this.scene.enemies) {
      if (e === this || !e.targetable || e.def.hazard || e.hasIceShield || e.hasShield) continue;
      if (e.def.boss && !w.shieldsBosses) continue;
      if (!front || e.x < front.x) front = e;
    }
    if (!front) return;
    this.playAction(this.actAnim, this.actTiming.ms);
    front.giveIceShield(Math.round(front.maxHp * w.share), w);
  }

  // An Ice Witch's shield: absorbs amount of damage (see takeDamage).
  giveIceShield(amount, spec) {
    this.iceShieldMax = amount;
    this.iceShieldHp = amount;
    this.iceSpec = spec;
    this.drawHpBar();
  }

  breakIceShield() {
    this.iceShieldHp = 0;
    playFx(this.scene, this.iceSpec.breakFx, this.x, this.y);
    sfx.iceBreak();
  }

  // A Sled Penguin at the ship: one ram for rams.mult x its damage, and it's
  // gone (no gold).
  ram(ship) {
    const { rams } = this.def;
    this.alive = false;
    ship.takeDamage(this.damage * rams.mult, this);
    playFx(this.scene, rams.impact, this.x - this.def.width / 2, this.y);
    sfx.frostHit();
    this.removeOverlays();
    this.scene.tweens.add({ targets: this.body, alpha: 0, duration: 150, onComplete: () => this.body.destroy() });
  }

  // Play an action animation (anim, if there is one) lasting ms, during
  // which walking animations leave the body alone.
  playAction(anim, ms) {
    this.actionTime = ms;
    if (anim) this.body.play(anim);
  }

  // The Frost Wyrm on its perch (once it has flown in): a breath every
  // breathEvery (faster when enraged); lifted off the iceberg, it waits out
  // of reach, then lands and breathes twice.
  perch(sdt, ship) {
    const w = this.def.wyrm;
    if (this.airTime > 0) {
      this.airTime -= sdt;
      // Up liftPx over liftMs, hover, and back down over the last liftMs.
      const t = Math.min(1, (w.airMs - this.airTime) / w.liftMs, this.airTime / w.liftMs);
      this.setFeetY(this.perchFeetY - w.liftPx * Math.max(0, t));
      if (this.airTime <= 0) this.touchDown();
      return;
    }
    if (this.breathDue > 0) {
      this.breathDue -= sdt;
      if (this.breathDue <= 0) this.breathe(ship);
    }
    this.breathTimer -= sdt * this.rage;
    if (this.breathTimer > 0) return;
    if (this.extraBreaths > 0) {
      this.extraBreaths--;
      this.breathTimer += w.gapMs;
    } else {
      this.breathTimer += w.breathEvery;
    }
    this.playAction(this.breathAnim, this.breathTiming.ms);
    this.breathDue = Math.max(1, w.breathAt);
    sfx.frostBreath();
  }

  // The breath lands: frost_breath with its right edge at the mouth, the
  // hull takes the Wyrm's damage, and every freezeEvery-th breath freezes the
  // crewmate nearest the bow.
  breathe(ship) {
    const { scene } = this;
    const w = this.def.wyrm;
    const [mx, my] = this.mouth;
    const left = Math.round(this.x - this.frameW / 2);
    const top = Math.round(this.feetY - this.frameH);
    playFx(scene, w.breath, left + mx, top + my).setOrigin(1, 0.5);
    ship.takeDamage(this.damage, this);
    scene.cameras.main.shake(w.shake.duration, w.shake.intensity);
    if (++this.breaths % w.freezeEvery === 0) ship.crewNearestBow(scene.heroes)?.freeze(w.freezeMs, 'wyrm');
    sfx.frostHit();
  }

  // Below liftAt of its HP (once): up off the iceberg, out of reach.
  liftOff() {
    const w = this.def.wyrm;
    this.lifted = true;
    this.airTime = w.airMs;
    this.breathDue = 0;
    this.actionTime = 0;
    if (this.flyAnim) this.body.play(this.flyAnim);
  }

  // Back on the iceberg: it breathes at once, and again gapMs later.
  touchDown() {
    this.airTime = 0;
    this.setFeetY(this.perchFeetY);
    if (this.idleAnim) this.body.play(this.idleAnim);
    this.breathTimer = 0;
    this.extraBreaths = 1;
  }

  // The Frost Giant: its entrance through the pines and roar, then down the
  // lane (stopping now and then to hurl a boulder, more often in the
  // finale), and at the ship a smash every attackInterval (smashEvery once
  // angry). Returns whether it moved.
  stride(sdt, ship) {
    const { scene } = this;
    const g = this.def.giant;
    if (this.phase === 'enter') {
      this.x = Math.max(g.roarX, this.x - g.entranceSpeed * this.moveBoost * sdt / 1000);
      if (this.x > g.treesX) {
        // Pushing through the pines: they shake and shed snow.
        this.shakeTimer -= sdt;
        if (this.shakeTimer <= 0) {
          this.shakeTimer += g.shakeEvery;
          scene.scenery?.shakeFront(1, g.shakeEvery / 2);
        }
        this.puffTimer -= sdt;
        if (this.puffTimer <= 0) {
          this.puffTimer += g.puffEvery;
          // The battle's island (the Abyss has no pines).
          const puff = (scene.waves?.island ?? scene.progress?.island)?.spawnPuff;
          if (puff) playSpawnPuff(scene, puff);
        }
      }
      if (this.x <= g.roarX) {
        this.phase = 'roar';
        this.playAction(this.roarAnim, g.roarMs);
        scene.cameras.main.shake(g.roarShake.duration, g.roarShake.intensity);
        scene.showBanner?.(this.def.banner, { color: UI.colors.warn });
        sfx.roar();
        return false;
      }
      return true;
    }
    if (this.phase === 'roar') {
      if (this.actionTime <= 0) this.phase = 'walk';
      return false;
    }
    if (this.angerDue && this.actionTime <= 0) {
      this.getAngry();
      return false;
    }
    if (this.phase === 'rage') {
      if (this.actionTime <= 0) this.phase = 'walk';
      return false;
    }
    if (this.phase === 'throw') {
      if (this.throwDue > 0) {
        this.throwDue -= sdt;
        if (this.throwDue <= 0) this.hurlBoulder(ship);
      }
      if (this.actionTime <= 0) this.phase = 'walk';
      return false;
    }
    if (this.isAfraid) return this.flee(sdt);
    if (this.x > this.stopX) {
      // Walking (again, if a Tidal Wave pushed it back from the ship).
      this.phase = 'walk';
      this.boulderTimer -= sdt * this.rage;
      if (this.boulderTimer <= 0) {
        this.boulderTimer += this.boulders ? g.finaleBoulderEvery : g.boulderEvery;
        this.phase = 'throw';
        this.playAction(this.roarAnim, g.throwMs);
        this.throwDue = g.throwMs;
        return false;
      }
      return this.walk(sdt);
    }
    this.phase = 'smash';
    if (this.smashDue > 0) {
      this.smashDue -= sdt;
      if (this.smashDue <= 0) this.smash(ship);
    }
    this.attackCooldown -= sdt * this.rage;
    if (this.attackCooldown <= 0) {
      this.attackCooldown += this.angry ? g.angry.smashEvery : this.def.attackInterval;
      this.playAction(this.smashAnim, this.smashTiming.ms);
      this.smashDue = Math.max(1, this.smashTiming.at);
    }
    return false;
  }

  // Below angry.at of its HP: a quick roar, its tint flashing red and white
  // and a shake, then it walks faster and smashes more often.
  getAngry() {
    const { scene } = this;
    const a = this.def.giant.angry;
    this.angerDue = false;
    this.angry = true;
    this.speed = this.def.speed * a.speed;
    this.phase = 'rage';
    this.playAction(this.roarAnim, a.roarMs);
    scene.cameras.main.shake(a.shake.duration, a.shake.intensity);
    sfx.roar();
    for (let i = 0; i < a.flashes; i++) {
      scene.time.delayedCall(i * a.flashMs, () => this.alive && this.body.setTintFill?.(a.flash[i % a.flash.length]));
    }
    scene.time.delayedCall(a.flashes * a.flashMs, () => this.alive && this.setFlash(false));
  }

  // Where a frame-relative point of the Giant's sheet is now.
  framePoint([px, py]) {
    return { x: Math.round(this.x - this.feet[0] + px), y: Math.round(this.feetY - this.feet[1] + py) };
  }

  // The club lands: the hull takes the Giant's damage, a hard shake and
  // ground_quake on the slam point; every freezeEvery-th smash also freezes
  // the crewmate nearest the bow.
  smash(ship) {
    const { scene } = this;
    const g = this.def.giant;
    ship.takeDamage(this.damage, this);
    const slam = this.framePoint(this.slamPoint);
    playFx(scene, 'ground_quake', slam.x, slam.y).setOrigin(0.5, 1);
    scene.cameras.main.shake(g.smashShake.duration, g.smashShake.intensity);
    sfx.stomp();
    if (++this.smashes % g.freezeEvery === 0) ship.crewNearestBow(scene.heroes)?.freeze(g.freezeMs, 'giant');
  }

  // The finale: an ice boulder hurled from its raised hand at the hull.
  hurlBoulder(ship) {
    const g = this.def.giant;
    const from = this.framePoint(g.throwFrom);
    this.lobAtHull(ship, {
      ...from, sprite: g.boulder, impact: g.impact, flightTime: g.flightTime, arcHeight: g.arcHeight,
      damage: this.damage * g.boulderMult, spin: g.spin,
    });
  }

  // --- Fogbound Isle ---

  // A Fog Wraith: every wraith.every ms it fades out ("fadeOut", a fog puff)
  // and is out of sight and reach for hideMs, then fades back in.
  fade(sdt) {
    const w = this.def.wraith;
    if (this.fadeTime > 0) {
      this.fadeTime -= sdt;
      if (this.fadeTime <= 0) {
        this.fadeTime = 0;
        this.body.setAlpha(1);
        this.playAction(this.fadeInAnim, this.fadeInMs);
      }
    }
    this.fadeTimer -= sdt;
    if (this.fadeTimer > 0) return;
    this.fadeTimer += w.every;
    this.fadeTime = w.hideMs;
    this.playAction(this.fadeOutAnim, this.fadeOutMs);
    playFx(this.scene, w.puff, Math.round(this.x), Math.round(this.y), DEPTH.enemy + 0.1);
    sfx.fogPuff();
  }

  // A Lantern Ghoul at its spot: from lantern.firstAt, every lantern.every it
  // raises the latest Bone Deckhand fallen in the last graveMs (waiting for
  // one if there's none): "raise", and a soul wisp from its lantern to where
  // the deckhand fell. At most lantern.raises times.
  tendLantern(sdt) {
    const l = this.def.lantern;
    if (this.raisesLeft <= 0) return;
    this.attackCooldown -= sdt * this.rage;
    if (this.attackCooldown > 0) return;
    const grave = this.scene.mists?.claimGrave(l.graveMs);
    if (!grave) return;
    this.attackCooldown = l.every;
    this.raisesLeft--;
    this.playAction(this.actAnim, this.actTiming.ms);
    sfx.wisp();
    const [lx, ly] = this.spec?.lantern ?? [6, 13];
    const target = { alive: true, x: grave.x, y: laneFeetY(grave.x) - 6 };
    this.scene.projectiles.push(new Projectile(this.scene, {
      x: this.x - 16 + lx, y: this.feetY - 32 + ly, target, speed: l.wispSpeed, sprite: l.wisp,
      findTarget: () => null,
      onHit: () => this.raiseDead(grave),
    }));
  }

  // The wisp reaches the grave: the deckhand rises there with hpShare of its HP.
  raiseDead(grave) {
    const raised = this.spawnFrom(grave.enemy.key ?? 'boneDeckhand', grave.x, { rising: true });
    raised.hp = Math.max(1, Math.round(raised.maxHp * this.def.lantern.hpShare));
    raised.drawHpBar();
  }

  // The Siren Queen, once risen: a song every songEvery (angrySongEvery
  // below angryAt of her HP) while nobody is charmed, and a tidal wave every
  // waveEvery; whichever falls due during the other waits for it.
  reign(sdt, ship) {
    const q = this.def.queen;
    if (this.notesLeft > 0) {
      this.noteTimer -= sdt;
      if (this.noteTimer <= 0) {
        this.noteTimer += q.noteGap;
        this.sendNote();
      }
    }
    if (this.waveDue > 0) {
      this.waveDue -= sdt;
      if (this.waveDue <= 0) this.sendWave(ship);
    }
    this.songTimer -= sdt * this.rage;
    this.waveTimer -= sdt * this.rage;
    if (this.actionTime > 0 || this.waveDue > 0) return;
    const charmed = this.charmTarget || this.scene.heroes.some((h) => h.isCharmed);
    if (this.songTimer <= 0 && !charmed) {
      this.singCharm();
    } else if (this.waveTimer <= 0) {
      this.waveTimer = q.waveEvery;
      this.playAction(this.waveAnim, this.waveTiming.ms);
      this.waveDue = Math.max(1, q.waveAt);
    }
  }

  // "sing", and charm notes on their way to a random crewmate who attacks
  // (not The Captain).
  singCharm() {
    const q = this.def.queen;
    this.songTimer = this.hp <= this.maxHp * q.angryAt ? q.angrySongEvery : q.songEvery;
    const crew = this.scene.heroes.filter((h) => !h.def.aura);
    if (!crew.length) return;
    this.charmTarget = crew[Math.floor(Math.random() * crew.length)];
    this.notesLeft = q.notes;
    this.noteTimer = 0;
    this.playAction(this.singAnim, this.singTiming.ms);
    sfx.sirenSong();
  }

  // A charm note from her mouth to the crewmate; the last one charms them.
  sendNote() {
    const { scene } = this;
    const q = this.def.queen;
    const hero = this.charmTarget;
    const last = --this.notesLeft === 0;
    const [mx, my] = this.mouth;
    scene.projectiles.push(new Projectile(scene, {
      x: this.frameLeft + mx, y: this.frameTop + my, target: { alive: true, x: hero.x, y: hero.y },
      speed: q.noteSpeed, sprite: q.note,
      findTarget: () => null,
      onHit: () => {
        if (!last) return;
        this.charmTarget = null;
        if (this.alive) hero.charm(q.charmMs, this);
      },
    }));
  }

  // A siren_wave rolls left from her hand along the water (its bottom on
  // it) into the hull for her damage.
  sendWave(ship) {
    const { scene } = this;
    const q = this.def.queen;
    const y = LAYOUT.waterY;
    const wave = new Projectile(scene, {
      x: this.frameLeft + this.waveHand[0], y, target: { alive: true, x: LAYOUT.shipContactX - SHIP.hull.right, y },
      speed: q.waveSpeed, sprite: q.wave,
      findTarget: () => null,
      onHit: () => {
        ship.takeDamage(this.damage, this);
        scene.cameras.main.shake(q.shake.duration, q.shake.intensity);
        sfx.splash();
      },
    });
    wave.sprite.setOrigin(0.5, 1);
    scene.projectiles.push(wave);
    sfx.wave();
  }

  // Captain Blackbones, out of the fog: down the lane, now and then sinking
  // into the fog to step out further on or firing his flintlock; raising his
  // crew when it's due; at the ship, a slash every attackInterval. Returns
  // whether he moved.
  prowl(sdt, ship) {
    const b = this.def.blackbones;
    if (this.shotDue > 0) {
      this.shotDue -= sdt;
      if (this.shotDue <= 0) this.fireFlintlock(ship);
    }
    if (this.slashDue > 0) {
      this.slashDue -= sdt;
      if (this.slashDue <= 0) this.slash(ship);
    }
    if (this.hideTime > 0) {
      if (this.actionTime <= 0) this.body.setAlpha(0);   // sunk out of sight
      this.hideTime -= sdt;
      if (this.hideTime <= 0) this.stepOut();
      return false;
    }
    if (this.actionTime > 0) return false;
    if (this.phase === 'summon') this.raiseCrew();
    if (this.phase === 'enter') this.phase = 'walk';
    if (this.crewCalls > 0) {
      this.summon();
      return false;
    }
    if (this.isAfraid) return this.flee(sdt);   // immovable: he stands his ground
    if (this.x > this.stopX) {
      this.phase = 'walk';
      this.stepTimer -= sdt * this.rage;
      this.shotTimer -= sdt * this.rage;
      if (this.stepTimer <= 0) {
        this.stepTimer += b.stepEvery;
        this.sinkIntoFog();
        return false;
      }
      if (this.shotTimer <= 0) {
        this.shotTimer += b.shootEvery;
        this.phase = 'shoot';
        this.playAction(this.shootAnim, this.shootTiming.ms);
        this.shotDue = Math.max(1, this.shootTiming.at);
        return false;
      }
      return this.walk(sdt);
    }
    this.phase = 'slash';
    this.attackCooldown -= sdt * this.rage;
    if (this.attackCooldown <= 0) {
      this.attackCooldown += this.def.attackInterval;
      this.playAction(this.slashAnim, this.slashTiming.ms);
      this.slashDue = Math.max(1, this.slashTiming.at);
    }
    return false;
  }

  // The finale (when the Siren Queen falls), or a raiseAt of his HP: he
  // raises his crew as soon as he's free.
  callCrew() {
    this.crewCalls++;
  }

  fogPuff() {
    playFx(this.scene, this.def.blackbones.puff, Math.round(this.x), Math.round(this.feetY), DEPTH.enemy + 0.1)
      .setOrigin(0.5, 1);
  }

  // "fogSink" and a puff: out of reach for hideMs (out of sight once sunk).
  sinkIntoFog() {
    this.phase = 'sink';
    this.hideTime = this.def.blackbones.hideMs;
    this.playAction(this.fogSinkAnim, this.fogSinkMs);
    this.fogPuff();
    sfx.fogPuff();
  }

  // He steps out of the fog stepPx further on (never past the ship).
  stepOut() {
    this.hideTime = 0;
    this.x = Math.max(this.stopX, this.x - this.def.blackbones.stepPx);
    this.setFeetY(laneFeetY(this.x));
    this.body.setAlpha(1);
    this.phase = 'rise';
    this.playAction(this.fogRiseAnim, this.fogRiseMs);
    this.fogPuff();
    sfx.fogPuff();
  }

  // The flintlock goes off: a flash at the muzzle and a musket ball in the hull.
  fireFlintlock(ship) {
    const b = this.def.blackbones;
    const m = this.framePoint(this.muzzle);
    playFx(this.scene, b.flash, m.x, m.y).setOrigin(1, 0.5).setFlipX(true);
    ship.takeDamage(this.damage * b.shotMult, this);
    sfx.musket();
  }

  // The cutlass lands: the hull takes his damage, with a ghostly slash on it.
  slash(ship) {
    ship.takeDamage(this.damage, this);
    playFx(this.scene, this.def.blackbones.slashFx, LAYOUT.shipContactX - 8, Math.round(this.feetY - this.def.height / 2));
    sfx.slash();
  }

  // "summon" (twice through) with summon circles on the lane in front of
  // him (behind him where there's no room); his crew rises from them when
  // it's done (raiseCrew).
  summon() {
    const { scene } = this;
    const b = this.def.blackbones;
    this.crewCalls--;
    this.phase = 'summon';
    this.playAction(this.summonAnim, this.summonMs);
    const minX = LAYOUT.shipContactX + ENEMIES[b.raise].width / 2;
    this.raiseSpots = [];
    for (let i = 0; i < b.raiseCount; i++) {
      let x = this.x - b.raiseAhead - i * b.raiseSpread;
      if (x < minX) x = this.x + b.raiseAhead + i * b.raiseSpread;
      x = Math.min(x, LAYOUT.enemySpawnX);
      this.raiseSpots.push(x);
      this.circles.push(fxSprite(scene, b.circle, Math.round(x), Math.round(laneFeetY(x))).setDepth(DEPTH.enemy - 0.5));
    }
    sfx.cackle();
  }

  raiseCrew() {
    for (const c of this.circles) c.destroy();
    this.circles = [];
    for (const x of this.raiseSpots) this.spawnFrom(this.def.blackbones.raise, x, { rising: true });
    this.raiseSpots = [];
    this.phase = 'walk';
  }

  // A steam burst on the water where the Leviathan rises or sinks.
  steam() {
    const l = this.def.leviathan;
    playFx(this.scene, l.steam, this.x, LAYOUT.waterY - l.aboveWater, DEPTH.splash).setOrigin(0.5, 0);
  }

  rise(dt) {
    if (this.def.rises || this.def.queen) {
      // Rising where it stands; the Siren Queen then shows her banner.
      this.riseTime = Math.max(0, this.riseTime - dt);
      if (!this.isRising && this.def.queen) {
        if (this.idleAnim) this.body.play(this.idleAnim);
        this.scene.showBanner?.(this.def.banner, { color: UI.colors.warn });
        sfx.sirenSong();
      }
      return;
    }
    if (this.def.wyrm) {
      // Swooping in from the top-right, slowing as it lands.
      const w = this.def.wyrm;
      this.riseTime = Math.max(0, this.riseTime - dt);
      const t = 1 - (this.riseTime / w.flyInMs) ** 2;
      this.x = Phaser.Math.Linear(this.fromX, this.perchX, t);
      this.feetY = Phaser.Math.Linear(this.fromFeetY, this.perchFeetY, t);
      if (!this.isRising) {
        if (this.idleAnim) this.body.play(this.idleAnim);
        this.scene.showBanner?.(this.def.banner, { color: UI.colors.warn });
        sfx.roar();
      }
      return;
    }
    if (this.def.galleon) {
      this.riseTime = Math.max(0, this.riseTime - dt);
      return;
    }
    if (this.def.leviathan) {
      const l = this.def.leviathan;
      this.riseTime = Math.max(0, this.riseTime - dt);
      this.feetY = Phaser.Math.Linear(this.riseTop, this.frameTop, 1 - this.riseTime / l.riseMs) + this.frameH;
      this.steamTimer -= dt;
      if (this.isRising && this.steamTimer <= 0) {
        this.steamTimer += l.steamEvery;
        this.steam();
      }
      return;
    }
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
  // enemy's pace (slow, haste). An action (a throw, cast, roar or smash)
  // plays out; after one a walker stands on its first walk frame.
  animate(moving) {
    const anims = this.body.anims;
    if (!anims) return;
    // Rising (a raised Bone Deckhand, the Siren Queen): "rise" plays out.
    if (this.isRising && (this.def.rises || this.def.queen)) {
      anims.timeScale = 1;
      return;
    }
    // A walker with animSpeed walks its animation at its own speed's pace.
    const stride = moving && this.def.animSpeed ? this.walkingSpeed / this.def.animSpeed : 1;
    anims.timeScale = this.pace * this.rage * this.moveBoost * stride;
    // Fleeing (or charmed and going for an enemy behind it): facing the island.
    this.body.setFlipX?.(this.isAfraid || (this.isCharmed && this.charmFacing > 0));
    if (this.actionTime > 0) {
      if (this.isStunned) anims.pause();
      else if (anims.isPaused) anims.resume();
    } else if (this.walkAnim) {
      if (moving) this.body.play(this.walkAnim, true);
      else if (anims.currentAnim && anims.currentAnim.key !== this.walkAnim) this.rest();
      else anims.stop();
    } else if (this.isStunned) {
      anims.pause();
    } else if (anims.isPaused) {
      anims.resume();
    }
  }

  // How fast it walks right now: the Frost Giant's entrance through the pines
  // is faster than its walk.
  get walkingSpeed() { return this.def.giant && this.phase === 'enter' ? this.def.giant.entranceSpeed : this.speed; }

  // Standing still on the first frame of its walk.
  rest() {
    this.body.anims.stop();
    const first = this.scene.anims.get(this.walkAnim)?.frames[0];
    if (first) this.body.setFrame(first.textureFrame);
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

  // A hullShare enemy's one hit on the ship: a share of its max HP.
  hullHit(ship) {
    const { hullShare } = this.def;
    if (!hullShare) return this.damage;
    return ship.maxHp * (this.elite ? hullShare.elite : hullShare.normal) * this.hullShareMult;
  }

  // Keg Runner at the ship: it blows up on the hull (no gold).
  blowUpAtShip(ship) {
    this.alive = false;
    ship.takeDamage(this.hullHit(ship), this);
    this.explode();
    this.removeOverlays();
    this.body.destroy();
  }

  // A boarding boat at the ship: its crew board (its damage, once) and it's
  // gone, with no gold.
  board(ship) {
    this.alive = false;
    ship.takeDamage(this.hullHit(ship), this);
    this.removeOverlays();
    this.scene.tweens.add({ targets: this.body, alpha: 0, duration: 250, onComplete: () => this.body.destroy() });
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
  //   throughShield: passes through the shield (the Ghost Pirate's cutlass)
  //   ignoreArmor: armour doesn't reduce it (the Sharpshooter, the Cannoneer,
  //                Broadside, Whale Harpoon)
  //   source: who dealt it, for the Captain's Log (BattleStats.damageSource)
  // Armour takes its share off the hit itself; a curse's bonus damage gets
  // through it.
  takeDamage(amount, {
    flash = true, dot = false, lobbed = false, throughShield = false, ignoreArmor = false, source = null,
  } = {}) {
    if (!this.alive) return;
    let damage = amount;
    if (this.armor && !dot && !ignoreArmor) damage = Math.max(this.def.minDamage, amount * (1 - this.armor));
    const curse = this.isCursed ? amount * this.curseBonus : 0;
    damage += curse;
    if (flash) {
      this.setFlash(true);
      this.scene.time.delayedCall(FX.hitFlashMs, () => this.alive && this.setFlash(false));
    }
    // An Ice Witch's shield takes every hit but poison first.
    if (this.hasIceShield && !dot) {
      this.credit(source, Math.min(damage, this.iceShieldHp), damage, curse);
      this.iceShieldHp -= damage;
      if (!this.hasIceShield) this.breakIceShield();
      this.drawHpBar();
      return;
    }
    if (this.hasShield && !dot && !lobbed && !throughShield) {
      this.credit(source, Math.min(damage, this.shieldHp), damage, curse);
      this.shieldHp -= damage;
      if (!this.hasShield) this.breakShield();
      this.drawHpBar();
      return;
    }
    this.credit(source, Math.min(damage, this.hp), damage, curse);
    this.hp -= damage;
    if (this.hp <= 0) {
      this.die(source);
      return;
    }
    // The Frost Wyrm takes to the air once, at liftAt of its HP.
    const w = this.def.wyrm;
    if (w && !this.lifted && this.hp <= this.maxHp * w.liftAt) this.liftOff();
    // The Frost Giant gets angry once, at angry.at of its HP.
    const g = this.def.giant;
    if (g && !this.angry && !this.angerDue && this.hp <= this.maxHp * g.angry.at) this.angerDue = true;
    // Captain Blackbones raises his crew at each of raiseAt of his HP.
    const b = this.def.blackbones;
    while (b && this.raisesQueued < b.raiseAt.length && this.hp <= this.maxHp * b.raiseAt[this.raisesQueued]) {
      this.raisesQueued++;
      this.callCrew();
    }
    this.drawHpBar();
  }

  // Log what a hit of `damage` really dealt (dealt: without overkill) for
  // its source; the curse's share of it goes to whoever cursed the enemy.
  credit(source, dealt, damage, curse) {
    const { stats } = this.scene;
    if (!stats || !source || dealt <= 0) return;
    if (curse > 0 && this.curseSource) {
      const cursePart = dealt * curse / damage;
      stats.dealt(this.curseSource, cursePart);
      stats.dealt(source, dealt - cursePart);
    } else {
      stats.dealt(source, dealt);
    }
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

  // White while hit; otherwise its tint: an Elite's gold, an enraged boss's
  // red (or none).
  setFlash(on) {
    const tint = this.tint ?? (this.elite ? this.eliteTint : null);
    if (this.body.setTintFill) {
      if (on) this.body.setTintFill(FX.hitFlashColor);
      else if (tint != null) this.body.setTint(tint);
      else this.body.clearTint();
    } else {
      this.body.setFillStyle(on ? FX.hitFlashColor : tint ?? this.def.color);
    }
  }

  // The finale: when one boss falls the other enrages, tinted and attacking
  // mult x as fast.
  enrage(mult, tint) {
    this.rage = mult;
    this.tint = tint;
    if (this.alive) this.setFlash(false);
  }

  // source: the killing blow's (BattleStats), credited with the kill.
  // A lava bomb shot down bursts in the air, and isn't counted as a kill.
  die(source = null) {
    this.alive = false;
    this.killSource = source;
    if (source && !this.def.hazard) this.scene.stats?.kill(source);
    this.scene.events.emit('enemy-killed', this);
    this.removeOverlays();
    if (this.def.galleon || this.def.leviathan) {
      this.sink();
      return;
    }
    if (this.def.wyrm) {
      this.plunge();
      return;
    }
    if (this.def.giant) {
      this.shatter();
      return;
    }
    if (this.def.queen) {
      this.sinkQueen();
      return;
    }
    if (this.def.blackbones) {
      this.fallDead();
      return;
    }
    // A Bone Deckhand's grave, for a Lantern Ghoul to raise.
    if (this.def.rises) this.scene.mists?.bury(this);
    if (this.def.falls) {
      playFx(this.scene, this.def.falls.impact, this.x, this.y);
      this.body.destroy();
      return;
    }
    // The Abyss's Risen Dead current: it may rise again.
    this.scene.currents?.onDeath(this);
    this.scene.tweens.add({
      targets: this.body,
      alpha: 0,
      scaleY: this.body.scaleY * 0.2,
      duration: 200,
      onComplete: () => this.body.destroy(),
    });
    if (this.def.blast) this.blastEnemies();
    if (this.def.firePuddle) this.scene.volcano?.addPuddle(this.x, this.def.firePuddle);
    if (this.def.splits) this.split();
  }

  // The Ghost Galleon or the Molten Leviathan goes down: "sink" (the
  // Leviathan in a burst of steam), then it fades out.
  sink() {
    this.body.clearTint?.();
    if (this.def.leviathan) this.steam();
    const { sinkFadeMs } = this.def.galleon ?? this.def.leviathan;
    const fade = () => this.scene.tweens.add({
      targets: this.body, alpha: 0, duration: sinkFadeMs, onComplete: () => this.body.destroy(),
    });
    if (!this.sinkAnim) {
      fade();
      return;
    }
    this.body.play(this.sinkAnim);
    this.body.once(`animationcomplete-${this.sinkAnim}`, fade);
  }

  // The Frost Wyrm goes down: "fall" as it drops sinkPx into the sea over
  // fallMs, then a splash on the water where it went under.
  plunge() {
    const { scene } = this;
    const w = this.def.wyrm;
    this.body.clearTint?.();
    if (this.fallAnim) this.body.play(this.fallAnim);
    scene.tweens.add({
      targets: this.body,
      y: this.body.y + w.sinkPx,
      duration: w.fallMs,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.body.destroy();
        const s = SPRITES.krakenSplash;
        const splash = scene.add.sprite(Math.round(this.x), LAYOUT.waterY - w.aboveWater, s.key)
          .setOrigin(0.5, 0).setDepth(DEPTH.splash).play(SPLASH_ANIM);
        scene.time.delayedCall(2 * s.frames * 1000 / s.fps, () => splash.destroy());
        sfx.splash();
      },
    });
  }

  // The Frost Giant goes down: "shatter", then it's gone.
  shatter() {
    this.body.clearTint?.();
    const done = () => this.body.destroy();
    if (!this.shatterAnim) {
      this.scene.tweens.add({ targets: this.body, alpha: 0, duration: 400, onComplete: done });
      return;
    }
    this.body.play(this.shatterAnim);
    this.body.once(`animationcomplete-${this.shatterAnim}`, done);
    sfx.iceBreak();
  }

  // The Siren Queen goes down: "sink", with the Kraken's splash where she
  // goes under.
  sinkQueen() {
    const { scene } = this;
    this.body.clearTint?.();
    const s = SPRITES.krakenSplash;
    const splash = scene.add.sprite(Math.round(this.x), LAYOUT.waterY - this.def.queen.aboveWater, s.key)
      .setOrigin(0.5, 0).setDepth(DEPTH.splash).play(SPLASH_ANIM);
    scene.time.delayedCall(2 * s.frames * 1000 / s.fps, () => splash.destroy());
    sfx.splash();
    const done = () => this.body.destroy();
    if (!this.sinkAnim) {
      scene.tweens.add({ targets: this.body, alpha: 0, duration: 400, onComplete: done });
      return;
    }
    this.body.play(this.sinkAnim);
    this.body.once(`animationcomplete-${this.sinkAnim}`, done);
  }

  // Captain Blackbones goes down: "death", then his hat lies on the bones for
  // deathHoldMs before they fade.
  fallDead() {
    const b = this.def.blackbones;
    this.body.clearTint?.();
    this.body.setAlpha(1);
    const fade = () => this.scene.tweens.add({
      targets: this.body, alpha: 0, delay: b.deathHoldMs, duration: b.fadeMs, onComplete: () => this.body.destroy(),
    });
    if (!this.deathAnim) {
      fade();
      return;
    }
    this.body.play(this.deathAnim);
    this.body.once(`animationcomplete-${this.deathAnim}`, fade);
    sfx.cackle();
  }

  // A Keg Runner killed before reaching the ship: its keg goes off where it
  // fell, hitting every enemy on the lane within the blast radius (credited
  // to whoever killed it).
  blastEnemies() {
    this.explode();
    const { radius } = this.def.blast;
    for (const e of this.scene.enemies) {
      if (e === this || !e.canBeHit(false)) continue;
      if (Math.hypot(e.x - this.x, e.y - this.y) <= radius) e.takeDamage(this.blastDamage, { lobbed: true, source: this.killSource });
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
    this.warning?.destroy();
    this.warning = null;
    this.hpBar.destroy();
    for (const sprite of Object.values(this.statusSprites)) sprite.destroy();
    this.statusSprites = {};
    this.iceSprite?.destroy();
    this.iceSprite = null;
    this.aura?.destroy();
    this.aura = null;
    this.nameTag?.destroy();
    for (const c of this.circles ?? []) c.destroy();
    this.circles = [];
  }

  // --- Drawing ---

  // The HP bar, with a Barnacle Knight's shield bar just above it while it
  // lasts.
  drawHpBar() {
    // Out of sight (a Fog Wraith faded out, Captain Blackbones in the fog).
    this.nameTag?.setVisible(!this.vanished);
    if (this.vanished) {
      this.hpBar.clear();
      return;
    }
    const w = this.hpBarWidth;
    const x = Math.round(this.x - w / 2);
    const y = this.hpBarY;
    const pct = Phaser.Math.Clamp(this.hp / this.maxHp, 0, 1);
    this.hpBar.clear();
    this.hpBar.fillStyle(0x000000, 0.6).fillRect(x, y, w, 2);
    const barColor = this.isCursed ? CURSE_COLOR : this.isPoisoned ? POISON_COLOR : 0xe53935;
    this.hpBar.fillStyle(barColor).fillRect(x, y, Math.round(w * pct), 2);
    let barY = y;
    if (this.hasShield) {
      barY -= 2;
      const shieldPct = Phaser.Math.Clamp(this.shieldHp / this.shieldMax, 0, 1);
      this.hpBar.fillStyle(0x000000, 0.6).fillRect(x, barY, w, 2);
      this.hpBar.fillStyle(this.def.shield.barColor).fillRect(x, barY, Math.round(w * shieldPct), 2);
    }
    if (this.hasIceShield) {
      barY -= 2;
      const icePct = Phaser.Math.Clamp(this.iceShieldHp / this.iceShieldMax, 0, 1);
      this.hpBar.fillStyle(0x000000, 0.6).fillRect(x, barY, w, 2);
      this.hpBar.fillStyle(this.iceSpec.barColor).fillRect(x, barY, Math.round(w * icePct), 2);
    }
  }

  // Height of the shield bars over the HP bar.
  get shieldBarsHeight() { return (this.hasShield ? 2 : 0) + (this.hasIceShield ? 2 : 0); }

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
    // An Ice Witch's shield, looping over the enemy while it lasts.
    if (this.hasIceShield && !this.iceSprite) {
      this.iceSprite = fxSprite(this.scene, this.iceSpec.fx, 0, 0).setDepth(DEPTH.enemyOverlay - 0.1);
    } else if (!this.hasIceShield && this.iceSprite) {
      this.iceSprite.destroy();
      this.iceSprite = null;
    }
    for (const sprite of [...Object.values(this.statusSprites), this.iceSprite]) sprite?.setVisible(!this.vanished);
    const {
      slow, poison, stun, fear, curse, charm,
    } = this.statusSprites;
    const x = Math.round(this.x);
    for (const over of [slow, this.iceSprite]) {
      if (!over) continue;
      if (this.large) over.setOrigin(0.5).setPosition(x, Math.round(this.y));
      else over.setOrigin(0.5, 1).setPosition(x, Math.round(this.feetY));
    }
    poison?.setPosition(x, Math.round(this.y - this.def.height / 4));
    let above = this.hpBarY - (this.nameTag ? 10 : 0) - this.shieldBarsHeight - FX.statusGap;
    for (const mark of [stun, fear, curse, charm]) {
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
