import Phaser from 'phaser';
import { MIST } from './config.js';
import { DEPTH } from './entities/Ship.js';
import { LAYOUT } from './layout.js';
import { FOG_BANK_KEY, MIST_KEY } from './sprites.js';
import { frameTextures } from './storm.js';

// Over the enemies, crew, ship and flyers, but under status marks (stun
// stars, ice, charms) and enemy HP bars.
const FOG_DEPTH = DEPTH.slotMarkers - 0.25;

// Fogbound Isle's fog (MIST in config): the mist strip along the waterline
// while the ship is there (between waves too), and a fog bank over the whole
// view while the scene's Mists has one in (its level, which fades it in and
// out on the battle's time). The mist fades in and out over MIST.fadeMs when
// sailing there or away, and animates and drifts on real time, like the ash.
export class Fog {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.level = 0;          // 0 (none) .. 1 (the mist is there)
    this.target = 0;
    this.mistKeys = frameTextures(scene, MIST_KEY, MIST.frames);
    this.bankKeys = frameTextures(scene, FOG_BANK_KEY, MIST.bank.frames);
    this.mist = scene.add.tileSprite(0, LAYOUT.waterY - MIST.aboveWater, 1, MIST.frameHeight, this.mistKeys[0])
      .setOrigin(0).setDepth(FOG_DEPTH);
    this.bank = scene.add.tileSprite(0, 0, 1, 1, this.bankKeys[0]).setOrigin(0).setDepth(FOG_DEPTH + 0.01);
    this.layout(scene.view);
    this.apply();
  }

  // The ship is at this island (ISLANDS entry); instant: no fade (a new scene).
  setIsland(island, { instant = false } = {}) {
    this.target = island?.[MIST.flag] ? 1 : 0;
    if (instant) this.level = this.target;
    this.apply();
  }

  layout(view) {
    this.mist.setX(view.left).setSize(view.width, MIST.frameHeight);
    this.bank.setPosition(view.left, view.top).setSize(view.width, Math.ceil(view.height));
  }

  // How thick the fog bank is now (0 .. 1).
  get bankLevel() { return Math.min(this.level, this.scene.mists?.level ?? 0); }

  apply() {
    this.mist.setVisible(this.level > 0).setAlpha(this.level);
    const bank = this.bankLevel;
    this.bank.setVisible(bank > 0).setAlpha(bank);
  }

  // delta: real ms since the last frame.
  update(delta) {
    const step = delta / MIST.fadeMs;
    this.level = this.level < this.target ? Math.min(this.target, this.level + step) : Math.max(this.target, this.level - step);
    this.apply();
    if (this.level <= 0) return;
    this.time += delta;
    this.mist.setTexture(this.mistKeys[Math.floor(this.time * MIST.fps / 1000) % this.mistKeys.length]);
    // Scrolling left: the picture moves left as the tile offset grows.
    this.mist.tilePositionX = Phaser.Math.Wrap(this.mist.tilePositionX + MIST.drift * delta / 1000, 0, MIST.frameWidth);
    if (!this.bank.visible) return;
    const b = MIST.bank;
    this.bank.setTexture(this.bankKeys[Math.floor(this.time * b.fps / 1000) % this.bankKeys.length]);
    this.bank.tilePositionX = Phaser.Math.Wrap(this.bank.tilePositionX - b.drift.x * delta / 1000, 0, b.frameWidth);
    this.bank.tilePositionY = Phaser.Math.Wrap(this.bank.tilePositionY - b.drift.y * delta / 1000, 0, b.frameHeight);
  }
}
