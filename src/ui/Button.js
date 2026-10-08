import Phaser from 'phaser';
import { UI_KIT } from '../config.js';
import { hexColor, icon as makeIcon, nineSlice, outlined, px, text, UI } from './kit.js';

// The bottom of each button image is its drop shadow; content centres on the
// face above it, and drops by this much while pressed.
const SHADOW = 3;
const PRESS_SHIFT = 1;

// A 9-slice kit button centred on (x, y): 'gold' or 'wood' style, with the
// kit's normal / hover / pressed / disabled images. Content is an optional
// 12px icon and a label in the main (or small) font. Sizes are layout units.
export class Button extends Phaser.GameObjects.Container {
  constructor(scene, x, y, {
    width, height = px(20), label = '', icon = null, style = 'wood', font = 'main', onClick,
  }) {
    super(scene, x, y);
    this.style = style;
    this.enabled = true;
    this.hovered = false;
    this.pressed = false;
    this.w = width;
    this.h = height;

    this.bg = nineSlice(scene, -width / 2, -height / 2, width, height, `btn_${style}_normal`);
    this.icon = icon ? makeIcon(scene, 0, 0, icon) : null;
    const textStyle = style === 'gold' ? { color: UI.colors.textOnGold } : outlined();
    this.text = text(scene, 0, 0, label, { font, ...textStyle }).setOrigin(0.5);
    this.content = scene.add.container(0, 0, [this.icon, this.text].filter(Boolean));
    this.dot = scene.add.circle(width / 2 - px(3), -height / 2 + px(1), px(UI_KIT.dotRadius), hexColor(UI.colors.warn))
      .setStrokeStyle(px(1), hexColor(UI.colors.textOnParchment)).setVisible(false);
    this.add([this.bg, this.content, this.dot]);
    this.layout();

    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on('pointerover', () => { this.hovered = true; this.paint(); });
    this.bg.on('pointerout', () => { this.hovered = false; this.pressed = false; this.paint(); });
    this.bg.on('pointerdown', () => {
      if (!this.enabled) return;
      this.pressed = true;
      this.paint();
      onClick();
    });
    this.bg.on('pointerup', () => { this.pressed = false; this.paint(); });

    scene.add.existing(this);
  }

  // Icon and label side by side, centred as a group on the button face.
  layout() {
    const gap = px(2);
    const hasIcon = this.icon && this.icon.visible;
    const iconW = hasIcon ? this.icon.displayWidth + (this.text.text ? gap : 0) : 0;
    const total = iconW + (this.text.text ? this.text.displayWidth : 0);
    const left = -total / 2;
    if (hasIcon) this.icon.setPosition(left + this.icon.displayWidth / 2, 0);
    this.text.setX(left + iconW + this.text.displayWidth / 2);
    const faceY = -px(SHADOW) / 2 + (this.pressed && this.enabled ? px(PRESS_SHIFT) : 0);
    this.content.setY(faceY);
  }

  setLabel(label) {
    if (this.text.text !== label) {
      this.text.setText(label);
      this.layout();
    }
    return this;
  }

  // Change the icon, or hide it with null (only for buttons made with one).
  setIcon(name) {
    if (!this.icon) return this;
    const visible = name != null;
    if (visible) this.icon.setFrame(UI.icons.indexOf(name));
    if (visible !== this.icon.visible) {
      this.icon.setVisible(visible);
      this.layout();
    }
    return this;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.bg.input.cursor = enabled ? 'pointer' : 'default';
    if (!enabled) this.pressed = false;
    this.paint();
    return this;
  }

  // Red dot in the top-right corner: something worth doing here.
  setDot(visible) {
    this.dot.setVisible(visible);
    return this;
  }

  paint() {
    let state = 'normal';
    if (!this.enabled) state = 'disabled';
    else if (this.pressed) state = 'pressed';
    else if (this.hovered) state = 'hover';
    this.bg.setTexture(`ui_btn_${this.style}_${state}`);
    this.bg.updateUVs();
    this.layout();
  }
}
