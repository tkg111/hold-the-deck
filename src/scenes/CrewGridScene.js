import Phaser from 'phaser';
import { HEROES, PACKS, RARITY, UI_KIT } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, fillView } from '../display.js';
import * as Expeditions from '../systems/Expeditions.js';
import { Button } from '../ui/Button.js';
import { heroPortrait } from '../ui/HeroCard.js';
import { fmtClock, formatNum } from '../ui/format.js';
import {
  antiAirIcon, expeditionKey, hitsFlyers, icon, light, panel, starRow, subText, text, traitIcon, UI,
} from '../ui/kit.js';

const G = UI_KIT.crewGrid;
const TRAITS = ['fighter', 'sailor', 'scout', 'mystic', 'caretaker'];
const RARITIES = Object.keys(RARITY);
const SORTS = [
  { id: 'power', label: 'POWER' },
  { id: 'level', label: 'LEVEL' },
  { id: 'rarity', label: 'RARITY' },
];

// Who sails: every crewmate as a card in a scrolling grid (4-6 a row, as
// the view's width fits), over the battle between waves and at a stage's
// Muster. The crew on deck come first, each with a gold ON DECK ribbon and
// its slot number; the chosen slot's card is outlined. Tapping a card off
// the deck puts it in the chosen slot (swapping out whoever is there);
// tapping a card on deck chooses its slot and offers Remove. Filters (trait,
// rarity, owned / all, awakened) and the sort (power, level, rarity) are
// kept between openings. Launched with { progress, slot, onAssign(slot, id)
// (null: done; else { title, detail } saying why not), onClose }.
export class CrewGridScene extends Phaser.Scene {
  constructor() {
    super('CrewGridScene');
    this.filters = {
      trait: null, rarity: null, all: false, awakened: false,
    };
    this.sort = SORTS[0].id;
  }

  init({
    progress, slot, onAssign, onClose,
  }) {
    this.progress = progress;
    this.slot = slot;
    this.onAssign = onAssign;
    this.onClose = onClose;
    this.removeOffered = false;
    this.scrollY = 0;
  }

  create() {
    applyRenderScale(this);
    this.backdrop = fillView(this, 0x0d1117, 0.94);
    this.ui = this.add.container(0, 0);
    this.grid = this.add.container(0, 0);
    this.maskShape = this.make.graphics({ add: false });
    this.grid.setMask(this.maskShape.createGeometryMask());
    this.noticeBox = this.add.container(0, 0).setDepth(5).setVisible(false);
    this.build();
    this.events.on('view-resize', () => this.build());

    // Drag (past UI_KIT.dragThreshold) or wheel to scroll the grid.
    const at = (pointer) => this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.input.on('pointerdown', (pointer) => {
      const p = at(pointer);
      this.dragged = false;
      this.drag = this.inGrid(p) ? { y: p.y, from: this.scrollY } : null;
    });
    this.input.on('pointermove', (pointer) => {
      if (!this.drag || !pointer.isDown) return;
      const dy = at(pointer).y - this.drag.y;
      if (!this.dragged && Math.abs(dy) >= UI_KIT.dragThreshold) this.dragged = true;
      if (this.dragged) this.scrollTo(this.drag.from - dy);
    });
    const lift = () => { this.drag = null; };
    this.input.on('pointerup', lift);
    this.input.on('pointerupoutside', lift);
    this.input.on('wheel', (pointer, _over, _dx, dy) => {
      if (this.inGrid(at(pointer))) this.scrollTo(this.scrollY + Math.sign(dy) * (G.cardHeight + G.gap) / 2);
    });
    // Crew away on an expedition: their time left ticks down.
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.tickAway() });
  }

  // The view's safe area, and the grid's box in it.
  get area() {
    const { safe } = this.view;
    const left = Math.round(safe.left + G.margin - 6);
    const right = Math.round(safe.right - G.margin + 6);
    const top = Math.round(safe.top - 6);
    return {
      left, right, top, bottom: Math.round(safe.bottom), gridTop: top + G.gridTop, width: right - left,
    };
  }

  inGrid({ x, y }) {
    const a = this.area;
    return x >= a.left && x <= a.right && y >= a.gridTop && y <= a.bottom;
  }

  build() {
    this.drawHeader();
    this.drawGrid();
  }

  // --- Header: title and Done, then the filters and sort ---

  drawHeader() {
    const a = this.area;
    const p = this.progress;
    this.ui.removeAll(true);
    const add = (...objs) => this.ui.add(objs);
    const title = text(this, 0, a.top + 14, `WHO SAILS?  SLOT ${this.slot + 1}`, light()).setOrigin(0, 0.5);
    const plateW = title.inkWidth + 16;
    add(panel(this, a.left, a.top + 4, plateW, 20, 'wood'), title.setX(a.left + 8));
    const onDeck = p.activeHeroes.length;
    add(text(this, a.left + plateW + 8, a.top + 14, `ON DECK ${onDeck}/${p.slotCount}  -  ${p.ownedHeroes.length} CREW`, light({ font: 'small' })).setOrigin(0, 0.5));
    add(new Button(this, a.right - 26, a.top + 14, {
      width: 52, height: 20, style: 'gold', label: 'Done', onClick: () => this.close(),
    }));
    const sortLabel = SORTS.find((s) => s.id === this.sort).label;
    add(new Button(this, a.right - 52 - 6 - 44, a.top + 14, {
      width: 88, height: 20, font: 'small', label: `SORT: ${sortLabel}`, onClick: () => this.cycleSort(),
    }));

    // Filters: All + a chip per trait, a chip per rarity, owned / all,
    // awakened.
    const F = G.filters;
    const y = a.top + F.y;
    let x = a.left;
    const chip = (width, on, onClick, content) => {
      const b = new Button(this, x + width / 2, y, {
        width, height: 18, style: on ? 'gold' : 'wood', font: 'small', label: typeof content === 'string' ? content : '', onClick,
      });
      if (content && typeof content !== 'string') b.content.add(content);
      x += width + F.chipGap;
      add(b);
      return b;
    };
    const f = this.filters;
    chip(F.chip + 6, f.trait == null, () => this.setFilter('trait', null), 'ALL');
    for (const trait of TRAITS) chip(F.chip, f.trait === trait, () => this.setFilter('trait', trait), traitIcon(this, 0, 0, trait));
    x += F.groupGap;
    for (const r of RARITIES) {
      const letter = text(this, 0, 0, RARITY[r].label[0], light({ font: 'small', color: `#${RARITY[r].color.toString(16).padStart(6, '0')}` })).setOrigin(0.5);
      chip(F.chip, f.rarity === r, () => this.setFilter('rarity', f.rarity === r ? null : r), letter);
    }
    x += F.groupGap;
    chip(48, f.all, () => this.setFilter('all', !f.all), f.all ? 'ALL' : 'OWNED');
    if (p.unchartedUnlocked) chip(60, f.awakened, () => this.setFilter('awakened', !f.awakened), 'AWAKENED');
  }

  setFilter(key, value) {
    if (this.filters[key] === value) return;
    this.filters[key] = value;
    this.scrollY = 0;
    this.build();
  }

  cycleSort() {
    const i = SORTS.findIndex((s) => s.id === this.sort);
    this.sort = SORTS[(i + 1) % SORTS.length].id;
    this.scrollY = 0;
    this.drawGrid();
    this.drawHeader();
  }

  // --- The cards ---

  // The crew to show, on deck first (in slot order), then by the sort.
  get ids() {
    const p = this.progress;
    const f = this.filters;
    const pool = f.all ? Object.keys(HEROES) : [...p.ownedHeroes];
    const shown = pool.filter((id) => (f.trait == null || Expeditions.traitOf(id) === f.trait)
      && (f.rarity == null || HEROES[id].rarity === f.rarity)
      && (!f.awakened || p.isAwakened(id)));
    const deck = (id) => {
      const s = p.slotOf(id);
      return s >= 0 && s < p.slotCount ? s : Infinity;
    };
    const key = {
      power: (id) => (p.isOwned(id) ? p.heroDamage(id) || p.heroAuraBonus(id) * 1e-9 : -1),
      level: (id) => (p.isOwned(id) ? p.heroLevel(id) : -1),
      rarity: (id) => RARITIES.indexOf(HEROES[id].rarity) + (p.isOwned(id) ? 0.5 : 0),
    }[this.sort];
    return shown.sort((a, b) => deck(a) - deck(b) || key(b) - key(a) || HEROES[a].name.localeCompare(HEROES[b].name));
  }

  get layout() {
    const a = this.area;
    const cols = Phaser.Math.Clamp(Math.floor((a.width + G.gap) / (G.minCardWidth + G.gap)), G.cols[0], G.cols[1]);
    const w = Math.floor((a.width - (cols - 1) * G.gap) / cols);
    return { cols, w, h: G.cardHeight };
  }

  drawGrid() {
    const a = this.area;
    this.grid.removeAll(true);
    this.awayLabels = [];
    this.maskShape.clear().fillStyle(0xffffff).fillRect(a.left - 2, a.gridTop - 2, a.width + 4, a.bottom - a.gridTop + 2);
    const { cols, w, h } = this.layout;
    const ids = this.ids;
    ids.forEach((id, i) => {
      const x = a.left + (i % cols) * (w + G.gap);
      const y = a.gridTop + Math.floor(i / cols) * (h + G.gap);
      this.grid.add(this.card(id, x, y, w, h));
    });
    if (!ids.length) {
      this.grid.add(text(this, a.left + a.width / 2, a.gridTop + 30, 'NO CREW MATCH THESE FILTERS', light({ font: 'small' })).setOrigin(0.5));
    }
    const rows = Math.ceil(ids.length / cols);
    this.contentHeight = rows * (h + G.gap) - G.gap;
    this.scrollTo(this.scrollY);
  }

  scrollTo(y) {
    const a = this.area;
    const max = Math.max(0, (this.contentHeight ?? 0) - (a.bottom - a.gridTop) + 2);
    this.scrollY = Phaser.Math.Clamp(Math.round(y), 0, max);
    this.grid.setY(-this.scrollY);
  }

  // One card at (x, y), w x h: the crewmate's sprite, trait, name, level,
  // stars and power, its border in the rarity's colour; an ON DECK ribbon
  // with the slot number; the chosen slot's outline (and Remove).
  card(id, x, y, w, h) {
    const p = this.progress;
    const def = HEROES[id];
    const owned = p.isOwned(id);
    const slot = p.slotOf(id);
    const onDeck = owned && slot >= 0 && slot < p.slotCount;
    const entry = owned ? Expeditions.entryOf(p, id) : null;
    const awake = owned && p.isAwakened(id);
    const c = this.add.container(x, y);
    c.add(this.add.rectangle(-1, -1, w + 2, h + 2).setOrigin(0).setStrokeStyle(1, RARITY[def.rarity].color));
    c.add(panel(this, 0, 0, w, h, owned ? 'parchment' : 'wood'));
    // The name across the top (the trait icon at its right), the sprite
    // under it on the left, level, stars and power beside it.
    c.add(heroPortrait(this, id, 47, 1, !owned, awake).setX(19));
    if (!owned) {
      c.add(text(this, 4, 3, '???', light({ font: 'small' })));
      c.add(text(this, 38, 20, RARITY[def.rarity].label.toUpperCase(), light({ font: 'small', color: UI.colors.subText })));
      return this.tappable(c, id, w, h);
    }
    c.add(traitIcon(this, w - 9, 8, Expeditions.traitOf(id)));
    const marks = hitsFlyers(def) ? 26 : 14;
    if (hitsFlyers(def)) c.add(antiAirIcon(this, w - 21, 8));
    const name = text(this, 4, 3, def.name.toUpperCase(), subText({ color: UI.colors.textOnParchment }));
    if (name.inkWidth > w - 6 - marks) name.setText(def.shortName.toUpperCase());
    c.add(name);
    c.add(text(this, 38, 15, `LV ${formatNum(p.heroLevel(id))}`, subText({ color: UI.colors.textOnParchment })));
    c.add(starRow(this, 38 + 14, 27, p.heroStarCount(id), PACKS.maxStars));
    const power = def.aura ? `BUFF +${Math.round(p.heroAuraBonus(id) * 100)}%` : `DMG ${formatNum(p.heroDamage(id))}`;
    c.add(text(this, 38, 32, power, subText()));
    if (awake) c.add(text(this, 38, 40, 'AWAKENED', subText({ color: '#b8860b' })));

    const muster = !p.stage || p.mayMuster(id);
    if (entry) {
      c.setAlpha(0.6);
      c.add(this.add.rectangle(2, h - 13, w - 4, 11, 0x000000, 0.6).setOrigin(0));
      c.add(icon(this, 9, h - 8, expeditionKey('icon_hourglass')));
      const label = text(this, 17, h - 8, awayLabel(entry), light({ font: 'small' })).setOrigin(0, 0.5);
      c.add(label);
      this.awayLabels.push({ label, entry });
    } else if (!muster) {
      c.setAlpha(0.55);
      c.add(text(this, w / 2, h - 7, 'NOT ALLOWED', subText({ color: UI.colors.warn })).setOrigin(0.5));
    }
    if (onDeck) {
      const R = G.ribbon;
      c.add(this.add.rectangle(0, h - R.height, w, R.height, R.color).setOrigin(0));
      c.add(text(this, w / 2, h - R.height / 2, `ON DECK ${slot + 1}`, subText()).setOrigin(0.5));
    }
    if (onDeck && slot === this.slot) {
      c.add(this.add.rectangle(-1, -1, w + 2, h + 2).setOrigin(0).setStrokeStyle(3, G.selectedColor));
    }
    this.tappable(c, id, w, h);
    if (onDeck && slot === this.slot && this.removeOffered) {
      c.add(new Button(this, w / 2, h / 2 + 4, {
        width: Math.min(72, w - 8), height: 18, label: 'Remove', onRelease: true, onClick: () => this.assign(null),
      }));
    }
    return c;
  }

  tappable(c, id, w, h) {
    const zone = this.add.zone(0, 0, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
    zone.on('pointerup', (pointer) => {
      const at = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      if (this.dragged || !this.inGrid(at)) return;
      this.tap(id);
    });
    c.add(zone);
    return c;
  }

  tickAway() {
    if (!this.awayLabels?.length) return;
    Expeditions.tick(this.progress);
    for (const { label, entry } of this.awayLabels) label.setText(awayLabel(entry));
  }

  // A card tapped: one on deck picks its slot (and offers Remove, or takes
  // the offer back); any other is put in the chosen slot.
  tap(id) {
    const p = this.progress;
    if (!p.isOwned(id)) {
      sfx.play('ui_error');
      this.notice('NOT IN YOUR CREW YET', 'FIND THEM IN CHESTS AND STAGES');
      return;
    }
    const entry = Expeditions.entryOf(p, id);
    if (entry) {
      sfx.play('ui_error');
      this.notice('ON AN EXPEDITION', awayLabel(entry));
      return;
    }
    const slot = p.slotOf(id);
    if (slot >= 0 && slot < p.slotCount) {
      sfx.play('ui_click');
      this.removeOffered = slot === this.slot ? !this.removeOffered : true;
      this.slot = slot;
      this.build();
      return;
    }
    this.assign(id);
  }

  // Put id (null: nobody) in the chosen slot. Filling an empty slot moves
  // the choice on to the next empty one.
  assign(id) {
    const p = this.progress;
    const wasEmpty = !p.slots[this.slot];
    const why = this.onAssign(this.slot, id);
    if (why) {
      sfx.play('ui_error');
      this.notice(why.title, why.detail);
      return;
    }
    sfx.play(id ? 'buy' : 'ui_back');
    this.removeOffered = false;
    if (id && wasEmpty) {
      const next = p.slots.slice(0, p.slotCount).indexOf(null);
      if (next >= 0) this.slot = next;
    }
    this.build();
  }

  // A short wood banner over the grid.
  notice(title, detail) {
    const a = this.area;
    const box = this.noticeBox;
    box.removeAll(true);
    const t1 = text(this, 0, 0, title, light({ color: UI.colors.warn })).setOrigin(0.5, 0);
    const t2 = detail ? text(this, 0, t1.inkHeight + 4, detail, light({ font: 'small' })).setOrigin(0.5, 0) : null;
    const w = Math.max(t1.inkWidth, t2?.inkWidth ?? 0) + 16;
    const hh = t1.inkHeight + (t2 ? t2.inkHeight + 4 : 0) + 12;
    box.add([panel(this, -w / 2, -6, w, hh, 'wood'), t1, t2].filter(Boolean));
    box.setPosition(Math.round(a.left + a.width / 2), a.gridTop + 24).setVisible(true).setAlpha(1);
    this.tweens.killTweensOf(box);
    this.tweens.add({ targets: box, alpha: 0, delay: G.noticeMs, duration: 300, onComplete: () => box.setVisible(false) });
  }

  back() { this.close(); }

  close() {
    sfx.play('ui_back');
    this.scene.stop();
    this.onClose?.();
  }
}

// "BACK IN 1:23:45", or that it's back and waiting.
function awayLabel(entry) {
  return Expeditions.isReturned(entry) ? 'BACK - COLLECT' : `BACK IN ${fmtClock(Expeditions.timeLeft(entry))}`;
}
