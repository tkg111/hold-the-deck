import Phaser from 'phaser';
import { STORM } from './config.js';
import { sfx } from './audio/Sfx.js';
import { DEPTH } from './entities/Ship.js';
import { STORM_JSON_KEY, stormKey } from './sprites.js';

// The finale's storm, from public/sprites/storm/storm.json: a dark tint over
// the battle, storm clouds along the top of the view, rain tiled over the
// whole view, and now and then a lightning bolt at a random x in the sky with
// a short white flash. Everything sits over the scene but under the HUD and
// fades in and out (start() / stop()). It runs on real time, so x2 speed
// doesn't hurry it.

const RAIN_FRAME = (i) => stormKey(`rain_${i}`);

// Each rain frame as a texture of its own, so a TileSprite can tile it (a
// TileSprite always tiles a whole texture).
function rainFrames(scene, spec) {
  const keys = [];
  const sheet = scene.textures.get(stormKey('rain'));
  for (let i = 0; i < spec.rain.frames; i++) {
    const key = RAIN_FRAME(i);
    keys.push(key);
    if (scene.textures.exists(key)) continue;
    const frame = sheet.get(i);
    const canvas = scene.textures.createCanvas(key, spec.rain.frameWidth, spec.rain.frameHeight);
    canvas.context.drawImage(sheet.getSourceImage(), frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
      0, 0, frame.cutWidth, frame.cutHeight);
    canvas.refresh();
  }
  return keys;
}

export class Storm {
  constructor(scene) {
    this.scene = scene;
    this.spec = scene.cache.json.get(STORM_JSON_KEY);
    this.level = 0;      // 0 (clear) .. 1 (full storm)
    this.target = 0;
    this.time = 0;
    this.nextStrike = 0;
    this.bolts = [];
    const { spec } = this;
    const [r, g, b, a] = spec.tint;
    this.tintAlpha = a / 255;
    const depth = DEPTH.storm;
    this.tint = scene.add.rectangle(0, 0, 1, 1, Phaser.Display.Color.GetColor(r, g, b), 1).setOrigin(0).setDepth(depth);
    const clouds = scene.textures.get(stormKey('clouds')).getSourceImage();
    this.clouds = scene.add.tileSprite(0, 0, 1, clouds.height, stormKey('clouds')).setOrigin(0).setDepth(depth + 0.1);
    this.cloudsY = spec.clouds.y;
    this.rainKeys = rainFrames(scene, spec);
    this.rain = scene.add.tileSprite(0, 0, 1, 1, this.rainKeys[0]).setOrigin(0).setDepth(depth + 0.3);
    this.flash = scene.add.rectangle(0, 0, 1, 1, 0xffffff, 0).setOrigin(0).setDepth(depth + 0.4);
    this.flashTime = 0;
    if (!scene.anims.exists(stormKey('lightning'))) {
      scene.anims.create({
        key: stormKey('lightning'),
        frames: scene.anims.generateFrameNumbers(stormKey('lightning'), { start: 0, end: spec.lightning.frames - 1 }),
        frameRate: spec.lightning.fps,
        repeat: 0,
      });
    }
    this.layout(scene.view);
    this.apply();
  }

  get active() { return this.target > 0; }

  // Cover the view: the tint, rain and flash all of it, the clouds along its
  // top (at storm.json's y, or the view's top if that's higher up).
  layout(view) {
    for (const o of [this.tint, this.rain, this.flash]) o.setPosition(view.left, view.top).setSize(view.width, Math.ceil(view.height));
    this.clouds.setPosition(view.left, Math.min(view.top, this.cloudsY)).setSize(view.width, this.clouds.height);
    this.view = view;
  }

  start() {
    this.target = 1;
    this.nextStrike = Phaser.Math.Between(STORM.lightningMin, STORM.lightningMax) / 2;
  }

  stop() { this.target = 0; }

  apply() {
    const on = this.level > 0;
    this.tint.setVisible(on).setAlpha(this.tintAlpha * this.level);
    this.clouds.setVisible(on).setAlpha(this.level);
    this.rain.setVisible(on).setAlpha(this.level);
  }

  // delta: real ms since the last frame.
  update(delta) {
    const step = delta / STORM.fadeMs;
    this.level = this.level < this.target ? Math.min(this.target, this.level + step) : Math.max(this.target, this.level - step);
    this.apply();
    if (this.level > 0) {
      this.time += delta;
      const { rain } = this.spec;
      this.rain.setTexture(this.rainKeys[Math.floor(this.time * rain.fps / 1000) % this.rainKeys.length]);
    }
    if (this.active) {
      this.nextStrike -= delta;
      if (this.nextStrike <= 0) {
        this.nextStrike = Phaser.Math.Between(STORM.lightningMin, STORM.lightningMax);
        this.strike();
      }
    }
    this.flashTime = Math.max(0, this.flashTime - delta);
    this.flash.setAlpha(STORM.flashAlpha * this.flashTime / STORM.flashMs);
  }

  // A bolt from the clouds at a random x, with a white flash and thunder.
  strike() {
    const { scene, view } = this;
    const { frameWidth } = this.spec.lightning;
    const x = Phaser.Math.Between(view.left + frameWidth, view.right - frameWidth);
    const bolt = scene.add.sprite(x, Math.max(view.top, this.cloudsY) + 20, stormKey('lightning'))
      .setOrigin(0.5, 0).setDepth(DEPTH.storm + 0.2).play(stormKey('lightning'));
    bolt.once('animationcomplete', () => bolt.destroy());
    this.flashTime = STORM.flashMs;
    sfx.thunder();
  }

  // Wave over (or scene closing): clear at once.
  clear() {
    this.target = 0;
    this.level = 0;
    this.apply();
  }
}
