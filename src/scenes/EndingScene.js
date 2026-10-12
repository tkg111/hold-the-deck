import Phaser from 'phaser';
import { DISPLAY, ENDING, ISLANDS, MAP } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, fillView } from '../display.js';
import { MAP_JSON_KEY, mapKey } from '../sprites.js';
import { Button } from '../ui/Button.js';
import { light, panel, subText, text } from '../ui/kit.js';

// The ending, after Fogbound Isle's finale (ENDING in config): the world map
// with every island and its flag, the whole route sailed (red dots), and the
// ship token sailing it from the first island to the last, then on off the
// map's right edge. Each flag bobs up as the ship passes it. The title and
// line fade in over a wood plate, and Continue closes it; the voyage carries
// on as before (every island stays open, in Endless). Launched with
// { progress, onClose }.
export class EndingScene extends Phaser.Scene {
  constructor() {
    super('EndingScene');
  }

  init({ progress, onClose }) {
    this.progress = progress;
    this.onClose = onClose;
  }

  create() {
    applyRenderScale(this);
    const json = this.cache.json.get(MAP_JSON_KEY);
    const spots = [...json.islands].sort((a, b) => a.order - b.order)
      .filter((spot) => ISLANDS.some((d) => d.id === spot.id));

    fillView(this, 0x0d1117, 1);
    this.add.image(0, 0, mapKey('bg')).setOrigin(0);
    // The whole route, sailed.
    const g = this.add.graphics().fillStyle(MAP.routeColor, 1);
    for (const [x, y] of json.route) g.fillRect(x - 1, y - 1, 2, 2);

    // The islands, with a flag on each one cleared.
    const [fx, fy] = json.flagOffset;
    this.flags = spots.map((spot) => {
      this.add.image(spot.x, spot.y, mapKey(spot.id));
      const def = ISLANDS.find((d) => d.id === spot.id);
      text(this, spot.x, spot.y + json.labelOffsetY, def.name.toUpperCase(), subText()).setOrigin(0.5, 0);
      const flag = this.progress.isIslandCleared(def.id)
        ? this.add.image(spot.x + fx, spot.y + fy, mapKey('flag')).setOrigin(0.5, 1)
        : null;
      return { spot, flag, passed: false };
    });

    this.sailShip(json);

    // The title and line, fading in.
    const cx = DISPLAY.width / 2;
    const title = text(this, cx, 22, ENDING.title, light({ font: 'big' })).setOrigin(0.5, 0);
    const line = text(this, cx, 22 + title.inkHeight + 6, ENDING.line, light()).setOrigin(0.5, 0);
    const w = Math.max(title.inkWidth, line.inkWidth) + 24;
    const h = title.inkHeight + line.inkHeight + 22;
    const plate = panel(this, cx - w / 2, 14, w, h, 'wood');
    this.children.bringToTop(title);
    this.children.bringToTop(line);
    const button = new Button(this, cx, DISPLAY.height - 24, {
      width: 96, height: 24, style: 'gold', label: 'CONTINUE', onClick: () => this.close(),
    });
    const shown = [plate, title, line, button];
    for (const o of shown) o.setAlpha(0);
    this.tweens.add({ targets: shown, alpha: 1, delay: ENDING.textAt, duration: ENDING.fadeMs });
    sfx.reveal('legendary', true);
  }

  // The ship token sails the route (MAP.shipTokenOffset off it, as it sits by
  // an island on the map) over sailMs, at an even speed, then on off the
  // map's right edge over exitMs.
  sailShip(json) {
    const key = mapKey('ship_token');
    const { shipToken } = json;
    if (!this.anims.exists(key)) {
      this.anims.create({
        key, frames: this.anims.generateFrameNumbers(key, { start: 0, end: shipToken.frames - 1 }),
        frameRate: shipToken.fps, repeat: -1,
      });
    }
    const { x: ox, y: oy } = MAP.shipTokenOffset;
    const points = json.route.map(([x, y]) => ({ x: x + ox, y: y + oy }));
    const lengths = [0];
    for (let i = 1; i < points.length; i++) {
      lengths.push(lengths[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y));
    }
    const total = lengths[lengths.length - 1];
    const token = this.add.sprite(points[0].x, points[0].y, key).play(key);
    // Along the route at distance d.
    const at = (d) => {
      let i = 1;
      while (i < points.length - 1 && lengths[i] < d) i++;
      const t = (d - lengths[i - 1]) / Math.max(1e-6, lengths[i] - lengths[i - 1]);
      return { x: Phaser.Math.Linear(points[i - 1].x, points[i].x, t), y: Phaser.Math.Linear(points[i - 1].y, points[i].y, t) };
    };
    this.tweens.addCounter({
      from: 0, to: total, duration: ENDING.sailMs, ease: 'Sine.easeInOut',
      onUpdate: (tw) => {
        const p = at(tw.getValue());
        token.setPosition(Math.round(p.x), Math.round(p.y));
        this.passFlags(token.x - ox);
      },
      onComplete: () => this.tweens.add({
        targets: token, x: DISPLAY.width + 24, duration: ENDING.exitMs, ease: 'Sine.easeIn',
        onComplete: () => token.setVisible(false),
      }),
    });
  }

  // Each flag bobs up as the ship sails by its island.
  passFlags(shipX) {
    for (const f of this.flags) {
      if (f.passed || !f.flag || shipX < f.spot.x) continue;
      f.passed = true;
      this.tweens.add({ targets: f.flag, y: f.flag.y - 4, duration: 180, yoyo: true, ease: 'Quad.easeOut' });
      sfx.click();
    }
  }

  close() {
    sfx.click();
    this.scene.stop();
    this.onClose?.();
  }
}
