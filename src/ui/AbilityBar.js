import Phaser from 'phaser';
import { ABILITY_BAR, SPRITES } from '../config.js';
import { Button } from './Button.js';
import { face, light, text } from './kit.js';

const KEYS = 6;  // keys 1-6 trigger the first six buttons

// Pixels of the face box, darkest-last-to-clear first: sorted by angle
// clockwise from 12 o'clock, descending, so the pixels still on cooldown for a
// remaining fraction r are the first (count with angle >= 1 - r).
function sweepPixels(width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const pixels = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = Math.atan2(x + 0.5 - cx, -(y + 0.5 - cy));
      pixels.push({ x, y, frac: (a < 0 ? a + Math.PI * 2 : a) / (Math.PI * 2) });
    }
  }
  return pixels.sort((p, q) => q.frac - p.frac);
}

// Bottom-centre bar during waves: a wood portrait button per crewmate on the
// ship (their face, a cooldown sweep with seconds left, a pulsing glow when
// ready, its key number), then an Auto toggle.
export class AbilityBar extends Phaser.GameObjects.Container {
  constructor(scene, { onTrigger, onToggleAuto }) {
    super(scene, 0, 0);
    this.onTrigger = onTrigger;
    const { width, height } = SPRITES.face;
    this.faceW = width;
    this.faceH = height;
    this.pixels = sweepPixels(width, height);
    this.entries = [];
    this.autoButton = new Button(scene, 0, 0, {
      width: ABILITY_BAR.autoWidth, height: ABILITY_BAR.buttonSize, label: 'AUTO', onClick: onToggleAuto,
    });
    this.autoGlow = this.outline(ABILITY_BAR.autoWidth, ABILITY_BAR.buttonSize);
    this.add([this.autoGlow, this.autoButton]);
    this.setDepth(20);
    scene.add.existing(this);
  }

  // A gold frame just outside a w x h button centred on (0, 0).
  outline(w, h) {
    const t = ABILITY_BAR.glowWidth;
    const g = this.scene.add.graphics().fillStyle(ABILITY_BAR.glowColor);
    const left = -Math.floor(w / 2) - t;
    const top = -Math.floor(h / 2) - t;
    g.fillRect(left, top, w + 2 * t, t).fillRect(left, top + h + t, w + 2 * t, t);
    g.fillRect(left, top, t, h + 2 * t).fillRect(left + w + t, top, t, h + 2 * t);
    return g.setVisible(false);
  }

  // ids: hero ids on the ship, in slot order.
  setCrew(ids) {
    for (const e of this.entries) {
      e.button.destroy();
      e.glow.destroy();
      e.key.destroy();
    }
    const size = ABILITY_BAR.buttonSize;
    this.entries = ids.map((id, i) => {
      const button = new Button(this.scene, 0, 0, {
        width: size, height: size, label: '', onClick: () => this.onTrigger(i),
      });
      // Face, sweep and seconds sit in the button's content, so they drop
      // with it when pressed.
      const left = -this.faceW / 2;
      const top = -this.faceH / 2;
      const sweep = this.scene.add.graphics({ x: left, y: top });
      const secs = text(this.scene, 0, 0, '', light({ font: 'small' })).setOrigin(0.5);
      button.content.add([face(this.scene, 0, 0, id), sweep, secs]);
      const glow = this.outline(size, size);
      const key = i < KEYS
        ? text(this.scene, 0, 0, `${i + 1}`, light({ font: 'small' })).setOrigin(0, 0)
        : null;
      this.add([glow, button, key].filter(Boolean));
      return { button, sweep, secs, glow, key: key ?? { destroy() {}, setPosition() {} }, dark: -1, shown: '' };
    });
    if (this.view) this.layout(this.view);
  }

  // Centred along the bottom of the view.
  layout(view) {
    this.view = view;
    const { buttonSize: size, gap, autoGap, autoWidth, bottomMargin } = ABILITY_BAR;
    const n = this.entries.length;
    const total = n * size + Math.max(0, n - 1) * gap + autoGap + autoWidth;
    const left = Math.round(view.centerX - total / 2);
    const y = Math.round(view.bottom) - bottomMargin - Math.ceil(size / 2);
    this.setPosition(0, 0);
    this.entries.forEach((e, i) => {
      const x = left + i * (size + gap) + Math.floor(size / 2);
      e.button.setPosition(x, y);
      e.glow.setPosition(x, y);
      e.key.setPosition(x - Math.floor(size / 2) + 3, y - Math.floor(size / 2) + 3);
    });
    const ax = left + n * (size + gap) - (n ? gap : 0) + autoGap + Math.floor(autoWidth / 2);
    this.autoButton.setPosition(ax, y);
    this.autoGlow.setPosition(ax, y);
  }

  // Key press: show the button pressed for a moment.
  press(i) {
    const e = this.entries[i];
    if (!e) return;
    e.button.pressed = true;
    e.button.paint();
    this.scene.time.delayedCall(90, () => {
      e.button.pressed = false;
      e.button.paint();
    });
  }

  // Every frame during a wave.
  refresh(abilities, auto) {
    const pulse = 0.5 + 0.5 * Math.sin(this.scene.time.now / ABILITY_BAR.glowPulseMs * Math.PI);
    this.entries.forEach((e, i) => {
      const r = abilities.remaining(i);
      const dark = r <= 0 ? 0 : this.pixels.filter((p) => p.frac >= 1 - r).length;
      if (dark !== e.dark) {
        e.dark = dark;
        e.sweep.clear().fillStyle(ABILITY_BAR.sweepColor, ABILITY_BAR.sweepAlpha);
        for (let k = 0; k < dark; k++) e.sweep.fillRect(this.pixels[k].x, this.pixels[k].y, 1, 1);
      }
      const secs = r > 0 ? `${Math.ceil(abilities.slots[i].cooldown / 1000)}` : '';
      if (secs !== e.shown) {
        e.shown = secs;
        e.secs.setText(secs);
      }
      e.glow.setVisible(r <= 0).setAlpha(0.35 + 0.65 * pulse);
    });
    this.autoGlow.setVisible(auto);
    const color = auto ? ABILITY_BAR.autoOnColor : null;
    if (this.autoButton.text.color !== color) this.autoButton.text.setColor(color);
  }
}
