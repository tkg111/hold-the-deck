import Phaser from 'phaser';
import { DISPLAY, HEROES, MAP } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, fillView } from '../display.js';
import { DEPTH_ICON_KEY } from '../sprites.js';
import { Button } from '../ui/Button.js';
import { formatNum } from '../ui/format.js';
import {
  dark, face, hexColor, light, panel, subText, text, UI,
} from '../ui/kit.js';
import { materialIcon } from '../ui/parts.js';

// The panel (base pixels).
const W = 236;
const H = 168;
const VALUE_X = 104;   // values, from the panel's left
const ROW = 16;

// The end of a dive in the Abyss: a parchment card with the depth reached,
// the best depth (NEW RECORD when it went deeper), the gold the dive earned,
// the boss materials it found and the Captain's Log's top damage dealer over
// the dive, with Dive again (a new dive from the same start) and Map.
// Launched with { progress, summary (Progress.endDive), onDiveAgain, onMap }.
export class AbyssEndScene extends Phaser.Scene {
  constructor() {
    super('AbyssEndScene');
  }

  init({ progress, summary, onDiveAgain, onMap }) {
    this.progress = progress;
    this.summary = summary;
    this.onDiveAgain = onDiveAgain;
    this.onMap = onMap;
  }

  create() {
    applyRenderScale(this);
    const s = this.summary;
    const cx = DISPLAY.width / 2;
    const x = cx - W / 2;
    const y = Math.round(DISPLAY.height / 2 - H / 2) + 6;
    fillView(this, 0x07060f, 0.85);
    panel(this, x, y, W, H, 'parchment');
    panel(this, cx - 70, y - 10, 140, 20, 'wood');
    this.add.image(cx - 52, y, DEPTH_ICON_KEY);
    text(this, cx + 6, y, 'THE DIVE IS OVER', light()).setOrigin(0.5);

    const rows = [
      ['DEPTH REACHED', formatNum(s.depth)],
      ['BEST DEPTH', formatNum(s.best)],
      ['GOLD EARNED', formatNum(s.gold)],
      ['MATERIALS FOUND', null],
      ['TOP CREWMATE', null],
    ];
    const values = rows.map(([label, value], i) => {
      const ry = y + 22 + i * ROW;
      text(this, x + 12, ry, label, subText());
      return value != null ? text(this, x + VALUE_X, ry, value, dark()) : null;
    });
    if (s.newRecord) {
      text(this, x + VALUE_X + values[1].inkWidth + 8, y + 23 + ROW, 'NEW RECORD!', subText({ color: MAP.clearedColor }));
    }
    if (s.from > 1) text(this, x + W - 12, y + 23, `FROM ${formatNum(s.from)}`, subText()).setOrigin(1, 0);

    // Materials: icon and count for each.
    const found = Object.entries(s.materials).filter(([, n]) => n > 0);
    const my = y + 22 + 3 * ROW;
    if (!found.length) text(this, x + VALUE_X, my, '-', dark());
    found.forEach(([id, n], i) => {
      const mx = x + VALUE_X + 7 + i * 40;
      materialIcon(this, mx, my + 4, id);
      text(this, mx + 10, my + 1, `+${formatNum(n)}`, subText({ color: UI.colors.textOnParchment }));
    });

    // The dive's top damage dealer.
    const ty = y + 22 + 4 * ROW;
    if (s.mvp && HEROES[s.mvp.id]) {
      face(this, x + VALUE_X + 8, ty + 4, s.mvp.id);
      text(this, x + VALUE_X + 20, ty, HEROES[s.mvp.id].name, dark());
      text(this, x + VALUE_X + 20, ty + 11, `${formatNum(s.mvp.damage)} DMG`, subText());
    } else {
      text(this, x + VALUE_X, ty, '-', dark());
    }

    this.add.rectangle(x + 8, y + H - 40, W - 16, 1, hexColor(UI.colors.subText), 0.4).setOrigin(0);
    new Button(this, cx - 56, y + H - 20, {
      width: 100, height: 24, style: 'gold', label: 'Dive again', onClick: () => this.close(this.onDiveAgain),
    });
    new Button(this, cx + 56, y + H - 20, {
      width: 100, height: 24, label: 'Map', onClick: () => this.close(this.onMap),
    });
    if (s.newRecord) sfx.play('legendary');
  }

  // Android's back button: as Map.
  back() {
    this.close(this.onMap);
  }

  close(then) {
    sfx.play('ui_click');
    this.scene.stop();
    then?.();
  }
}
