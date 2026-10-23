import Phaser from 'phaser';
import { DISPLAY } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { fillView } from '../display.js';
import { Button } from './Button.js';
import { dark, light, panel, text } from './kit.js';
import { Slider } from './Slider.js';

// Art pixels.
const WIDTH = 200;
const HEIGHT = 190;
const PLATE_W = 120;
const PLATE_H = 20;
const ROW_H = 24;
const SLIDER_W = 76;

// The settings (the battle's gear button), modal like ConfirmDialog:
// Music and Sound effects volumes (sliders, 0-100) and Sound on / off
// (mute: both off, the sliders kept), Captain's tips on / off, Replay
// tutorial (closes the settings; the Captain starts over) and Reset
// progress (closes them for its own confirmation), and Close.
// onAudio({ music, sfx, muted }, done) fires as the sound settings change;
// done once a slider is let go (or the mute toggled): time to save.
export class SettingsDialog extends Phaser.GameObjects.Container {
  constructor(scene, {
    audio, onAudio, tipsOn, onTips, onReplay, onReset,
  }) {
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
    const label = (i, str) => text(scene, left + 12, rowY(i), str, dark()).setOrigin(0, 0.5);

    this.audio = { ...audio };
    const change = (key, done) => (v) => {
      this.audio[key] = v;
      onAudio({ ...this.audio }, done);
    };
    const slider = (i, key) => new Slider(scene, left + WIDTH - 24 - SLIDER_W, rowY(i), {
      width: SLIDER_W, value: this.audio[key], onChange: change(key, false), onCommit: change(key, true),
    });
    const mute = new Button(scene, left + WIDTH - 40, rowY(2), {
      width: 56, height: 18, font: 'small', icon: 'sound_on', label: '', onClick: () => {
        this.audio.muted = !this.audio.muted;
        paintMute();
        onAudio({ ...this.audio }, true);
        sfx.play('ui_click');
      },
    });
    const paintMute = () => mute.setIcon(this.audio.muted ? 'sound_off' : 'sound_on')
      .setLabel(this.audio.muted ? 'OFF' : 'ON').setStyle(this.audio.muted ? 'wood' : 'gold');
    paintMute();

    this.tipsOn = tipsOn;
    const tips = new Button(scene, left + WIDTH - 40, rowY(3), {
      width: 56, height: 18, font: 'small', label: '', onClick: () => {
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
      label(0, 'Music'),
      slider(0, 'music'),
      label(1, 'Sound effects'),
      slider(1, 'sfx'),
      label(2, 'Sound'),
      mute,
      label(3, "Captain's tips"),
      tips,
      new Button(scene, cx, rowY(4), {
        width: WIDTH - 24, height: 18, label: 'Replay tutorial', onClick: () => close(onReplay),
      }),
      new Button(scene, cx, rowY(5), {
        width: WIDTH - 24, height: 18, label: 'Reset progress', onClick: () => close(onReset),
      }),
      new Button(scene, cx, rowY(6) + 4, {
        width: 80, height: 20, style: 'gold', label: 'Close', onClick: () => { sfx.play('ui_back'); close(); },
      }),
    ]);
    scene.add.existing(this);
  }
}
