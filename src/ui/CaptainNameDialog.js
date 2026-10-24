import Phaser from 'phaser';
import { DISPLAY, RANKINGS } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { fillView } from '../display.js';
import { checkName } from '../online/index.js';
import { Button } from './Button.js';
import { HtmlField } from './HtmlField.js';
import { dark, light, panel, text } from './kit.js';

// Art pixels.
const WIDTH = 248;
const HEIGHT = 112;
const PLATE_W = 150;
const PLATE_H = 20;
const FIELD_W = 160;
const FIELD_H = 18;

// Pick a captain name, modal like ConfirmDialog: the Rankings' "Join the
// Rankings?" and Settings' Captain name. The name is checked here first
// (checkName), then onSubmit(name) runs: it resolves when done (the dialog
// closes) or throws an OnlineError, whose message (written for players) is
// shown. A network failure says so instead. Cancel calls onCancel.
export class CaptainNameDialog extends Phaser.GameObjects.Container {
  constructor(scene, {
    title, message, value = '', confirmLabel = 'Join', cancelLabel = 'Not now', onSubmit, onCancel = null,
  }) {
    super(scene, 0, 0);
    const backdrop = fillView(scene, 0x000000, 0.65).setDepth(50);
    this.setDepth(50);
    const cx = DISPLAY.width / 2;
    const top = Math.round(DISPLAY.height / 2 - HEIGHT / 2);
    const left = cx - WIDTH / 2;
    const fieldY = top + 52;

    this.field = new HtmlField(scene, {
      box: () => ({ x: this.x + cx - FIELD_W / 2, y: this.y + fieldY, w: FIELD_W, h: FIELD_H }),
      placeholder: 'Captain name',
      maxLength: RANKINGS.name.max,
      value,
      onEnter: () => submit(),
    });
    const center = (view) => {
      this.setPosition(Math.round(view.centerX - DISPLAY.width / 2), Math.round(view.centerY - DISPLAY.height / 2));
      this.field.place();
    };
    center(scene.view);
    scene.events.on('view-resize', center);
    scene.modalOpen = (scene.modalOpen ?? 0) + 1;
    this.once('destroy', () => {
      scene.modalOpen--;
      scene.events.off('view-resize', center);
      this.field.destroy();
      backdrop.destroy();
    });

    const error = text(scene, cx, fieldY + FIELD_H + 8, '', dark({ font: 'small', align: 'center', wrap: WIDTH - 24 }))
      .setOrigin(0.5);
    const say = (str) => error.setText(str.toUpperCase());
    const buttonY = top + HEIGHT - 16;
    let busy = false;
    const submit = async () => {
      if (busy) return;
      const checked = checkName(this.field.value);
      if (checked.error) {
        sfx.play('ui_error');
        say(checked.error);
        return;
      }
      busy = true;
      say(confirmLabel === 'Join' ? 'Joining...' : 'Saving...');
      try {
        await onSubmit(checked.name);
        if (this.scene) this.destroy();
      } catch (err) {
        if (!err.kind) console.error(err);   // not the server's: a bug
        if (!this.scene) return;   // closed meanwhile
        sfx.play('ui_error');
        say(err.kind === 'server' ? err.message : "Can't reach port. Try again later.");
      } finally {
        busy = false;
      }
    };

    this.add([
      panel(scene, left, top, WIDTH, HEIGHT, 'parchment'),
      panel(scene, cx - PLATE_W / 2, top - 8, PLATE_W, PLATE_H, 'wood'),
      text(scene, cx, top - 8 + PLATE_H / 2, title, light()).setOrigin(0.5),
      text(scene, cx, top + 28, message, dark({ font: 'small', align: 'center', wrap: WIDTH - 24 })).setOrigin(0.5),
      error,
      new Button(scene, cx - 46, buttonY, {
        width: 80, height: 20, label: cancelLabel,
        onClick: () => {
          sfx.play('ui_back');
          this.destroy();
          onCancel?.();
        },
      }),
      new Button(scene, cx + 46, buttonY, {
        width: 80, height: 20, label: confirmLabel, style: 'gold', onClick: submit,
      }),
    ]);
    scene.add.existing(this);
    this.field.focus();
  }
}
