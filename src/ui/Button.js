import Phaser from 'phaser';

export class Button extends Phaser.GameObjects.Container {
  constructor(scene, x, y, { width, height = 36, label, color = 0xc0392b, fontSize = '16px', onClick }) {
    super(scene, x, y);
    this.color = color;
    this.hoverColor = Phaser.Display.Color.ValueToColor(color).lighten(12).color;
    this.enabled = true;

    this.bg = scene.add.rectangle(0, 0, width, height, color).setStrokeStyle(2, 0x000000, 0.35);
    this.text = scene.add.text(0, 0, label, {
      fontFamily: 'sans-serif', fontSize, color: '#ffffff',
    }).setOrigin(0.5);
    this.add([this.bg, this.text]);

    this.bg.setInteractive({ useHandCursor: true });
    this.bg.on('pointerover', () => this.enabled && this.bg.setFillStyle(this.hoverColor));
    this.bg.on('pointerout', () => this.paint());
    this.bg.on('pointerdown', () => this.enabled && onClick());

    scene.add.existing(this);
  }

  setLabel(label) {
    this.text.setText(label);
    return this;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.bg.input.cursor = enabled ? 'pointer' : 'default';
    this.paint();
    return this;
  }

  paint() {
    this.bg.setFillStyle(this.enabled ? this.color : 0x6b6b6b);
    this.text.setAlpha(this.enabled ? 1 : 0.6);
  }
}
