import Phaser from 'phaser';
import { DEPTH } from './entities/Ship.js';
import { weatherKey } from './sprites.js';
import { frameTextures } from './storm.js';

// Weather over an island (ASHFALL, SNOWFALL in config): a sheet's frames
// tiled over the whole view, under projectiles and the HUD, while the ship is
// at an island with the spec's flag (Ember Isle's ash, Frostbite Reef's
// snow). When the weather turns heavy (the eruption, a blizzard) a tint fades
// in over the battle and more layers join, of the same sheet or the heavy
// one's own, offset from the first and drifting. Runs on real time, so x2
// speed doesn't hurry it.
export class Weather {
  constructor(scene, spec) {
    this.scene = scene;
    this.spec = spec;
    this.time = 0;
    this.level = 0;          // 0 (none) .. 1 (falling)
    this.target = 0;
    this.heavy = 0;          // 0 .. 1 (heavy weather)
    this.heavyTarget = 0;
    const h = spec.heavy;
    this.keys = frameTextures(scene, weatherKey(spec), spec.frames);
    this.heavyKeys = h.file ? frameTextures(scene, weatherKey(spec, true), h.frames) : this.keys;
    this.heavyFps = h.fps ?? spec.fps;
    this.tint = scene.add.rectangle(0, 0, 1, 1, h.tint, 1).setOrigin(0).setDepth(DEPTH.storm - 0.6);
    this.layers = Array.from({ length: 1 + h.layers }, (_, i) => scene.add.tileSprite(0, 0, 1, 1, (i ? this.heavyKeys : this.keys)[0])
      .setOrigin(0).setDepth(DEPTH.storm - 0.5 + i * 0.01)
      // The heavy layers start a fraction of a tile off the first.
      .setTilePosition(spec.frameWidth * i / (1 + h.layers), spec.frameHeight * i / (1 + h.layers)));
    this.layout(scene.view);
    this.apply();
  }

  // The ship is at this island (ISLANDS entry); instant: no fade (a new scene).
  setIsland(island, { instant = false } = {}) {
    this.target = island?.[this.spec.flag] ? 1 : 0;
    if (instant) this.level = this.target;
    this.apply();
  }

  // The weather turns heavy (the eruption, a blizzard) or calms down.
  worsen() { this.heavyTarget = 1; }
  calm() { this.heavyTarget = 0; }

  layout(view) {
    for (const o of [this.tint, ...this.layers]) o.setPosition(view.left, view.top).setSize(view.width, Math.ceil(view.height));
  }

  apply() {
    const h = this.spec.heavy;
    const heavy = Math.min(this.level, this.heavy);
    this.tint.setVisible(heavy > 0).setAlpha(h.tintAlpha * heavy);
    this.layers.forEach((layer, i) => {
      const alpha = i === 0 ? this.level : heavy;
      layer.setVisible(alpha > 0).setAlpha(alpha);
    });
  }

  // delta: real ms since the last frame.
  update(delta) {
    const { spec } = this;
    const toward = (v, t, ms) => {
      const step = delta / ms;
      return v < t ? Math.min(t, v + step) : Math.max(t, v - step);
    };
    this.level = toward(this.level, this.target, spec.fadeMs);
    this.heavy = toward(this.heavy, this.heavyTarget, spec.heavy.fadeMs);
    this.apply();
    if (this.level <= 0) return;
    this.time += delta;
    const frame = Math.floor(this.time * spec.fps / 1000);
    const heavyFrame = Math.floor(this.time * this.heavyFps / 1000);
    const { drift } = spec.heavy;
    this.layers.forEach((layer, i) => {
      if (i === 0) {
        layer.setTexture(this.keys[frame % this.keys.length]);
        return;
      }
      layer.setTexture(this.heavyKeys[(heavyFrame + i) % this.heavyKeys.length]);
      // The heavy layers drift, each a little faster.
      layer.tilePositionX = Phaser.Math.Wrap(layer.tilePositionX - drift.x * i * delta / 1000, 0, spec.frameWidth);
      layer.tilePositionY = Phaser.Math.Wrap(layer.tilePositionY - drift.y * i * delta / 1000, 0, spec.frameHeight);
    });
  }
}
