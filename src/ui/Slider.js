import Phaser from 'phaser';
import { Bar, dark, hexColor, text, UI } from './kit.js';

// Art pixels.
const KNOB_W = 5;
const KNOB_H = 12;
const HIT_PAD = 5;   // the drag area reaches this far above and below the bar

// A 0-100 slider: a Bar filled to the value with a knob on its edge and the
// value in a label to its right. Press or drag anywhere along it; onChange
// fires as the value moves, onCommit once it's let go.
export class Slider extends Phaser.GameObjects.Container {
  constructor(scene, x, y, {
    width, height = 8, value, onChange, onCommit,
  }) {
    super(scene, Math.round(x), Math.round(y));
    this.sliderWidth = width;
    this.bar = new Bar(scene, 0, -Math.floor(height / 2), width, height, UI.colors.progress);
    this.knob = scene.add.rectangle(0, 0, KNOB_W, KNOB_H, hexColor(UI.colors.text))
      .setStrokeStyle(1, hexColor(UI.colors.textOnParchment));
    this.label = text(scene, width + 6, 0, '', dark({ font: 'small' })).setOrigin(0, 0.5);
    const zone = scene.add.zone(-KNOB_W, -height / 2 - HIT_PAD, width + 2 * KNOB_W, height + 2 * HIT_PAD)
      .setOrigin(0).setInteractive({ useHandCursor: true });
    this.add([this.bar, this.knob, this.label, zone]);
    this.setValue(value);

    // From the pointer's x along the bar (in the world: the container may be
    // anywhere).
    const follow = (pointer) => {
      const left = this.getWorldTransformMatrix().tx;
      const v = Math.round(Phaser.Math.Clamp((pointer.worldX - left) / width, 0, 1) * 100);
      if (v === this.value) return;
      this.setValue(v);
      onChange(v);
    };
    let dragging = false;
    const move = (pointer) => { if (dragging) follow(pointer); };
    const up = () => {
      if (!dragging) return;
      dragging = false;
      onCommit?.(this.value);
    };
    zone.on('pointerdown', (pointer) => {
      dragging = true;
      follow(pointer);
    });
    scene.input.on('pointermove', move);
    scene.input.on('pointerup', up);
    this.once('destroy', () => {
      scene.input.off('pointermove', move);
      scene.input.off('pointerup', up);
    });
    scene.add.existing(this);
  }

  setValue(v) {
    this.value = v;
    this.bar.setValue(v / 100);
    this.knob.setPosition(Math.round(1 + v / 100 * (this.sliderWidth - 2)), 0);
    this.label.setText(`${v}`);
    return this;
  }
}
