import Phaser from 'phaser';
import { ENEMIES, MERCHANTS } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { DEPTH } from '../entities/Ship.js';
import { FX_DEPTH } from '../fx.js';
import { LAYOUT } from '../layout.js';
import { MERCHANTS_JSON_KEY, merchantKey } from '../sprites.js';
import { formatNum } from '../ui/format.js';
import { light, text } from '../ui/kit.js';
import { materialInGame, materialOf, materialOfBoss } from './Parts.js';
import { tutorial } from '../tutorial/TutorialManager.js';

const between = ([min, max]) => min + Math.random() * (max - min);

// A merchant type (MERCHANTS.types id), by weight.
export function rollMerchant(random = Math.random) {
  const types = Object.entries(MERCHANTS.types);
  let roll = random() * types.reduce((s, [, t]) => s + t.weight, 0);
  for (const [id, t] of types) {
    if (roll < t.weight) return id;
    roll -= t.weight;
  }
  return types[0][0];
}

// A merchant's plunder: gold (its gold x G), Spice (one more at
// spiceChance), Bait, and at materialChance one boss material (of a boss
// already beaten, one that's in the game). { gold, spice, bait, material:
// { id, count } or null }.
export function rollPlunder(progress, typeId, G, random = Math.random) {
  const t = MERCHANTS.types[typeId];
  const spice = (t.spice ?? 0) + (t.spiceChance && random() < t.spiceChance ? 1 : 0);
  let material = null;
  if (t.materialChance && random() < t.materialChance) {
    const found = Object.keys(ENEMIES).filter((k) => ENEMIES[k].boss && progress.defeatCount(k) > 0)
      .map((k) => materialOfBoss(k)).filter((m) => m && materialInGame(m.id));
    if (found.length) material = { id: found[Math.floor(random() * found.length)].id, count: 1 };
  }
  return {
    gold: Math.round(G * (t.gold ?? 0)), spice, bait: t.bait ?? 0, material,
  };
}

// Passing merchant ships in battle (MERCHANTS; art from merchants.json). The
// battle's clock (game time of waves, carried over between them) brings
// one every so often; it sails left to right across the far sea, behind
// the ship and under everything but the backdrop, and fades before its
// battlefield's lane ends. Tapping it fires a cannonball from the bow: a
// hit pays its plunder (Progress.plunder, then onPlunder(reward)) and it
// limps off. The ship keeps
// sailing between waves (at 1x), but new ones only come during waves.
// forceNext: the next one's type (the tutorial's first is a Trade Cog).
// The scene hears 'merchant-tappable', 'merchant-plundered' and
// 'merchant-gone'; the ship is the tutorial's 'merchant' target.
export class Merchants {
  constructor(scene, { onPlunder }) {
    this.scene = scene;
    this.onPlunder = onPlunder;
    this.data = scene.cache.json.get(MERCHANTS_JSON_KEY);
    this.ship = null;
    this.forceNext = null;
    this.reset();
    tutorial.registerTarget('merchant', () => this.ship?.sprite);
  }

  // A new battle (the scene starting, or another battlefield): the clock
  // starts over and any ship on screen goes.
  reset() {
    this.clock = 0;
    this.due = between(MERCHANTS.firstAt);
    this.income = [];   // { at (clock ms), gold }
    this.remove();
  }

  // The battlefield's lane: { waterY, fadeX, fadeMs }.
  get lane() {
    return { ...MERCHANTS.lane, ...MERCHANTS.lanes[this.scene.battleIsland?.id] };
  }

  // Gold earned in battle, for G.
  noteGold(gold) {
    if (gold > 0) this.income.push({ at: this.clock, gold });
  }

  // G: goldSeconds of income at the gold per second of the last
  // goldWindowMs of battle, at least floorKills of the basic enemy's kills.
  get plunderBase() {
    const window = Math.max(1000, Math.min(MERCHANTS.goldWindowMs, this.clock));
    const gold = this.income.reduce((s, i) => s + i.gold, 0);
    const p = this.scene.progress;
    const kill = (ENEMIES[p.basicEnemy]?.gold ?? 0) * this.scene.waves.scaling.gold * p.goldMult;
    return Math.max(MERCHANTS.goldSeconds * gold / (window / 1000), MERCHANTS.floorKills * kill);
  }

  // dt ms of a wave (not a Boss Hunt) went by. canSail: nothing stops a new
  // ship (no boss alive, no overlay open). A boss arriving sends an
  // untouched ship away.
  tick(dt, { canSail, bossAlive }) {
    this.clock += dt;
    const from = this.clock - MERCHANTS.goldWindowMs;
    while (this.income.length && this.income[0].at < from) this.income.shift();
    const s = this.ship;
    if (s && bossAlive && !s.struck && !s.fading) this.fadeOut(this.lane.fadeMs);
    if (!s && canSail && this.clock >= this.due) this.sail();
  }

  sail() {
    const id = this.forceNext ?? rollMerchant();
    this.forceNext = null;
    const spec = this.data.ships[id];
    const [w, h] = spec.frame;
    const { waterY } = this.lane;
    const { scene } = this;
    const sprite = scene.add.sprite(-w, waterY - spec.waterline_y, merchantKey(id)).setOrigin(0)
      .setFlipX(true).setDepth(DEPTH.merchant).play(`${merchantKey(id)}_sail`);
    // The wake trails from the stern: the anchor mirrored with the ship.
    const [ax, ay] = spec.wake_anchor;
    const wake = scene.add.sprite(0, 0, merchantKey('wake')).setOrigin(1, 0.5).setFlipX(true)
      .setDepth(DEPTH.merchant - 0.01).play(`${merchantKey('wake')}_loop`);
    const pad = MERCHANTS.hitPad;
    sprite.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-pad, -pad, w + 2 * pad, h + 2 * pad),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    sprite.on('pointerdown', (_pointer, _x, _y, event) => {
      event?.stopPropagation?.();
      this.fire();
    });
    // Not while it's still behind our ship (see update).
    sprite.disableInteractive();
    this.ship = {
      id, spec, sprite, wake, w, h, wakeX: w - ax, wakeY: ay,
      x: -w, speed: MERCHANTS.types[id].speed, struck: false, fading: 0, fadeTotal: 0, tappable: false,
    };
    this.due = this.clock + between(MERCHANTS.every);
    this.place();
  }

  place() {
    const s = this.ship;
    s.sprite.setX(Math.round(s.x));
    s.wake.setPosition(Math.round(s.x) + s.wakeX, s.sprite.y + s.wakeY);
  }

  // ms of real time x the battle's speed (1x between waves).
  update(ms) {
    const s = this.ship;
    if (!s) return;
    s.x += s.speed * (s.struck ? MERCHANTS.slow : 1) * ms / 1000;
    this.place();
    if (!s.tappable && !s.struck && !s.fading && s.x + s.w / 2 >= MERCHANTS.tapFromX) {
      s.tappable = true;
      s.sprite.setInteractive();
      sfx.play('merchant_bell');
      this.scene.events.emit('merchant-tappable');
    }
    if (!s.fading && s.x + s.w >= this.lane.fadeX) this.fadeOut(this.lane.fadeMs);
    if (!s.fading) return;
    s.fading = Math.max(0, s.fading - ms);
    const alpha = s.fading / s.fadeTotal;
    s.sprite.setAlpha(alpha);
    s.wake.setAlpha(alpha);
    if (s.fading <= 0) this.remove();
  }

  // Start fading out over ms (it can't be tapped once it is), unless it's
  // already going faster.
  fadeOut(ms) {
    const s = this.ship;
    if (s.fading && s.fading <= ms) return;
    s.fading = ms;
    s.fadeTotal = ms;
    s.sprite.disableInteractive();
  }

  remove() {
    if (!this.ship) return;
    this.ship.sprite.destroy();
    this.ship.wake.destroy();
    this.ship = null;
    this.scene.events.emit('merchant-gone');
  }

  // Tapped: a cannonball from the bow in an arc to where the ship will be.
  // Tapping a struck ship does nothing.
  fire() {
    const s = this.ship;
    if (!s || s.struck || s.fading) return;
    s.struck = true;
    s.sprite.disableInteractive();
    const { shot } = MERCHANTS;
    const from = { x: LAYOUT.shipX + shot.from.x, y: LAYOUT.shipY + shot.from.y };
    const to = { x: s.x + s.w / 2 + s.speed * shot.ms / 1000, y: s.sprite.y + s.h / 2 };
    const { scene } = this;
    const ball = scene.add.image(from.x, from.y, merchantKey('cannonball')).setDepth(FX_DEPTH);
    sfx.play('cannon');
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: shot.ms,
      onUpdate: (tw) => {
        const t = tw.getValue();
        ball.setPosition(Math.round(from.x + (to.x - from.x) * t), Math.round(from.y + (to.y - from.y) * t - 4 * shot.arcHeight * t * (1 - t)));
      },
      onComplete: () => {
        ball.destroy();
        if (this.ship === s) this.hit(s, to);
      },
    });
  }

  // The ball lands: a puff, the struck frame, the ship slows and fades, and
  // a loot crate rises out of it with the plunder.
  hit(s, at) {
    const { scene } = this;
    sfx.play('hit_heavy');
    const puff = scene.add.sprite(Math.round(at.x), Math.round(at.y), merchantKey('hit_puff')).setDepth(FX_DEPTH);
    puff.play(`${merchantKey('hit_puff')}_pop`).once('animationcomplete', () => puff.destroy());
    s.sprite.stop().setFrame(s.spec.anims.struck[0]);
    this.fadeOut(MERCHANTS.fadeMs);
    const reward = rollPlunder(scene.progress, s.id, this.plunderBase);
    scene.progress.plunder(reward);
    this.showLoot(Math.round(s.x + s.w / 2), Math.round(s.sprite.y), reward);
    this.onPlunder(reward);
    scene.events.emit('merchant-plundered', reward);
  }

  // The loot crate pops up over the ship and rises crateRise px, the
  // plunder's lines rising above it (gold in gold, the rest in their
  // colours), then both fade.
  showLoot(x, y, reward) {
    const { scene } = this;
    const c = MERCHANTS.colors;
    const lines = [[`+${formatNum(reward.gold)} GOLD`, c.gold]];
    if (reward.spice) lines.push([`+${reward.spice} SPICE`, c.spice]);
    if (reward.bait) lines.push([`+${reward.bait} BAIT`, c.bait]);
    if (reward.material) lines.push([`+${reward.material.count} ${materialOf(reward.material.id).name.toUpperCase()}`, c.material]);
    const crate = scene.add.sprite(x, y, merchantKey('loot_crate')).setDepth(FX_DEPTH + 1).play(`${merchantKey('loot_crate')}_loop`);
    const labels = lines.map(([str, color], i) => text(scene, x, y - 12 - (lines.length - 1 - i) * 9, str, light({ font: 'small', color }))
      .setOrigin(0.5).setDepth(FX_DEPTH + 1));
    const starts = labels.map((t) => t.anchorY);
    sfx.play('plunder');
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: MERCHANTS.crateMs,
      onUpdate: (tw) => {
        const t = tw.getValue();
        const rise = Math.round(MERCHANTS.crateRise * t);
        const alpha = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
        crate.setY(y - rise).setAlpha(alpha);
        labels.forEach((l, i) => l.setPosition(x, starts[i] - rise).setAlpha(alpha));
      },
      onComplete: () => {
        crate.destroy();
        for (const l of labels) l.destroy();
      },
    });
  }
}
