import Phaser from 'phaser';
import { DISPLAY, MOBILE } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, fillView } from '../display.js';
import { tutorialKey } from '../sprites.js';
import { formatAway } from '../systems/Offline.js';
import { Button } from '../ui/Button.js';
import { formatNum } from '../ui/format.js';
import {
  dark, glyph, glyphWidth, icon, LEDGER_KEY, light, panel, subText, text, UI,
} from '../ui/kit.js';

// The panel (base pixels).
const W = 232;
const PLATE_W = 172;
const ROW = 18;
const ROWS_Y = 56;     // the first row's centre, from the panel's top
const VALUE_X = 92;    // values, from the panel's left

const O = MOBILE.offline;

// While you were away: back after time away (Offline.comeBack), a parchment
// panel over the paused battle, fading in as the ship's ledger opens, with
// the Captain's mini portrait and "The crew kept busy, Cap'n!", then a row
// each: the time away (capped at 8 h), the gold (counting up with coin
// ticks), expeditions back (with a button to them, if they can open now)
// and Bait refilled. Collect plays plunder and pays.
// Launched with { report, canOpenExpeditions, onCollect, onExpeditions }.
export class AwayScene extends Phaser.Scene {
  constructor() {
    super('AwayScene');
  }

  init({
    report, canOpenExpeditions, onCollect, onExpeditions,
  }) {
    this.report = report;
    this.canOpenExpeditions = canOpenExpeditions;
    this.onCollect = onCollect;
    this.onExpeditions = onExpeditions;
    this.closing = false;   // (the scene is reused: each panel starts open)
  }

  create() {
    applyRenderScale(this);
    // Over everything, the Captain included (he waits for this).
    this.scene.bringToTop();
    const r = this.report;
    const rows = [['TIME AWAY', 'time'], ['GOLD', 'gold']];
    if (r.expeditions) rows.push([null, 'expeditions']);
    if (r.bait) rows.push(['BAIT', 'bait']);
    const H = ROWS_Y + rows.length * ROW + 30;
    const cx = DISPLAY.width / 2;
    const x = cx - W / 2;
    const y = Math.round(DISPLAY.height / 2 - H / 2) + 4;

    fillView(this, 0x07060f, 0.75);
    const card = this.add.container(0, 0);
    const add = (...objs) => { card.add(objs); return objs[0]; };
    add(panel(this, x, y, W, H, 'parchment'), panel(this, cx - PLATE_W / 2, y - 10, PLATE_W, 20, 'wood'));
    add(text(this, cx, y, 'While you were away...', light()).setOrigin(0.5));
    // The ledger, opening as the panel appears; the Captain beside it.
    const ledger = add(this.add.sprite(x + 10, y + 16, LEDGER_KEY, 0).setOrigin(0));
    add(this.add.sprite(x + 48, y + 20, tutorialKey('captain_mini'), 0).setOrigin(0));
    add(text(this, x + 76, y + 32, "The crew kept busy, Cap'n!", dark({ font: 'small' })).setOrigin(0, 0.5));

    rows.forEach(([label, kind], i) => {
      const ry = y + ROWS_Y + i * ROW;
      if (label) add(text(this, x + 12, ry, label, subText()).setOrigin(0, 0.5));
      const vx = x + VALUE_X;
      if (kind === 'time') {
        const t = add(text(this, vx, ry, formatAway(r.awayMs), dark()).setOrigin(0, 0.5));
        if (r.capped) add(text(this, vx + t.inkWidth + 4, ry, `(MAX ${O.capMs / 3600000} H)`, subText()).setOrigin(0, 0.5));
      } else if (kind === 'gold') {
        add(icon(this, vx + 6, ry, 'gold'));
        this.goldText = add(text(this, vx + 15, ry, '+0', dark()).setOrigin(0, 0.5));
      } else if (kind === 'expeditions') {
        const n = r.expeditions;
        // (No label: the line starts in the labels' column, clear of OPEN.)
        add(text(this, x + 12, ry, `${n} expedition${n === 1 ? ' is' : 's are'} back`, dark()).setOrigin(0, 0.5));
        if (this.canOpenExpeditions) {
          add(new Button(this, x + W - 32, ry, {
            width: 44, height: 16, font: 'small', label: 'OPEN', onClick: () => this.close(this.onExpeditions),
          }));
        }
      } else {
        const from = add(text(this, vx, ry, formatNum(r.bait.from), dark()).setOrigin(0, 0.5));
        const gw = glyphWidth('right');
        const ax = vx + from.inkWidth + 5 + Math.floor(gw / 2);
        add(glyph(this, ax, ry, 'right', UI.colors.textOnParchment));
        add(text(this, ax + Math.ceil(gw / 2) + 5, ry, formatNum(r.bait.to), dark()).setOrigin(0, 0.5));
      }
    });
    add(new Button(this, cx, y + H - 16, {
      width: 96, height: 22, style: 'gold', icon: 'gold', label: 'Collect', onClick: () => this.close(this.onCollect),
    }));

    // Fade in as the ledger opens; then the gold counts up.
    card.setAlpha(0);
    this.tweens.add({
      targets: card,
      alpha: 1,
      duration: O.openMs,
      onComplete: () => {
        ledger.setFrame(1);
        this.countGold();
      },
    });
    sfx.play('ui_open');
  }

  // The gold from 0 to the report's, over countMs, a coin tick every tickMs.
  countGold() {
    const gold = this.report.gold;
    if (gold <= 0) return;
    this.tweens.addCounter({
      from: 0,
      to: gold,
      duration: O.countMs,
      onUpdate: (tw) => this.goldText.setText(`+${formatNum(Math.floor(tw.getValue()))}`),
      onComplete: () => this.goldText.setText(`+${formatNum(gold)}`),
    });
    sfx.play('coin');
    this.time.addEvent({
      delay: O.tickMs, repeat: Math.max(0, Math.floor(O.countMs / O.tickMs) - 1), callback: () => sfx.play('coin'),
    });
  }

  close(then) {
    if (this.closing) return;
    this.closing = true;
    sfx.play('plunder');
    this.scene.stop();
    then?.();
  }
}
