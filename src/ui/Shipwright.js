import { HEROES, SHIP, UPGRADES } from '../config.js';
import { Button } from './Button.js';
import { fmtNumber } from './format.js';
import { face, icon, dark, subText, text } from './kit.js';
import { ScrollPanel } from './ScrollPanel.js';

const BUY_W = 68;   // gold buy button, art pixels
const BUY_H = 19;

const fmt = (n) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

// The between-wave upgrade panel ("Shipwright"): hull HP, build deck, and a
// level-up row for each hero on the ship, each with a gold buy button. Rows
// read their text and cost from Progress, so refresh() is enough after gold or
// levels change; rebuild() when slots or the roster change.
export class Shipwright extends ScrollPanel {
  constructor(scene, x, y, width, progress, onPurchase) {
    super(scene, x, y, width, { title: 'SHIPWRIGHT' });
    this.progress = progress;
    this.onPurchase = onPurchase;
    this.rebuild();
  }

  rebuild() {
    const p = this.progress;
    const defs = [
      {
        art: (s) => icon(s, 6, 11, 'hull'),
        title: () => 'Hull',
        detail: () => `LV ${p.hullHpLevel}  +${UPGRADES.hullHp.hpPerLevel} HP`,
        cost: () => p.hullHpCost(),
        buy: () => p.buyHullHp(),
      },
      {
        art: (s) => icon(s, 6, 11, 'hammer'),
        title: () => 'Build deck',
        detail: () => `${p.decks} / ${SHIP.maxDecks}`,
        cost: () => p.deckCost(),
        buy: () => p.buildDeck(),
      },
      ...p.activeHeroes.map(({ id }) => ({
        art: (s) => face(s, 6, 11, id),
        title: () => HEROES[id].name,
        detail: () => (HEROES[id].aura
          ? `LV ${p.heroLevel(id)}  BUFF +${Math.round(p.heroAuraBonus(id) * 100)}%`
          : `LV ${p.heroLevel(id)}  DMG ${fmt(p.heroDamage(id))}`),
        cost: () => p.heroLevelCost(id),
        buy: () => p.levelHero(id),
      })),
    ];
    this.entries = defs.map((def) => this.createRow(def));
    this.setRows(this.entries.map((e) => e.row));
    this.refresh();
  }

  createRow(def) {
    const { scene } = this;
    const row = scene.add.container(0, 0);
    const title = text(scene, 16, -1, '', dark());
    const detail = text(scene, 16, 15, '', subText());
    const button = new Button(scene, this.innerWidth - (BUY_W / 2), (2 + BUY_H / 2), {
      width: BUY_W, height: BUY_H, style: 'gold', icon: 'gold', label: '',
      onClick: () => {
        if (def.buy()) this.onPurchase();
      },
    });
    row.add([def.art(scene), title, detail, button]);
    return { def, row, title, detail, button };
  }

  refresh() {
    for (const { def, title, detail, button } of this.entries) {
      const cost = def.cost();
      title.setText(def.title());
      detail.setText(def.detail());
      button.setIcon(cost == null ? null : 'gold');
      button.setLabel(cost == null ? 'MAX' : fmtNumber(cost));
      button.setEnabled(cost != null && this.progress.gold >= cost);
    }
  }
}
