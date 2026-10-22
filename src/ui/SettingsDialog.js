import Phaser from 'phaser';
import { DISPLAY } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { fillView } from '../display.js';
import { Button } from './Button.js';
import { dark, light, panel, text } from './kit.js';

// Art pixels.
const WIDTH = 200;
const HEIGHT = 118;
const PLATE_W = 120;
const PLATE_H = 20;
const ROW_H = 24;

// The settings (the battle's gear button), modal like ConfirmDialog:
// Captain's tips on / off, Replay tutorial (closes the settings; the
// Captain starts over) and Reset progress (closes them for its own
// confirmation), and Close.
export class SettingsDialog extends Phaser.GameObjects.Container {
  constructor(scene, { tipsOn, onTips, onReplay, onReset }) {
    super(scene, 0, 0);
    const backdrop = fillView(scene, 0x000000, 0.65).setDepth(50);
    this.setDepth(50);
    const center = (view) => this.setPosition(
      Math.round(view.centerX - DISPLAY.width / 2), Math.round(view.centerY - DISPLAY.height / 2),
    );
    center(scene.view);
    scene.events.on('view-resize', center);
    scene.modalOpen = (scene.modalOpen ?? 0) + 1;
    this.once('destroy', () => {
      scene.modalOpen--;
      scene.events.off('view-resize', center);
      backdrop.destroy();
    });

    const cx = DISPLAY.width / 2;
    const top = DISPLAY.height / 2 - HEIGHT / 2;
    const left = cx - WIDTH / 2;
    const rowY = (i) => top + 22 + i * ROW_H;
    const close = (then) => {
      this.destroy();
      then?.();
    };
    this.tipsOn = tipsOn;
    const tips = new Button(scene, left + WIDTH - 40, rowY(0), {
      width: 56, height: 18, font: 'small', label: '', onClick: () => {
        sfx.click();
        this.tipsOn = !this.tipsOn;
        paintTips();
        onTips(this.tipsOn);
      },
    });
    const paintTips = () => tips.setLabel(this.tipsOn ? 'ON' : 'OFF').setStyle(this.tipsOn ? 'gold' : 'wood');
    paintTips();
    this.add([
      panel(scene, left, top, WIDTH, HEIGHT, 'parchment'),
      panel(scene, cx - PLATE_W / 2, top - 8, PLATE_W, PLATE_H, 'wood'),
      text(scene, cx, top - 8 + PLATE_H / 2, 'Settings', light()).setOrigin(0.5),
      text(scene, left + 12, rowY(0), "Captain's tips", dark()).setOrigin(0, 0.5),
      tips,
      new Button(scene, cx, rowY(1), {
        width: WIDTH - 24, height: 18, label: 'Replay tutorial', onClick: () => close(onReplay),
      }),
      new Button(scene, cx, rowY(2), {
        width: WIDTH - 24, height: 18, label: 'Reset progress', onClick: () => close(onReset),
      }),
      new Button(scene, cx, rowY(3) + 4, {
        width: 80, height: 20, style: 'gold', label: 'Close', onClick: () => close(),
      }),
    ]);
    scene.add.existing(this);
  }
}
