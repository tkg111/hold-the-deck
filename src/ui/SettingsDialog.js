import Phaser from 'phaser';
import { DISPLAY } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { fillView } from '../display.js';
import { onBack } from './back.js';
import { Button } from './Button.js';
import { dark, light, panel, text } from './kit.js';
import { Slider } from './Slider.js';

// Art pixels.
const WIDTH = 248;
const PLATE_W = 120;
const PLATE_H = 20;
const ROW_H = 24;
const SLIDER_W = 76;
const HALF_W = (WIDTH - 24 - 4) / 2;

const IOS_INSTALL = 'Tap Share, then Add to Home Screen.';

// The settings (the battle's gear button), modal like ConfirmDialog:
// Music and Sound effects volumes (sliders, 0-100) and Sound on / off
// (mute: both off, the sliders kept), Captain's tips on / off, Replay
// tutorial (closes the settings; the Captain starts over) and Reset
// progress (closes them for its own confirmation), Export save and Import
// save (close them for their own dialogs), Install game where the browser
// can install it (install: 'prompt'; 'ios': how to on an iPhone; null:
// installed or not possible, no row), and Close. With Rankings set up
// (captain: { name } or { name: null } before joining), a Captain name row
// after Captain's tips: the name (closes them for its rename dialog), or
// Join, which opens Rankings. In the Android app (vibration: true / false;
// null elsewhere) a Vibration on / off row comes before it (onVibration).
// onAudio({ music, sfx, muted }, done) fires as the sound settings change;
// done once a slider is let go (or the mute toggled): time to save.
export class SettingsDialog extends Phaser.GameObjects.Container {
  constructor(scene, {
    audio, onAudio, tipsOn, onTips, vibration = null, onVibration = null, onReplay, onReset, onExport, onImport, install, onInstall,
    captain = null, onCaptain = null,
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
    const offBack = onBack(() => this.destroy());
    this.once('destroy', () => {
      offBack();
      scene.modalOpen--;
      scene.events.off('view-resize', center);
      backdrop.destroy();
    });

    // Rows: the four settings (and Vibration, Captain name), two rows of
    // paired buttons, Install, Close.
    const vibrationRow = vibration == null ? null : 4;
    const captainRowAt = 4 + (vibrationRow == null ? 0 : 1);
    const first = captainRowAt + (captain ? 1 : 0);   // the first row of paired buttons
    const closeRow = first + (install ? 3 : 2);
    const height = 22 + closeRow * ROW_H + 24;
    const cx = DISPLAY.width / 2;
    const top = Math.round(DISPLAY.height / 2 - height / 2);
    const left = cx - WIDTH / 2;
    const rowY = (i) => top + 22 + i * ROW_H;
    const close = (then) => {
      this.destroy();
      then?.();
    };
    const label = (i, str) => text(scene, left + 12, rowY(i), str, dark()).setOrigin(0, 0.5);
    const pair = (i, [a, onA], [b, onB]) => [
      new Button(scene, cx - (HALF_W + 4) / 2, rowY(i), { width: HALF_W, height: 18, label: a, onClick: () => close(onA) }),
      new Button(scene, cx + (HALF_W + 4) / 2, rowY(i), { width: HALF_W, height: 18, label: b, onClick: () => close(onB) }),
    ];

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

    let installRow = [];
    if (install === 'prompt') {
      installRow = [new Button(scene, cx, rowY(first + 2), {
        width: WIDTH - 24, height: 18, style: 'gold', label: 'Install game', onRelease: true, onClick: () => close(onInstall),
      })];
    } else if (install === 'ios') {
      installRow = [text(scene, cx, rowY(first + 2), IOS_INSTALL, dark({ font: 'small' })).setOrigin(0.5)];
    }
    let vibrationRowItems = [];
    if (vibrationRow != null) {
      this.vibration = vibration;
      const toggle = new Button(scene, left + WIDTH - 40, rowY(vibrationRow), {
        width: 56, height: 18, font: 'small', label: '', onClick: () => {
          this.vibration = !this.vibration;
          paintVibration();
          onVibration(this.vibration);
        },
      });
      const paintVibration = () => toggle.setLabel(this.vibration ? 'ON' : 'OFF').setStyle(this.vibration ? 'gold' : 'wood');
      paintVibration();
      vibrationRowItems = [label(vibrationRow, 'Vibration'), toggle];
    }
    const captainRow = captain ? [
      label(captainRowAt, 'Captain name'),
      new Button(scene, left + WIDTH - 12 - 48, rowY(captainRowAt), {
        width: 96, height: 18, font: 'small', label: captain.name ?? 'JOIN RANKINGS', style: captain.name ? 'wood' : 'gold',
        onClick: () => close(onCaptain),
      }),
    ] : [];
    this.add([
      panel(scene, left, top, WIDTH, height, 'parchment'),
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
      ...vibrationRowItems,
      ...captainRow,
      ...pair(first, ['Replay tutorial', onReplay], ['Reset progress', onReset]),
      ...pair(first + 1, ['Export save', onExport], ['Import save', onImport]),
      ...installRow,
      new Button(scene, cx, rowY(closeRow) + 4, {
        width: 80, height: 20, style: 'gold', label: 'Close', onClick: () => { sfx.play('ui_back'); close(); },
      }),
    ]);
    scene.add.existing(this);
  }
}
