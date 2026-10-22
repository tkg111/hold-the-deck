import Phaser from 'phaser';
import { BATTLE_LOG, DISPLAY, ENEMIES, HEROES, UI_KIT } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, fillView } from '../display.js';
import { KINDS, sumCrew, sumHull, totalDamage } from '../systems/BattleStats.js';
import { FISH_DATA, itemFrame, rarityOf } from '../systems/Fishing.js';
import { fishingKey } from '../sprites.js';
import { Button } from '../ui/Button.js';
import { formatNum } from '../ui/format.js';
import {
  dark, face, hexColor, icon, light, nineSlice, panel, subText, text, UI,
} from '../ui/kit.js';
import { enemyThumb } from '../ui/wanted.js';

const TABS = [
  { key: 'last', label: 'Last Wave' },
  { key: 'recent', label: 'Last 5 Waves' },
  { key: 'taken', label: 'Damage Taken' },
  { key: 'fish', label: 'Fish Log' },
  { key: 'stats', label: 'Stats' },
];
const LEGEND = { attack: 'ATTACKS', ability: 'ABILITIES', effect: 'EFFECTS' };

// A support crewmate's extra stat (BattleStats.SUPPORT) as a line of text.
const SUPPORT_LABEL = {
  captain: (n) => `AURA ADDED ${formatNum(n)} DMG`,
  shipsDoctor: (n) => `REPAIRED ${formatNum(n)} HULL`,
  netThrower: (n) => `SLOWED ${formatNum(n)} ${n === 1 ? 'ENEMY' : 'ENEMIES'}`,
  shipsCook: (n) => `${formatNum(n)} ${n === 1 ? 'STUN' : 'STUNS'} APPLIED`,
};

const plural = (n, word) => `${formatNum(n)} ${word}${n === 1 ? '' : 'S'}`;
const percent = (part, whole) => `${whole > 0 ? Math.round(100 * part / whole) : 0}%`;

// The Captain's Log (battle stats): a parchment panel with tabs. Last Wave
// and Last 5 Waves list each crewmate's damage (a bar split into attacks /
// abilities / effects, highest first, the top one marked MVP) with their
// kills, ability uses and support stat; Damage Taken lists the hull damage
// each enemy type did over the waves kept; Fish Log shows every fish and how
// many have been caught; Stats lists the voyage's totals.
// Launched with { progress, onClose }.
export class LogScene extends Phaser.Scene {
  constructor() {
    super('LogScene');
    this.tab = TABS[0].key;   // kept between openings
  }

  init({ progress, onClose }) {
    this.progress = progress;
    this.onClose = onClose;
    this.offset = 0;
  }

  create() {
    applyRenderScale(this);
    const cx = DISPLAY.width / 2;
    const P = BATTLE_LOG.panel;
    fillView(this, 0x0d1117, 0.9);
    panel(this, cx - 70, 4, 140, 20, 'wood');
    text(this, cx, 14, "CAPTAIN'S LOG", light()).setOrigin(0.5);
    new Button(this, DISPLAY.width - 30, 14, {
      width: 48, height: 20, label: 'Back', onClick: () => this.close(),
    });
    panel(this, P.x, P.y, P.width, P.height, 'parchment');
    this.summary = text(this, P.x + 10, BATTLE_LOG.infoY, '', subText()).setOrigin(0, 0.5);
    this.add.rectangle(P.x + 10, BATTLE_LOG.rowsY - 3, P.width - 20, 1, hexColor(UI_KIT.dividerColor)).setOrigin(0);

    this.tabs = this.add.container(0, 0);
    this.header = this.add.container(0, 0);
    this.body = this.add.container(0, 0);
    this.rows = [];

    // Scroll arrows (right of the info line) and the mouse wheel, when there
    // are more rows than fit.
    const ay = BATTLE_LOG.infoY;
    this.upArrow = icon(this, P.x + P.width - 30, ay, 'arrow_up').setInteractive({ useHandCursor: true });
    this.downArrow = icon(this, P.x + P.width - 16, ay, 'arrow_up').setFlipY(true).setInteractive({ useHandCursor: true });
    this.upArrow.on('pointerdown', () => this.scroll(-1));
    this.downArrow.on('pointerdown', () => this.scroll(1));
    const onWheel = (_p, _over, _dx, dy) => this.scroll(Math.sign(dy));
    this.input.on('wheel', onWheel);
    this.events.once('shutdown', () => this.input.off('wheel', onWheel));

    this.draw();
  }

  get records() { return this.progress.battleLog; }

  select(tab) {
    if (tab === this.tab) return;
    sfx.click();
    this.tab = tab;
    this.offset = 0;
    this.draw();
  }

  draw() {
    this.drawTabs();
    this.body.removeAll(true);
    this.header.removeAll(true);
    this.rows = [];
    this.scrolls = false;
    const log = this.records;
    if (this.tab === 'stats') {
      this.drawStats();
    } else if (this.tab === 'fish') {
      this.drawFishLog();
    } else if (!log.length) {
      this.summary.setText('');
      this.message('NO BATTLES LOGGED YET. SET SAIL!');
    } else if (this.tab === 'taken') {
      this.drawTaken(log);
    } else {
      this.drawCrew(this.tab === 'last' ? log.slice(-1) : log);
    }
    this.body.add(this.rows);
    this.layoutRows();
  }

  // The tab buttons along the top of the parchment, each as wide as its
  // label needs (at least BATTLE_LOG.tabWidth): gold for the open one.
  drawTabs() {
    const P = BATTLE_LOG.panel;
    this.tabs.removeAll(true);
    let x = P.x + 10;
    for (const { key, label } of TABS) {
      // (Measured in the light font: wood tabs' outlined text is wider.)
      const probe = text(this, 0, 0, label, light());
      const w = Math.max(BATTLE_LOG.tabWidth, probe.inkWidth + 10);
      probe.destroy();
      this.tabs.add(new Button(this, x + w / 2, P.y + 14, {
        width: w, height: 18, label, style: key === this.tab ? 'gold' : 'wood', onClick: () => this.select(key),
      }));
      x += w + 4;
    }
  }

  message(str) {
    const P = BATTLE_LOG.panel;
    const y = (BATTLE_LOG.rowsY + P.y + P.height) / 2;
    this.body.add(text(this, P.x + P.width / 2, y, str, subText({ align: 'center' })).setOrigin(0.5));
  }

  // Right-aligned on the info line, left of the scroll arrows: the bar
  // colours (crew tabs) or a note.
  drawLegend(items) {
    const P = BATTLE_LOG.panel;
    let x = P.x + P.width - 10 - (this.scrolls ? 34 : 0);
    const y = BATTLE_LOG.infoY;
    for (const { label, color } of [...items].reverse()) {
      const t = text(this, x, y, label, subText()).setOrigin(1, 0.5);
      x -= t.inkWidth + 3;
      this.header.add(t);
      if (color) {
        this.header.add(this.add.rectangle(x - 6, y - 3, 6, 6, hexColor(color)).setOrigin(0));
        x -= 6 + 8;
      } else {
        x -= 8;
      }
    }
  }

  // Last Wave / Last 5 Waves: a row per crewmate, highest damage first.
  drawCrew(records) {
    const won = records.filter((r) => r.won).length;
    this.summary.setText(records.length === 1
      ? `WAVE ${formatNum(records[0].wave)} ${records[0].won ? 'CLEARED' : 'SUNK'}`
      : `${records.length} WAVES: ${won} WON, ${records.length - won} LOST`);
    const crew = sumCrew(records).map((c) => ({ ...c, total: totalDamage(c) }))
      .sort((a, b) => b.total - a.total);
    if (!crew.length) {
      this.message('NOBODY WAS ON THE SHIP.');
      return;
    }
    const all = crew.reduce((sum, c) => sum + c.total, 0);
    const top = crew[0].total;
    this.rows = crew.map((c, i) => this.crewRow(c, { all, top, mvp: i === 0 && c.total > 0 }));
    this.scrolls = this.rows.length > BATTLE_LOG.visibleRows;
    this.drawLegend(KINDS.map((k) => ({ label: LEGEND[k], color: BATTLE_LOG.colors[k] })));
  }

  crewRow(c, { all, top, mvp }) {
    const { barX, barWidth } = BATTLE_LOG;
    const row = this.add.container(0, 0);
    const def = HEROES[c.id];
    const name = text(this, 20, 4, def.name, dark());
    if (name.inkWidth > barX - 26) name.setText(def.shortName);
    row.add([face(this, 8, 9, c.id), name]);
    row.add(this.damageBar(barX, 3, barWidth, top, KINDS.map((k) => ({ value: c[k], color: BATTLE_LOG.colors[k] }))));
    row.add([
      text(this, barX + barWidth + 6, 4, formatNum(c.total), dark()),
      text(this, this.innerWidth, 4, percent(c.total, all), dark()).setOrigin(1, 0),
      text(this, barX + barWidth + 6, 19, `${plural(c.kills, 'KILL')}  ${plural(c.uses, 'USE')}`, subText()),
    ]);
    if (c.support != null && SUPPORT_LABEL[c.id]) {
      row.add(text(this, barX, 19, SUPPORT_LABEL[c.id](c.support), subText()));
    }
    if (mvp) {
      row.add([
        nineSlice(this, 20, 16, 24, 12, 'btn_gold_normal'),
        text(this, 32, 20, 'MVP', subText()).setOrigin(0.5),
      ]);
    }
    return row;
  }

  // Damage Taken: a row per enemy type, most hull damage first.
  drawTaken(records) {
    const hull = Object.entries(sumHull(records)).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const all = hull.reduce((sum, [, v]) => sum + v, 0);
    this.summary.setText(`HULL LOST: ${formatNum(all)}`);
    if (!hull.length) {
      this.message('NOTHING HAS HIT THE HULL. YET.');
      return;
    }
    const top = hull[0][1];
    const { barX, barWidth } = BATTLE_LOG;
    this.rows = hull.map(([id, damage]) => {
      const name = ENEMIES[id].name;
      return this.add.container(0, 0, [
        enemyThumb(this, 0, 1, id),
        text(this, 40, 3, name, dark()),
        this.damageBar(40, 17, barX + barWidth - 40, top, [{ value: damage, color: UI.colors.hull }]),
        text(this, barX + barWidth + 6, 11, formatNum(damage), dark()),
        text(this, this.innerWidth, 11, percent(damage, all), dark()).setOrigin(1, 0),
      ]);
    });
    this.scrolls = this.rows.length > BATTLE_LOG.visibleRows;
    const n = records.length;
    this.drawLegend([{ label: n === 1 ? 'HULL DAMAGE, LAST WAVE' : `HULL DAMAGE, LAST ${n} WAVES` }]);
  }

  // Stats: the voyage's totals, a row each.
  drawStats() {
    const p = this.progress;
    this.summary.setText('THE VOYAGE SO FAR');
    const defeated = Object.values(p.defeats).reduce((s, n) => s + n, 0);
    const stats = [
      ['ENEMIES DEFEATED', defeated],
      ['MERCHANTS PLUNDERED', p.merchantsPlundered],
      ['FISH CAUGHT', p.fishCaught],
    ];
    this.rows = stats.map(([label, value]) => this.add.container(0, 0, [
      text(this, 4, 10, label, dark()),
      text(this, this.innerWidth - 4, 10, formatNum(value), dark()).setOrigin(1, 0),
    ]));
    this.scrolls = this.rows.length > BATTLE_LOG.visibleRows;
  }

  // Fish Log: every fish in fishing.json's order, in a grid, with how many
  // have been caught; one never caught is a dark silhouette and "???".
  drawFishLog() {
    const p = this.progress;
    const { panel: P, rowsY } = BATTLE_LOG;
    const { cols, cellWidth, cellHeight } = BATTLE_LOG.fishLog;
    const found = FISH_DATA.fish.filter((f) => p.hasCaught(f.id)).length;
    this.summary.setText(`${found}/${FISH_DATA.fish.length} FOUND  -  ${formatNum(p.fishCaught)} CAUGHT`);
    const left = P.x + Math.round((P.width - cols * cellWidth) / 2);
    FISH_DATA.fish.forEach((f, i) => {
      const x = left + (i % cols) * cellWidth + cellWidth / 2;
      const y = rowsY + 4 + Math.floor(i / cols) * cellHeight;
      const caught = p.hasCaught(f.id);
      const art = caught
        ? this.add.image(x, y + 16, fishingKey('fish'), f.index)
        : this.add.image(x, y + 16, fishingKey('items'), itemFrame('unknown_fish'));
      this.body.add([
        art.setScale(2),
        text(this, x, y + 37, caught ? f.name.toUpperCase() : '???', subText({ align: 'center', wrap: cellWidth - 4 })).setOrigin(0.5, 0),
        text(this, x, y + 47, caught ? rarityOf(f.id).label.toUpperCase() : '', subText()).setOrigin(0.5, 0),
        text(this, x, y + 58, caught ? `X${formatNum(p.fishLog[f.id])}` : '', dark()).setOrigin(0.5, 0),
      ]);
    });
  }

  // A bar_frame w x 10 at (x, y), filled with segments ({ value, color })
  // end to end, the whole bar standing for `top`.
  damageBar(x, y, w, top, segments) {
    const bar = this.add.container(x, y, [nineSlice(this, 0, 0, w, 10, 'bar_frame')]);
    const inner = w - 2;
    let sum = 0;
    let left = 0;
    for (const { value, color } of segments) {
      sum += value;
      // Whole pixels, rounding the running total so the segments add up.
      const right = top > 0 ? Math.round(inner * sum / top) : 0;
      if (right > left) bar.add(this.add.rectangle(1 + left, 1, right - left, 8, hexColor(color)).setOrigin(0));
      left = right;
    }
    return bar;
  }

  get innerWidth() { return BATTLE_LOG.panel.width - 20; }
  get maxOffset() { return Math.max(0, this.rows.length - BATTLE_LOG.visibleRows); }

  scroll(by) {
    const next = Phaser.Math.Clamp(this.offset + by, 0, this.maxOffset);
    if (next === this.offset) return;
    this.offset = next;
    this.layoutRows();
  }

  // The visible rows in place, with dividers between them.
  layoutRows() {
    const { rowsY, rowHeight, visibleRows, panel: P } = BATTLE_LOG;
    this.dividers?.destroy();
    this.dividers = this.add.graphics().fillStyle(hexColor(UI_KIT.dividerColor));
    const shown = Math.min(this.rows.length, visibleRows);
    this.rows.forEach((row, i) => {
      const slot = i - this.offset;
      const visible = slot >= 0 && slot < shown;
      row.setVisible(visible);
      if (visible) row.setPosition(P.x + 10, rowsY + slot * rowHeight);
      if (visible && slot > 0) this.dividers.fillRect(P.x + 10, rowsY + slot * rowHeight - 1, this.innerWidth, 1);
    });
    this.upArrow.setVisible(this.maxOffset > 0).setAlpha(this.offset > 0 ? 1 : 0.35);
    this.downArrow.setVisible(this.maxOffset > 0).setAlpha(this.offset < this.maxOffset ? 1 : 0.35);
  }

  close() {
    sfx.click();
    this.scene.stop();
    this.onClose?.();
  }
}
