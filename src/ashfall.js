import Phaser from 'phaser';
import { ASHFALL } from './config.js';
import { DEPTH } from './entities/Ship.js';
import { ASH_KEY } from './sprites.js';
import { frameTextures } from './storm.js';

// Ember Isle's falling ash (ASHFALL): ash_sheet.png's frames tiled over the
// whole view, under projectiles and the HUD, while the ship is at an island
// with `ash`. During the finale's eruption a red tint fades in over the
// battle and more layers of ash join, offset from the first and drifting
// down. Runs on real time, so x2 speed doesn't hurry it.
export class Ashfall {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;
    this.level = 0;          // 0 (none) .. 1 (ash falling)
    this.target = 0;
    this.eruption = 0;       // 0 .. 1 (erupting)
    this.eruptionTarget = 0;
    this.keys = frameTextures(scene, ASH_KEY, ASHFALL.frames);
    const e = ASHFALL.eruption;
    this.tint = scene.add.rectangle(0, 0, 1, 1, e.tint, 1).setOrigin(0).setDepth(DEPTH.storm - 0.6);
    this.layers = Array.from({ length: 1 + e.layers }, (_, i) => scene.add.tileSprite(0, 0, 1, 1, this.keys[0])
      .setOrigin(0).setDepth(DEPTH.storm - 0.5)
      // The extra layers start a fraction of a tile off the first.
      .setTilePosition(ASHFALL.frameWidth * i / (1 + e.layers), ASHFALL.frameHeight * i / (1 + e.layers)));
    this.layout(scene.view);
    this.apply();
  }

  // The ship is at this island (ISLANDS entry); instant: no fade (a new scene).
  setIsland(island, { instant = false } = {}) {
    this.target = island?.ash ? 1 : 0;
    if (instant) this.level = this.target;
    this.apply();
  }

  // The eruption starts (the finale) or dies down (the wave is over).
  erupt() { this.eruptionTarget = 1; }
  calm() { this.eruptionTarget = 0; }

  layout(view) {
    for (const o of [this.tint, ...this.layers]) o.setPosition(view.left, view.top).setSize(view.width, Math.ceil(view.height));
  }

  apply() {
    const e = ASHFALL.eruption;
    this.tint.setVisible(this.eruption > 0).setAlpha(e.tintAlpha * this.eruption);
    this.layers.forEach((layer, i) => {
      const alpha = i === 0 ? this.level : Math.min(this.level, this.eruption);
      layer.setVisible(alpha > 0).setAlpha(alpha);
    });
  }

  // delta: real ms since the last frame.
  update(delta) {
    const step = delta / ASHFALL.fadeMs;
    const toward = (v, t) => (v < t ? Math.min(t, v + step) : Math.max(t, v - step));
    this.level = toward(this.level, this.target);
    this.eruption = toward(this.eruption, this.eruptionTarget);
    this.apply();
    if (this.level <= 0) return;
    this.time += delta;
    const frame = Math.floor(this.time * ASHFALL.fps / 1000);
    this.layers.forEach((layer, i) => {
      layer.setTexture(this.keys[(frame + i) % this.keys.length]);
      // The eruption's layers drift down, each a little faster.
      if (i > 0) layer.tilePositionY = Phaser.Math.Wrap(layer.tilePositionY - ASHFALL.eruption.drift * i * delta / 1000, 0, ASHFALL.frameHeight);
    });
  }
}
