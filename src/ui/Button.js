import Phaser from 'phaser';
import { UI_KIT } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import {
  hexColor, icon as makeIcon, nineSlice, tapArea, text, UI,
} from './kit.js';

// The bottom of each button image is its drop shadow; content centres on the
// face above it, and drops by this much while pressed.
const SHADOW = 3;
const PRESS_SHIFT = 1;
// Content keeps this far from the button's left and right edges; if it
// doesn't fit, the icon goes, then the main font steps down to small.
const FIT_PAD = 2;

// A 9-slice kit button centred on (x, y): 'gold' or 'wood' style, with the
// kit's normal / hover / pressed / disabled images. Content is an optional
// 12px icon and a label in the main, small or big font: light text on wood,
// dark on gold (the big font only comes light). Content too wide for the
// button is fitted (see FIT_PAD), so it never runs past the edges (an icon
// alone is never dropped). onClick fires on press, or on release with
// onRelease: true (browsers only allow fullscreen from a touch once it's
// released; buttons in a scrolling list wait for the release too, so a drag
// can cancel them: cancelPress()). A press plays ui_click, unless onClick
// plays a sound of its own (a buy, a close); tapping a disabled button plays
// ui_error.
export class Button extends Phaser.GameObjects.Container {
  constructor(scene, x, y, {
    width, height = 20, label = '', icon = null, style = 'wood', font = 'main', onClick, onRelease = false,
  }) {
    // Whole pixels, so the label lands on whole pixels too.
    super(scene, Math.round(x), Math.round(y));
    // (Not this.w / this.h: Phaser's setPosition(x, y, z, w) overwrites w.)
    this.btnWidth = width;
    this.btnHeight = height;
    this.style = style;
    this.font = font;
    this.labelColor = null;
    this.enabled = true;
    this.hovered = false;
    this.pressed = false;

    this.bg = nineSlice(scene, -Math.floor(width / 2), -Math.floor(height / 2), width, height, `btn_${style}_normal`);
    this.icon = icon ? makeIcon(scene, 0, 0, icon) : null;
    this.iconShown = !!icon;   // setIcon(null) hides it; fitting may too
    this.text = text(scene, 0, 0, label, { font, tone: this.tone });
    this.content = scene.add.container(0, 0, [this.icon, this.text].filter(Boolean));
    this.dot = scene.add.circle(width - Math.floor(width / 2) - 3, -Math.floor(height / 2) + 1, UI_KIT.dotRadius, hexColor(UI.colors.warn))
      .setStrokeStyle(1, hexColor(UI.colors.textOnParchment)).setVisible(false);
    this.add([this.bg, this.content, this.dot]);
    this.layout();

    // Every click is also announced on the scene ('button-pressed', button).
    const click = () => {
      scene.events.emit('button-pressed', this);
      const asked = sfx.requests;
      onClick();
      if (sfx.requests === asked) sfx.play('ui_click');
    };
    tapArea(this.bg, width, height, { useHandCursor: true });
    this.bg.on('pointerover', () => { this.hovered = true; this.paint(); });
    this.bg.on('pointerout', () => { this.hovered = false; this.pressed = false; this.deniedPress = false; this.paint(); });
    this.bg.on('pointerdown', () => {
      if (!this.enabled) {
        // (A release button waits: a drag may be scrolling its list.)
        if (onRelease) this.deniedPress = true;
        else sfx.play('ui_error');
        return;
      }
      this.pressed = true;
      this.paint();
      if (!onRelease) click();
    });
    this.bg.on('pointerup', () => {
      if (this.deniedPress) sfx.play('ui_error');
      this.deniedPress = false;
      const clicked = this.pressed && onRelease;
      this.pressed = false;
      this.paint();
      if (clicked) click();
    });

    scene.add.existing(this);
  }

  // Light text on wood (and whenever the label is coloured: only the light
  // fonts take a tint), dark on gold.
  get tone() { return this.style === 'gold' && !this.labelColor ? 'dark' : 'light'; }

  fontKey(font) {
    const key = `${font}_${this.tone}`;
    return this.scene.cache.bitmapFont.exists(key) ? key : `${font}_light`;
  }

  // Icon and label side by side, centred as a group on the button face,
  // fitted to the button's width.
  layout() {
    const gap = 2;
    const room = this.btnWidth - 2 * FIT_PAD;
    this.text.setFontKey(this.fontKey(this.font));
    const textW = () => (this.text.text ? this.text.inkWidth : 0);
    const iconW = () => (this.icon && this.icon.visible ? this.icon.width + (this.text.text ? gap : 0) : 0);
    if (this.icon) this.icon.setVisible(this.iconShown);
    if (this.text.text && iconW() + textW() > room && this.icon) this.icon.setVisible(false);
    if (textW() > room && this.font === 'main') this.text.setFontKey(this.fontKey('small'));
    const left = -Math.round((iconW() + textW()) / 2);
    if (this.icon && this.icon.visible) this.icon.setPosition(left + this.icon.width / 2, 0);
    this.text.setOrigin(0, 0.5).setPosition(left + iconW(), 0);
    // Whole pixels: the face is the button minus its shadow.
    const faceY = -Math.ceil(SHADOW / 2) + (this.pressed && this.enabled ? PRESS_SHIFT : 0);
    this.content.setY(faceY);
  }

  setLabel(label) {
    if (this.text.text !== label) {
      this.text.setText(label);
      this.layout();
    }
    return this;
  }

  // Tint the label (a CSS colour, e.g. a cost you can't afford), or null for
  // the style's own colour.
  setLabelColor(css) {
    if (this.labelColor === css) return this;
    this.labelColor = css;
    this.layout();
    this.text.setColor(css);
    return this;
  }

  // Change the icon, or hide it with null (only for buttons made with one).
  setIcon(name) {
    if (!this.icon) return this;
    const visible = name != null;
    if (visible) this.icon.setFrame(UI.icons.indexOf(name));
    if (visible !== this.iconShown) {
      this.iconShown = visible;
      this.layout();
    }
    return this;
  }

  // 'gold' or 'wood' (e.g. the selected tab is gold).
  setStyle(style) {
    if (this.style === style) return this;
    this.style = style;
    this.paint();
    this.text.setColor(this.labelColor);
    return this;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.bg.input.cursor = enabled ? 'pointer' : 'default';
    if (!enabled) this.pressed = false;
    this.paint();
    return this;
  }

  // Let go of a press without clicking (a drag started on the button).
  cancelPress() {
    this.deniedPress = false;
    if (!this.pressed) return this;
    this.pressed = false;
    this.paint();
    return this;
  }

  // Red dot in the top-right corner: something worth doing here. left: in
  // the top-left corner instead (where a count badge has the right).
  setDot(visible, { left = false } = {}) {
    this.dot.setVisible(visible).setX(left ? -Math.floor(this.btnWidth / 2) + 3 : this.btnWidth - Math.floor(this.btnWidth / 2) - 3);
    return this;
  }

  // Red badge with a count ("9+" past 9) inside the top-right corner, above
  // the label (hidden at 0): things waiting here, e.g. expeditions back.
  setBadge(count) {
    const label = count > 9 ? '9+' : `${count}`;
    if (!this.badge) {
      this.badgeBox = this.scene.add.graphics();
      this.badgeText = text(this.scene, 0, 0, '', { font: 'small', tone: 'dark' })
        .setTintFill(hexColor(UI_KIT.badge.textColor));
      this.badge = this.scene.add.container(0, 0, [this.badgeBox, this.badgeText]);
      this.add(this.badge);
    }
    if (this.badgeText.text !== label) {
      const { padX, padY, inset } = UI_KIT.badge;
      this.badgeText.setText(label);
      const w = this.badgeText.inkWidth + 2 * padX + 2;
      const h = this.badgeText.capHeight + 2 * padY + 2;
      const right = this.btnWidth - Math.floor(this.btnWidth / 2) - inset;
      const top = -Math.floor(this.btnHeight / 2) + inset;
      // A dark 1px outline round a red box, corners cut.
      this.badgeBox.clear()
        .fillStyle(hexColor(UI.colors.textOnParchment)).fillRect(right - w + 1, top, w - 2, h).fillRect(right - w, top + 1, w, h - 2)
        .fillStyle(hexColor(UI.colors.warn)).fillRect(right - w + 1, top + 1, w - 2, h - 2);
      this.badgeText.setOrigin(0, 0).setPosition(right - w + 1 + padX, top + 1 + padY);
    }
    this.badge.setVisible(count > 0);
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
