import Phaser from 'phaser';
import { HEROES, HOUSE, UPGRADES } from '../config.js';
import { Button } from './Button.js';

const WIDTH = 380;
const ROW_HEIGHT = 62;
const HEADER = 46;

const fmt = (n) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

// Between-wave upgrade screen. Each row reads its text and cost from Progress,
// so refresh() is all that's needed after gold or levels change.
export class UpgradePanel extends Phaser.GameObjects.Container {
  constructor(scene, x, y, progress, onPurchase) {
    super(scene, x, y);
    this.progress = progress;
    this.onPurchase = onPurchase;

    const p = progress;
    const defs = [
      {
        title: () => `House HP  ·  Lv ${p.houseHpLevel}`,
        detail: () => `Max HP ${p.houseMaxHp} → ${p.houseMaxHp + UPGRADES.houseHp.hpPerLevel}`,
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
      ...Object.keys(p.heroLevels).map((id) => ({
        title: () => `${HEROES[id].name}  ·  Lv ${p.heroLevels[id]}`,
        detail: () => `Damage ${fmt(p.heroDamage(id))} → ${fmt(p.heroDamage(id, p.heroLevels[id] + 1))}`,
        cost: () => p.heroLevelCost(id),
        buy: () => p.levelHero(id),
      })),
    ];

    const height = HEADER + defs.length * ROW_HEIGHT + 8;
    this.add(scene.add.rectangle(0, 0, WIDTH, height, 0x1b1f2a, 0.85)
      .setOrigin(0).setStrokeStyle(2, 0xffffff, 0.2));
    this.add(scene.add.text(16, 12, 'Upgrades', {
      fontFamily: 'sans-serif', fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
    }));

    this.rows = defs.map((def, i) => this.createRow(def, HEADER + i * ROW_HEIGHT));
    scene.add.existing(this);
    this.refresh();
  }

  createRow(def, y) {
    const title = this.scene.add.text(16, y + 8, '', {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#ffffff',
    });
    const detail = this.scene.add.text(16, y + 30, '', {
      fontFamily: 'sans-serif', fontSize: '13px', color: '#b0bec5',
    });
    const button = new Button(this.scene, WIDTH - 70, y + 26, {
      width: 112, height: 36, label: '', color: 0xc9a227, fontSize: '15px',
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
