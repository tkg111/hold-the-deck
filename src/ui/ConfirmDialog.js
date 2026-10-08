import Phaser from 'phaser';
import { DISPLAY } from '../config.js';
import { Button } from './Button.js';

const WIDTH = 400;
const HEIGHT = 180;

// Modal yes/no dialog. The full-screen backdrop blocks clicks underneath.
export class ConfirmDialog extends Phaser.GameObjects.Container {
  constructor(scene, { title, message, confirmLabel = 'Confirm', confirmColor = 0xc62828, onConfirm }) {
    super(scene, 0, 0);
    this.setDepth(50);

    const cx = DISPLAY.width / 2;
    const cy = DISPLAY.height / 2;
    this.add([
      scene.add.rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x000000, 0.65).setOrigin(0).setInteractive(),
      scene.add.rectangle(cx, cy, WIDTH, HEIGHT, 0x1b1f2a).setStrokeStyle(2, 0xffffff, 0.3),
      scene.add.text(cx, cy - 58, title, {
        fontFamily: 'sans-serif', fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5),
      scene.add.text(cx, cy - 14, message, {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#b0bec5', align: 'center',
        wordWrap: { width: WIDTH - 40 },
      }).setOrigin(0.5),
      new Button(scene, cx - 90, cy + 50, {
        width: 150, height: 38, label: 'Cancel', color: 0x546e7a,
        onClick: () => this.destroy(),
      }),
      new Button(scene, cx + 90, cy + 50, {
        width: 150, height: 38, label: confirmLabel, color: confirmColor,
        onClick: () => {
          this.destroy();
          onConfirm();
        },
      }),
    ]);
    scene.add.existing(this);
  }
}
