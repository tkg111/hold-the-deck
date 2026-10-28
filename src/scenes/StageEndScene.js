import Phaser from 'phaser';
import { DISPLAY, MAP } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, fillView } from '../display.js';
import { stageCost } from '../systems/Uncharted.js';
import { Button } from '../ui/Button.js';
import { formatNum } from '../ui/format.js';
import {
  dark, hexColor, light, panel, subText, text, UI,
} from '../ui/kit.js';
import { crownRow, itemIcon } from '../ui/uncharted.js';

const W = 236;
const H = 150;
const VALUE_X = 92;
const ROW = 16;

// The end of a stage of the Uncharted Seas: a parchment card with the stage
// and its crowns, then won: the gold, the Sea Glass and Heart found, a new
// crown and Grog back on a first clear; lost or left: the Grog back. Retry
// (the Muster again) and Back to chart. There's no auto-continue.
// Launched with { progress, stage, crown, result (Progress.winStage's, or
// { won: false, refund, retreat }), onRetry, onChart }.
export class StageEndScene extends Phaser.Scene {
  constructor() {
    super('StageEndScene');
  }

  init({
    progress, stage, crown, result, onRetry, onChart,
  }) {
    Object.assign(this, {
      progress, stage, crown, result, onRetry, onChart,
    });
  }

  create() {
    applyRenderScale(this);
    const r = this.result;
    const cx = DISPLAY.width / 2;
    const x = cx - W / 2;
    const y = Math.round(DISPLAY.height / 2 - H / 2) + 4;
    fillView(this, 0x07060f, 0.8);
    panel(this, x, y, W, H, 'parchment');
    const title = r.won ? 'STAGE CLEARED!' : r.retreat ? 'RETREAT' : 'SHIP SUNK';
    const plate = text(this, cx, y, title, light({ color: r.won ? UI.colors.text : UI.colors.warn })).setOrigin(0.5);
    panel(this, cx - plate.inkWidth / 2 - 14, y - 10, plate.inkWidth + 28, 20, 'wood');
    this.children.bringToTop(plate);

    text(this, x + 12, y + 20, `${this.stage.id}  ${this.stage.name}`, dark());
    crownRow(this, x + W - 12 - 22, y + 24, this.crown);

    const rows = [];
    if (r.won) {
      rows.push(['GOLD', `+${formatNum(r.gold)}`]);
      rows.push(['FOUND', null]);
      if (r.crown > r.best) rows.push(['NEW CROWN', null]);
      if (r.refund) rows.push(['FIRST CLEAR', `+${r.refund} GROG BACK`]);
    } else {
      rows.push(['GROG BACK', `+${r.refund} OF ${stageCost(this.stage, this.crown)}`]);
      rows.push(['', 'UPGRADE, AWAKEN OR CHANGE THE CREW']);
    }
    rows.forEach(([label, value], i) => {
      const ry = y + 40 + i * ROW;
      text(this, x + 12, ry, label, subText());
      if (value != null) text(this, x + VALUE_X, ry - 1, value, label ? dark() : subText());
      if (label === 'FOUND') this.drawFound(x + VALUE_X, ry + 3);
      if (label === 'NEW CROWN') crownRow(this, x + VALUE_X + 5, ry + 3, r.crown);
    });

    this.add.rectangle(x + 8, y + H - 38, W - 16, 1, hexColor(UI.colors.subText), 0.4).setOrigin(0);
    new Button(this, cx - 56, y + H - 19, {
      width: 100, height: 24, style: 'gold', label: 'Retry', onClick: () => this.close(this.onRetry),
    });
    new Button(this, cx + 56, y + H - 19, {
      width: 100, height: 24, label: 'Back to chart', onClick: () => this.close(this.onChart),
    });
  }

  // The Sea Glass and Hearts found, icon and count each ("-" for none).
  drawFound(x, y) {
    const { glass, heart } = this.result;
    const found = [...Object.entries(glass ?? {}).filter(([, n]) => n > 0), ...(heart ? [['heart', heart]] : [])];
    if (!found.length) {
      text(this, x, y - 4, '-', dark());
      return;
    }
    found.forEach(([id, n], i) => {
      const ix = x + 6 + i * 30;
      itemIcon(this, ix, y, id);
      text(this, ix + 8, y - 3, `+${n}`, subText({ color: id === 'heart' ? MAP.clearedColor : UI.colors.textOnParchment }));
    });
  }

  // Android's back button: as Back to chart.
  back() {
    this.close(this.onChart);
  }

  close(then) {
    sfx.play('ui_click');
    this.scene.stop();
    then?.();
  }
}
