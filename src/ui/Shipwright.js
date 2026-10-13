import { HEROES, SHIP, UI_KIT } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { Button } from './Button.js';
import { formatNum } from './format.js';
import {
  dark, face, glyph, glyphWidth, icon, nineSlice, subText, text, UI,
} from './kit.js';
import { ScrollPanel } from './ScrollPanel.js';
import { materialIcon } from './parts.js';
import { PART_DATA, partOf } from '../systems/Parts.js';

const TAB_LABELS = { ship: 'Ship', crew: 'Crew' };
const AMOUNT_LABELS = { 1: 'x1', 10: 'x10', max: 'MAX' };
// Room the scrollbar takes inside the parchment's right margin.
const BAR_ROOM = 4;

// The between-wave upgrade panel ("Shipwright"), in two tabs: Ship (a Parts
// row that opens the Shipyard, hull HP, build deck) and Crew (the crew on the ship in slot order, then everyone
// else). Each row shows its level, what the next buy changes ("DMG 1.07K
// -> 1.12K") and a gold buy button for progress.buyAmount levels (x1, x10 or
// MAX, the toggle in the header): disabled with a red price when it's out of
// reach, a green arrow by the name when it isn't. Maxed rows sink to the
// bottom, dimmed. The handle on its left edge slides it off the right of the
// view and back (progress.shipwrightOpen), and shows the arrow too when
// anything in either tab is affordable. Rows read Progress, so refresh() is
// enough after gold or levels change; rebuild() when the crew changes.
export class Shipwright extends ScrollPanel {
  constructor(scene, x, y, progress, { onPurchase, onSettingChange, onOpenShipyard }) {
    const header = UI_KIT.shipwrightHeader;
    super(scene, x, y, UI_KIT.shipwrightWidth, { title: 'SHIPWRIGHT', headerHeight: header.height });
    this.progress = progress;
    this.onPurchase = onPurchase;
    this.onSettingChange = onSettingChange;
    this.onOpenShipyard = onOpenShipyard;
    this.tab = 'crew';
    this.entries = [];
    this.anchor = null;
    this.createHeader();
    this.createHandle();
    // A drag that starts on a buy button scrolls instead of buying.
    this.on('drag-start', () => this.entries.forEach((e) => e.button.cancelPress()));
    this.rebuild();
  }

  get listWidth() { return this.innerWidth - BAR_ROOM; }

  // Ship / Crew tabs on the left, the buy amount toggle on the right.
  createHeader() {
    const { scene } = this;
    const { buttonHeight: h, tabWidth, amountWidths } = UI_KIT.shipwrightHeader;
    const y = Math.floor(h / 2) - 1;
    this.tabButtons = Object.entries(TAB_LABELS).map(([tab, label], i) => {
      const b = new Button(scene, i * (tabWidth + 2) + tabWidth / 2, y, {
        width: tabWidth, height: h, font: 'small', label,
        onClick: () => this.setTab(tab),
      });
      b.tab = tab;
      return b;
    });
    let right = this.listWidth;
    this.amountButtons = [...UI_KIT.buyAmounts].reverse().map((amount, i) => {
      const w = amountWidths[amountWidths.length - 1 - i];
      const b = new Button(scene, right - w / 2, y, {
        width: w, height: h, font: 'small', label: AMOUNT_LABELS[amount],
        onClick: () => this.setAmount(amount),
      });
      right -= w + 2;
      b.amount = amount;
      return b;
    });
    this.header.add([...this.tabButtons, ...this.amountButtons]);
    this.paintHeader();
  }

  paintHeader() {
    for (const b of this.tabButtons) b.setStyle(b.tab === this.tab ? 'gold' : 'wood');
    for (const b of this.amountButtons) b.setStyle(b.amount === this.progress.buyAmount ? 'gold' : 'wood');
  }

  setTab(tab) {
    if (tab === this.tab) return;
    sfx.click();
    this.tab = tab;
    this.offset = 0;
    this.paintHeader();
    this.rebuild();
  }

  setAmount(amount) {
    if (amount === this.progress.buyAmount) return;
    sfx.click();
    this.progress.buyAmount = amount;
    this.paintHeader();
    this.refresh();
    this.onSettingChange();
  }

  // The handle: a small wood tab half under the parchment's left edge.
  createHandle() {
    const { scene } = this;
    const { width: w, height: h, y } = UI_KIT.shipwrightHandle;
    const x = -w + 3;
    this.handleBg = nineSlice(scene, x, y, w, h, 'btn_wood_normal');
    this.handleBg.setInteractive({ useHandCursor: true });
    this.handleBg.on('pointerdown', () => this.toggleOpen());
    const cx = x + Math.floor((w - 3) / 2);
    this.handleArrows = {
      right: glyph(scene, cx, y + 9, 'right', UI.colors.text),
      left: glyph(scene, cx, y + 9, 'left', UI.colors.text),
    };
    this.handleAfford = glyph(scene, cx, y + 20, 'up', UI_KIT.affordColor);
    this.handle = scene.add.container(0, 0, [this.handleBg, this.handleArrows.right, this.handleArrows.left, this.handleAfford]);
    // Behind the parchment, which overlaps its right edge.
    this.addAt(this.handle, 0);
  }

  // Where the panel sits out (openX) and slid away (closedX: just the
  // handle showing at the view's right edge), from the scene's layout.
  setAnchor(openX, closedX, y) {
    this.anchor = { openX, closedX, y };
    this.scene.tweens.killTweensOf(this);
    this.setPosition(this.progress.shipwrightOpen ? openX : closedX, y);
    this.paintHandle();
  }

  toggleOpen() {
    const p = this.progress;
    p.shipwrightOpen = !p.shipwrightOpen;
    sfx.click();
    this.paintHandle();
    this.scene.tweens.killTweensOf(this);
    if (this.anchor) {
      this.scene.tweens.add({
        targets: this,
        x: p.shipwrightOpen ? this.anchor.openX : this.anchor.closedX,
        duration: UI_KIT.shipwrightHandle.slideMs,
        ease: 'Sine.easeInOut',
        onUpdate: () => this.setX(Math.round(this.x)),
      });
    }
    this.onSettingChange();
  }

  paintHandle() {
    const open = this.progress.shipwrightOpen;
    this.handleArrows.right.setVisible(open);
    this.handleArrows.left.setVisible(!open);
  }

  // Row definitions for a tab. Each: art, name (and a shorter one for tight
  // rows), level label, costAt(k) (the k-th next level, null past the cap),
  // stat(count): [label, now, after count more] (or a plain line when maxed),
  // and buyOne(). Or, for a row that opens a screen instead (Parts): open()
  // and affordable() (the green arrow).
  defs(tab) {
    const p = this.progress;
    if (tab === 'ship') {
      const equipped = () => Object.values(p.equipped).filter((id) => partOf(id)).length;
      return [
        {
          art: (s) => materialIcon(s, 6, 11, PART_DATA.materials[0]?.id),
          name: 'Parts',
          level: () => `${equipped()}/${PART_DATA.slots.length}`,
          stat: () => (equipped() ? `${equipped()} ON THE SHIP - TAP OPEN` : 'MADE FROM BOSS MATERIALS'),
          open: () => this.onOpenShipyard?.(),
          affordable: () => p.anyPartAffordable,
        },
        {
          art: (s) => icon(s, 6, 11, 'hull'),
          name: 'Hull',
          level: () => `LV ${formatNum(p.hullHpLevel)}`,
          costAt: (k) => p.hullHpCost(p.hullHpLevel + k),
          stat: (n) => ['HP', formatNum(p.hullMaxHp), formatNum(p.hullMaxHpAt(p.hullHpLevel + n))],
          buyOne: () => p.buyHullHp(),
        },
        {
          art: (s) => icon(s, 6, 11, 'hammer'),
          name: 'Build deck',
          level: () => `${p.decks}/${SHIP.maxDecks}`,
          costAt: (k) => p.deckCost(p.decks + k),
          stat: (n) => (n > 0
            ? ['SLOTS', `${p.decks * SHIP.slotsPerDeck}`, `${(p.decks + n) * SHIP.slotsPerDeck}`]
            : 'ALL DECKS BUILT'),
          buyOne: () => p.buildDeck(),
        },
      ];
    }
    const onDeck = p.activeHeroes.map(({ id }) => id);
    const crew = [...onDeck, ...p.ownedHeroes.filter((id) => !onDeck.includes(id))];
    return crew.map((id) => {
      const def = HEROES[id];
      const lv = () => p.heroLevel(id);
      return {
        art: (s) => face(s, 6, 11, id),
        name: def.name,
        short: def.shortName,
        level: () => `LV ${formatNum(lv())}`,
        costAt: (k) => p.heroLevelCost(id, lv() + k),
        stat: (n) => (def.aura
          ? ['BUFF', `+${Math.round(p.heroAuraBonus(id) * 100)}%`, `+${Math.round(p.heroAuraBonus(id, lv() + n) * 100)}%`]
          : ['DMG', formatNum(p.heroDamage(id)), formatNum(p.heroDamage(id, lv() + n))]),
        buyOne: () => p.levelHero(id),
      };
    });
  }

  rebuild() {
    const defs = this.defs(this.tab);
    // Maxed rows last (in their order).
    const maxed = (d) => !d.open && d.costAt(0) == null;
    defs.sort((a, b) => maxed(a) - maxed(b));
    this.entries = defs.map((def) => this.createRow(def));
    this.setRows(this.entries.map((e) => e.row));
    this.refresh();
  }

  createRow(def) {
    const { scene } = this;
    const { width: bw, height: bh } = UI_KIT.buyButton;
    const row = scene.add.container(0, 0);
    const name = text(scene, 16, -1, '', dark());
    const level = text(scene, 0, 3, '', subText());
    const afford = glyph(scene, 0, 5, 'up', UI_KIT.affordColor);
    const statFrom = text(scene, 16, 15, '', subText());
    const statArrow = glyph(scene, 0, 17, 'arrow', UI.colors.subText);
    const statTo = text(scene, 0, 15, '', subText());
    const entry = { def, row, name, level, afford, statFrom, statArrow, statTo };
    entry.button = new Button(scene, this.listWidth - bw / 2, 2 + bh / 2, def.open
      ? { width: bw, height: bh, label: 'Open', onRelease: true, onClick: () => def.open() }
      : {
        width: bw, height: bh, style: 'gold', icon: 'gold', label: '', onRelease: true,
        onClick: () => this.buy(entry),
      });
    row.add([def.art(scene), name, level, afford, statFrom, statArrow, statTo, entry.button]);
    return entry;
  }

  // Buy the planned levels (all of them were affordable when planned).
  buy(entry) {
    const { count } = this.progress.bulkPlan(entry.def.costAt);
    let bought = 0;
    while (bought < count && entry.def.buyOne()) bought++;
    if (bought === 0) return;
    // Something may have just maxed out (the last deck): re-sort.
    if (entry.def.costAt(0) == null) this.rebuild();
    this.onPurchase();
  }

  // An entry's plan and whether it's affordable now (an Open row: whether
  // there's something to buy behind it).
  planOf(def) {
    if (def.open) return { count: 1, cost: 0, affordable: def.affordable() };
    const plan = this.progress.bulkPlan(def.costAt);
    return { ...plan, affordable: plan.count > 0 && plan.cost <= this.progress.gold };
  }

  // Anything in either tab affordable (the handle's arrow).
  get anyAffordable() {
    return ['ship', 'crew'].some((tab) => this.defs(tab).some((def) => this.planOf(def).affordable));
  }

  refresh() {
    const room = this.listWidth - UI_KIT.buyButton.width - 4;
    for (const e of this.entries) {
      const { def, button } = e;
      const plan = this.planOf(def);
      const maxed = plan.count === 0;
      e.row.setAlpha(maxed ? UI_KIT.maxedRowAlpha : 1);

      // Name, level and the green arrow; the short name if they don't fit.
      const levelGap = 4;
      const arrowW = plan.affordable ? glyphWidth('up') + 3 : 0;
      e.level.setText(def.level());
      e.name.setText(def.name);
      if (def.short && 16 + e.name.inkWidth + levelGap + e.level.inkWidth + arrowW > room) e.name.setText(def.short);
      e.level.setX(16 + e.name.inkWidth + levelGap);
      e.afford.setVisible(plan.affordable).setX(e.level.x + e.level.inkWidth + 3);

      // "DMG 1.07K -> 1.12K", or a plain line.
      const stat = def.stat(plan.count);
      if (typeof stat === 'string') {
        e.statFrom.setText(stat);
        e.statArrow.setVisible(false);
        e.statTo.setVisible(false);
      } else {
        const [label, now, after] = stat;
        e.statFrom.setText(`${label} ${now}`);
        const ax = 16 + e.statFrom.inkWidth + 3;
        e.statArrow.setVisible(true).setX(ax);
        e.statTo.setVisible(true).setText(after).setX(ax + glyphWidth('arrow') + 3);
      }

      // The buy button: "x7 21.4M" (just the price at x1), or MAX.
      if (def.open) {
        continue;
      } else if (maxed) {
        button.setIcon(null).setLabel('MAX').setLabelColor(null);
      } else {
        const price = formatNum(plan.cost);
        button.setIcon('gold').setLabel(this.progress.buyAmount === '1' ? price : `x${plan.count} ${price}`)
          .setLabelColor(plan.affordable ? null : UI.colors.warn);
      }
      button.setEnabled(plan.affordable);
    }
    this.handleAfford.setVisible(this.anyAffordable);
  }
}
