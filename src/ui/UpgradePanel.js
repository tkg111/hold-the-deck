import Phaser from 'phaser';
import { HEROES, HOUSE, UPGRADES } from '../config.js';
import { Button } from './Button.js';
import { starLabel } from './format.js';

const WIDTH = 380;
const ROW_HEIGHT = 44;
const HEADER = 42;

const fmt = (n) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));
const pct = (n) => `+${Math.round(n * 100)}%`;

// Between-wave upgrade screen. Each row reads its text and cost from Progress,
// so refresh() is all that's needed after gold or levels change. Only heroes
// placed on the house get a level-up row (the full roster wouldn't fit);
// rebuild() whenever slots or the roster change.
export class UpgradePanel extends Phaser.GameObjects.Container {
  constructor(scene, x, y, progress, onPurchase) {
    super(scene, x, y);
    this.progress = progress;
    this.onPurchase = onPurchase;
    scene.add.existing(this);
    this.rebuild();
  }

  // Recreate all rows, e.g. when slots or the owned hero roster change.
  rebuild() {
    this.removeAll(true);
    const { scene } = this;
    const p = this.progress;
    const defs = [
      {
        title: () => `House HP  ·  Lv ${p.houseHpLevel}`,
        detail: () => `Max HP ${p.houseMaxHp} → ${p.houseMaxHpAt(p.houseHpLevel + 1)}`,
        cost: () => p.houseHpCost(),
        buy: () => p.buyHouseHp(),
      },
      {
        title: () => `Build Floor  ·  ${p.floors}/${HOUSE.maxFloors}`,
        detail: () => (p.canBuildFloor
          ? `+${HOUSE.slotsPerFloor} hero slots, +${UPGRADES.floor.hpPerFloor} max HP`
          : 'Fully built'),
        cost: () => p.floorCost(),
        buy: () => p.buildFloor(),
      },
      ...p.activeHeroes.map(({ id }) => ({
        title: () => {
          const stars = starLabel(p.heroStarCount(id));
          return `${HEROES[id].name}  ·  Lv ${p.heroLevel(id)}${stars ? `  ${stars}` : ''}`;
        },
        detail: () => (HEROES[id].aura
          ? `Floor buff ${pct(p.heroAuraBonus(id))} → ${pct(p.heroAuraBonus(id, p.heroLevel(id) + 1))} damage`
          : `Damage ${fmt(p.heroDamage(id))} → ${fmt(p.heroDamage(id, p.heroLevel(id) + 1))}`),
        cost: () => p.heroLevelCost(id),
        buy: () => p.levelHero(id),
      })),
    ];

    const height = HEADER + defs.length * ROW_HEIGHT + 8;
    this.add(scene.add.rectangle(0, 0, WIDTH, height, 0x1b1f2a, 0.85)
      .setOrigin(0).setStrokeStyle(2, 0xffffff, 0.2));
    this.add(scene.add.text(16, 10, 'Upgrades', {
      fontFamily: 'sans-serif', fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
    }));
    this.add(scene.add.text(WIDTH - 16, 16, 'heroes on the house', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#78909c',
    }).setOrigin(1, 0));

    this.rows = defs.map((def, i) => this.createRow(def, HEADER + i * ROW_HEIGHT));
    this.refresh();
  }

  createRow(def, y) {
    const title = this.scene.add.text(16, y + 3, '', {
      fontFamily: 'sans-serif', fontSize: '15px', color: '#ffffff',
    });
    const detail = this.scene.add.text(16, y + 22, '', {
      fontFamily: 'sans-serif', fontSize: '12px', color: '#b0bec5',
    });
    const button = new Button(this.scene, WIDTH - 70, y + 20, {
      width: 112, height: 30, label: '', color: 0xc9a227, fontSize: '14px',
      onClick: () => {
        if (def.buy()) this.onPurchase();
      },
    });
    this.add([title, detail, button]);
    return { def, title, detail, button };
  }

  refresh() {
    for (const { def, title, detail, button } of this.rows) {
      const cost = def.cost();
      title.setText(def.title());
      detail.setText(def.detail());
      button.setLabel(cost == null ? 'MAX' : `${cost} gold`);
      button.setEnabled(cost != null && this.progress.gold >= cost);
    }
  }
}
