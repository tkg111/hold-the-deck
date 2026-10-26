import Phaser from 'phaser';
import { DISPLAY, MOBILE } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { fillView, pageRect } from '../display.js';
import { online } from '../online/index.js';
import { decodeSave, IMPORT_ERRORS } from '../systems/SaveCode.js';
import { onBack } from './back.js';
import { Button } from './Button.js';
import { ConfirmDialog } from './ConfirmDialog.js';
import { dark, light, panel, text } from './kit.js';

// Art pixels.
const WIDTH = 240;
const HEIGHT = 136;
const NOTE_H = 10;   // the Rankings note's extra room (import)
const PLATE_W = 120;
const PLATE_H = 20;

// Settings' Export save and Import save, modal like ConfirmDialog, round a
// real text box (an HTML textarea kept over the panel, so the code can be
// selected, copied and pasted).
//   export: the code (already made) is copied to the clipboard and shown,
//     selected, in a read-only box.
//   import: paste a code and Load: a code that won't load says why; one that
//     will asks "This will replace your current save" first, then
//     onImport(progress). With Rankings set up, a line under the box says
//     they don't move with the save.
export class SaveCodeDialog extends Phaser.GameObjects.Container {
  constructor(scene, { mode, code = '', onImport = null }) {
    super(scene, 0, 0);
    const backdrop = fillView(scene, 0x000000, 0.65).setDepth(50);
    this.setDepth(50);
    const cx = DISPLAY.width / 2;
    // The rankings identity is this device's own Supabase session.
    const note = mode === 'import' && online.available;
    const height = HEIGHT + (note ? NOTE_H : 0);
    const top = DISPLAY.height / 2 - height / 2;
    const left = cx - WIDTH / 2;
    const { width: boxW, height: boxH } = MOBILE.saveCode.box;
    const box = { x: cx - boxW / 2, y: top + 34, w: boxW, h: boxH };

    // The text box, over the panel.
    const area = document.createElement('textarea');
    area.className = 'save-code';
    area.spellcheck = false;
    area.autocomplete = 'off';
    area.setAttribute('autocapitalize', 'off');
    area.readOnly = mode === 'export';
    area.value = code;
    area.placeholder = mode === 'import' ? 'Paste your save code here' : '';
    document.body.appendChild(area);
    const place = () => {
      const r = pageRect(scene, this.x + box.x, this.y + box.y, box.w, box.h);
      Object.assign(area.style, {
        left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      });
    };
    const center = (view) => {
      this.setPosition(Math.round(view.centerX - DISPLAY.width / 2), Math.round(view.centerY - DISPLAY.height / 2));
      place();
    };
    center(scene.view);
    scene.events.on('view-resize', center);
    window.addEventListener('resize', place);
    scene.modalOpen = (scene.modalOpen ?? 0) + 1;
    const offBack = onBack(() => this.destroy());
    this.once('destroy', () => {
      offBack();
      scene.modalOpen--;
      scene.events.off('view-resize', center);
      window.removeEventListener('resize', place);
      area.remove();
      backdrop.destroy();
    });

    const message = text(scene, cx, top + 22, '', dark({ font: 'small', align: 'center', wrap: WIDTH - 24 })).setOrigin(0.5);
    const say = (str) => message.setText(str);
    const buttonY = top + height - 18;
    const close = () => { sfx.play('ui_back'); this.destroy(); };

    const items = [
      panel(scene, left, top, WIDTH, height, 'parchment'),
      panel(scene, cx - PLATE_W / 2, top - 8, PLATE_W, PLATE_H, 'wood'),
      text(scene, cx, top - 8 + PLATE_H / 2, mode === 'export' ? 'Export save' : 'Import save', light()).setOrigin(0.5),
      message,
    ];
    if (mode === 'export') {
      // The Clipboard API, else the old copy command on the selected box
      // (some phones only allow either straight from a tap).
      const copy = () => {
        area.focus();
        area.select();
        area.setSelectionRange(0, code.length);
        const copied = () => say('Copied! Paste it into Import save on your other device.');
        const fallback = () => {
          let ok = false;
          try { ok = document.execCommand('copy'); } catch { /* not allowed */ }
          if (ok) copied();
          else say('Copy the code below, then Import it on your other device.');
        };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(code).then(copied, fallback);
        else fallback();
      };
      copy();
      items.push(
        new Button(scene, cx - 46, buttonY, {
          width: 80, height: 20, label: 'Copy', onClick: copy, onRelease: true,
        }),
        new Button(scene, cx + 46, buttonY, {
          width: 80, height: 20, style: 'gold', label: 'Close', onClick: close,
        }),
      );
    } else {
      say('Paste a save code from Export save.');
      if (note) {
        items.push(text(scene, cx, box.y + box.h + 9, 'RANKINGS STAY WITH THE OLD DEVICE.', dark({ font: 'small' })).setOrigin(0.5));
      }
      let busy = false;
      const load = async () => {
        if (busy) return;
        busy = true;
        const result = await decodeSave(area.value);
        busy = false;
        if (!this.scene) return;   // closed meanwhile
        if (result.error) {
          sfx.play('ui_error');
          say(IMPORT_ERRORS[result.error]);
          return;
        }
        area.style.visibility = 'hidden';
        const confirm = new ConfirmDialog(scene, {
          title: 'Import this save?',
          message: 'This will replace your current save.',
          confirmLabel: 'Confirm',
          onConfirm: () => {
            this.destroy();
            onImport(result.progress);
          },
        }).setDepth(51);
        confirm.once('destroy', () => { if (area.isConnected) area.style.visibility = ''; });
      };
      items.push(
        new Button(scene, cx - 46, buttonY, { width: 80, height: 20, label: 'Cancel', onClick: close }),
        new Button(scene, cx + 46, buttonY, {
          width: 80, height: 20, style: 'gold', label: 'Load', onClick: load,
        }),
      );
      area.focus();
    }
    this.add(items);
    scene.add.existing(this);
  }
}
