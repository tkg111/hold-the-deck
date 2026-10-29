import Phaser from 'phaser';
import { DISPLAY, UNCHARTED } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { SEAS } from '../data/uncharted.js';
import { applyRenderScale, fillView, hudEdges } from '../display.js';
import { CURRENTS_KEY, ABYSS_JSON_KEY, UNCHARTED_JSON_KEY, unchartedKey } from '../sprites.js';
import {
  bestCrown, hourglassMs, isBossStage, isCrownOpen, isSeaOpen, isStageOpen, seaCrown, stageCost, stageCurrent, stageRules,
} from '../systems/Uncharted.js';
import { Button } from '../ui/Button.js';
import { fmtClock } from '../ui/format.js';
import {
  dark, hexColor, light, panel, subText, tapArea, text, UI,
} from '../ui/kit.js';
import {
  crownRow, GrogPlaque, itemIcon, nodeImage, ruleIcon, ruleOf,
} from '../ui/uncharted.js';

// The Uncharted Seas' chart (after preview_chart.png): chart_bg.png (640x430,
// its 480x270 safe view at 80,100, drawn at -80,-100 like the title's art)
// with each sea's name at its legend.json label_at, its boss marker (locked,
// open or cleared) at its top-right and under the name the best crown fully
// cleared there. A locked sea's name is greyed. The Grog plaque sits top
// right. Tapping an open sea opens its stage list (after
// preview_stage_list.png): a parchment panel with the sea's name, its crown
// tabs (a tab opens once every stage is cleared at the crown below), a row
// per stage (marker, number and name, crowns earned, rule icons, drop
// icons, Grog cost), the selected row's rules in the footer and SET SAIL.
// Launched with { progress, onSail(stage, crown), onClose }.

const NODE_OFFSET = { x: 32, y: -21 };   // a sea's boss marker, from its centre
const COLS = { rules: 194, drops: 250, grog: 322 };   // the list's columns, from its left

export class ChartScene extends Phaser.Scene {
  constructor() {
    super('ChartScene');
  }

  init({ progress, onSail, onClose, sea = null }) {
    this.progress = progress;
    this.onSail = onSail;
    this.onClose = onClose;
    this.openSea = sea;   // a sea whose list to open at once (back from a stage)
  }

  create() {
    applyRenderScale(this);
    const p = this.progress;
    p.uncharted.seen = true;
    this.legend = this.cache.json.get(UNCHARTED_JSON_KEY);
    const [ox, oy] = UNCHARTED.chart.offset;
    this.ox = ox;
    this.oy = oy;
    fillView(this, 0x2a1e14, 1);
    this.add.image(ox, oy, unchartedKey('chart')).setOrigin(0);
    this.legend.chart.seas.forEach((spot, i) => this.drawSea(spot, i));
    this.closeButton = new Button(this, 26, 26, { width: 24, height: 24, label: 'X', onClick: () => this.close() });
    this.grog = new GrogPlaque(this, 0, 0, p).setDepth(5);
    this.list = this.add.container(0, 0).setDepth(4);
    this.layout(this.view);
    this.events.on('view-resize', this.layout, this);
    this.events.once('shutdown', () => this.events.off('view-resize', this.layout, this));
    if (this.openSea != null) this.showList(this.openSea, { quiet: true });
  }

  layout(view) {
    const e = hudEdges(view);
    this.grog.setPosition(e.right + 474, e.top + 6);
    this.closeButton.setPosition(e.left + 20, e.top + 18);
  }

  // A sea: its name, its boss marker and its best crown; tappable once open.
  drawSea(spot, i) {
    const rec = this.progress.uncharted;
    const open = isSeaOpen(rec, i);
    const [cx, cy] = [spot.centre[0] + this.ox, spot.centre[1] + this.oy];
    const [lx, ly] = [spot.label_at[0] + this.ox, spot.label_at[1] + this.oy];
    const sea = SEAS[i];
    const boss = sea.stages[sea.stages.length - 1];
    const marker = !open ? 'boss_locked' : bestCrown(rec, boss) >= 1 ? 'boss_cleared' : 'boss_open';
    nodeImage(this, cx + NODE_OFFSET.x, cy + NODE_OFFSET.y, marker);
    text(this, lx, ly, sea.name, dark({ color: open ? UI.colors.textOnParchment : UI.colors.subText })).setOrigin(0.5);
    const crowns = seaCrown(rec, i);
    if (crowns) crownRow(this, lx - (crowns - 1) * 5.5, ly + 12, crowns);
    const hit = this.add.zone(cx, cy, 76, 64);
    tapArea(hit, 76, 64, { useHandCursor: true });
    hit.on('pointerdown', () => {
      if (this.list.visible && this.list.length) return;
      if (open) this.showList(i);
      else this.notice(`CLEAR ${SEAS[i - 1].name.toUpperCase()}'S LAST STAGE FIRST`);
    });
  }

  // A line over the chart for a moment.
  notice(msg) {
    sfx.play('ui_error');
    this.note?.destroy();
    const cx = DISPLAY.width / 2;
    const t = text(this, cx, 252, msg, light()).setOrigin(0.5).setDepth(6);
    const plate = panel(this, cx - t.inkWidth / 2 - 8, 243, t.inkWidth + 16, 18, 'wood').setDepth(5.9);
    this.note = this.add.container(0, 0, [plate, t]).setDepth(6);
    this.time.delayedCall(2200, () => this.note?.destroy());
  }

  // The stage list of a sea, at its highest open crown (or the one picked).
  showList(sea, { quiet = false } = {}) {
    if (!quiet) sfx.play('ui_open');
    const rec = this.progress.uncharted;
    this.sea = sea;
    this.crown = [3, 2, 1].find((c) => isCrownOpen(rec, sea, c)) ?? 1;
    const stages = SEAS[sea].stages;
    // The first stage not yet cleared at this crown (or the last).
    const next = stages.find((s) => bestCrown(rec, s) < this.crown && isStageOpen(rec, s, this.crown));
    this.selected = (next ?? stages[stages.length - 1]).id;
    this.drawList();
  }

  hideList() {
    sfx.play('ui_back');
    this.list.removeAll(true);
    this.sea = null;
  }

  drawList() {
    const rec = this.progress.uncharted;
    const { x, y, width: w, height: h, rowH } = UNCHARTED.list;
    const sea = SEAS[this.sea];
    const add = (...objs) => this.list.add(objs);
    this.list.removeAll(true);
    // Taps outside the panel close it.
    const shade = fillView(this, 0x000000, 0.35);
    shade.setInteractive().on('pointerdown', () => this.hideList());
    add(shade);
    const box = panel(this, x, y, w, h, 'parchment').setInteractive();
    add(box);
    add(text(this, x + 12, y + 14, sea.name.toUpperCase(), dark()).setOrigin(0, 0.5));
    const best = seaCrown(rec, this.sea);
    add(...crownRow(this, x + w - 12 - 22, y + 14, 3).map((c, i) => (i < best ? c : c.setTintFill(hexColor(UI.colors.subText)).setAlpha(0.5))));

    // Crown tabs.
    [1, 2, 3].forEach((crown, i) => {
      const open = isCrownOpen(rec, this.sea, crown);
      const tx = x + 12 + 22 + i * 50;
      const b = new Button(this, tx, y + 36, {
        width: 46, height: 16, label: '', style: crown === this.crown ? 'gold' : 'wood',
        onClick: () => this.pickCrown(crown),
      });
      b.setEnabled(open);
      add(b, ...crownRow(this, tx - (crown - 1) * 5.5, y + 36, crown).map((c) => (open ? c : c.setAlpha(0.4))));
    });

    // The rows.
    sea.stages.forEach((stage, i) => {
      const ry = y + 48 + i * rowH;
      const open = isStageOpen(rec, stage, this.crown);
      const cleared = bestCrown(rec, stage) >= this.crown;
      const selected = stage.id === this.selected;
      if (selected) add(this.add.rectangle(x + 6, ry, w - 12, rowH - 1, 0xf5d77a).setOrigin(0));
      const boss = isBossStage(stage) ? 'boss_' : '';
      add(nodeImage(this, x + 20, ry + 11, open ? `${boss}${cleared ? 'cleared' : 'open'}` : `${boss}locked`));
      const color = open ? UI.colors.textOnParchment : UI.colors.subText;
      add(text(this, x + 36, ry + 8, `${stage.index + 1}. ${stage.name}`, dark({ color })).setOrigin(0, 0.5));
      const earned = bestCrown(rec, stage);
      if (earned) add(...crownRow(this, x + 41, ry + 19, earned, 10));
      // Rules (and the Drowned Throne's current).
      const rules = stageRules(stage, this.crown);
      rules.forEach((id, k) => add(ruleIcon(this, x + COLS.rules + k * 14, ry + 11, id)));
      const current = stageCurrent(stage);
      if (current) {
        const order = this.cache.json.get(ABYSS_JSON_KEY)?.currents.order.map((c) => c.id) ?? [];
        add(this.add.image(x + COLS.rules + rules.length * 14, ry + 11, CURRENTS_KEY, order.indexOf(current)));
      }
      // Drops.
      const drops = isBossStage(stage) ? ['heart'] : stage.drops;
      drops.forEach((c, k) => add(itemIcon(this, x + COLS.drops + k * 14, ry + 11, c)));
      // Grog.
      add(itemIcon(this, x + COLS.grog, ry + 11, 'grog'));
      add(text(this, x + COLS.grog + 8, ry + 12, `${stageCost(stage, this.crown)}`, subText({ color })).setOrigin(0, 0.5));
      const hit = this.add.zone(x + 6, ry, w - 12, rowH - 1).setOrigin(0);
      tapArea(hit, w - 12, rowH - 1, { useHandCursor: true });
      hit.on('pointerdown', () => this.pick(stage.id));
      add(hit);
    });

    // The footer: the selected stage's rules, and SET SAIL.
    const stage = sea.stages.find((s) => s.id === this.selected);
    const lines = stageRules(stage, this.crown).map((id) => {
      const r = ruleOf(this, id);
      if (id === 'hourglass') return `${r.name}: Win within ${fmtClock(hourglassMs(stage))}`;
      return `${r.name}: ${r.text}`;
    });
    const current = stageCurrent(stage);
    if (current) {
      const c = this.cache.json.get(ABYSS_JSON_KEY)?.currents.order.find((o) => o.id === current);
      if (c) lines.push(`Current: ${c.name}`);
    }
    if (stage.hazard) lines.push(stage.hazard === 'lava' ? 'Lava bombs fall' : 'A blizzard blows all stage');
    if (!lines.length) lines.push('No special rules');
    lines.slice(0, 3).forEach((l, k) => add(text(this, x + 12, y + h - 26 + k * 9 - (lines.length > 2 ? 5 : 0), l.toUpperCase(), subText())));
    const cost = stageCost(stage, this.crown);
    const open = isStageOpen(rec, stage, this.crown);
    const enough = this.progress.grog >= cost;
    const sail = new Button(this, x + w - 56, y + h - 18, {
      width: 92, height: 24, style: 'gold', label: !open ? 'LOCKED' : enough ? 'SET SAIL' : `NEED ${cost}`,
      onClick: () => this.sail(stage),
    });
    add(sail.setEnabled(open && enough));
  }

  pickCrown(crown) {
    if (crown === this.crown) return;
    sfx.play('ui_click');
    this.crown = crown;
    this.drawList();
  }

  pick(id) {
    if (id === this.selected) return;
    sfx.play('ui_click');
    this.selected = id;
    this.drawList();
  }

  // On to the Muster for the selected stage (its Grog is spent on setting
  // sail from there).
  sail(stage) {
    sfx.play('wave_start');
    this.scene.stop();
    this.onSail?.(stage, this.crown);
  }

  // Android's back button: the list first, then the chart.
  back() {
    if (this.sea != null) this.hideList();
    else this.close();
  }

  close() {
    sfx.play('ui_back');
    this.scene.stop();
    this.onClose?.();
  }
}

