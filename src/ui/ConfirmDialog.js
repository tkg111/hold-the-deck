import Phaser from 'phaser';
import { DISPLAY } from '../config.js';
import { Button } from './Button.js';
import { onParchment, outlined, panel, px, text } from './kit.js';

// Art pixels.
const WIDTH = 200;
const HEIGHT = 84;
const PLATE_W = 150;
const PLATE_H = 20;

// Modal yes/no dialog: parchment under a wood title plate. The full-screen
// backdrop blocks clicks underneath.
export class ConfirmDialog extends Phaser.GameObjects.Container {
  constructor(scene, { title, message, confirmLabel = 'Confirm', onConfirm }) {
    super(scene, 0, 0);
    this.setDepth(50);

    const cx = DISPLAY.width / 2;
    const cy = DISPLAY.height / 2;
    const top = cy - px(HEIGHT / 2);
    this.add([
      scene.add.rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x000000, 0.65).setOrigin(0).setInteractive(),
      panel(scene, cx - px(WIDTH / 2), top, px(WIDTH), px(HEIGHT), 'parchment'),
      panel(scene, cx - px(PLATE_W / 2), top - px(8), px(PLATE_W), px(PLATE_H), 'wood'),
      text(scene, cx, top - px(8) + px(PLATE_H / 2), title, outlined()).setOrigin(0.5),
      text(scene, cx, top + px(30), message, onParchment({ font: 'small', align: 'center', wrap: px(WIDTH - 24) }))
        .setOrigin(0.5),
      new Button(scene, cx - px(46), top + px(HEIGHT - 18), {
        width: px(80), height: px(20), label: 'Cancel',
        onClick: () => this.destroy(),
      }),
      new Button(scene, cx + px(46), top + px(HEIGHT - 18), {
        width: px(80), height: px(20), label: confirmLabel, style: 'gold',
        onClick: () => {
          this.destroy();
          onConfirm();
        },
      }),
    ]);
    scene.add.existing(this);
  }
}
