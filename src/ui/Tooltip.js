import Phaser from 'phaser';
import { UI_KIT } from '../config.js';
import {
  dark, panel, subText, text,
} from './kit.js';

// A small parchment tooltip at (x, y) (its top-left), as wide as its
// longest line: lines of { text, small, sub } (the main font in dark ink, or
// the small one; sub: in the muted colour), top to bottom, wrapped at
// UI_KIT.tooltip.wrap.
export class Tooltip extends Phaser.GameObjects.Container {
  constructor(scene, x, y, lines) {
    super(scene, x, y);
    const { pad, gap, wrap } = UI_KIT.tooltip;
    let ty = pad;
    const texts = lines.map(({ text: str, small = false, sub = false }) => {
      const style = sub ? subText({ wrap }) : dark({ font: small ? 'small' : 'main', wrap });
      const t = text(scene, pad, ty, str, style).setOrigin(0);
      ty += t.inkHeight + gap;
      return t;
    });
    const w = Math.max(...texts.map((t) => t.inkWidth)) + 2 * pad;
    this.add([panel(scene, 0, 0, w, ty - gap + pad, 'parchment'), ...texts]);
    scene.add.existing(this);
  }
}
