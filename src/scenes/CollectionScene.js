import Phaser from 'phaser';
import { ABILITIES, DISPLAY, HEROES, RARITY } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, fillView } from '../display.js';
import { Button } from '../ui/Button.js';
import { createHeroCard, HERO_CARD_SIZE } from '../ui/HeroCard.js';
import { cooldownLabel, describeAbility } from '../ui/HeroPicker.js';
import { dark, light, panel, subText, text } from '../ui/kit.js';

const MAX_PER_ROW = 5;
const PER_PAGE = 10;   // two rows; more turn the page
const GAP = 6;
const GRID_TOP = 28;

// Overlay listing every hero (the "collection book"): owned ones as parchment
// cards with level and stars, the rest as black silhouettes on wood, ten to
// a page (arrows either side of the title plate turn it). Clicking an owned card shows it
// large next to its ability.
// Launched with { progress, onClose }.
export class CollectionScene extends Phaser.Scene {
  constructor() {
    super('CollectionScene');
  }

  init({ progress, onClose }) {
    this.progress = progress;
    this.onClose = onClose;
    this.page = 0;
  }

  create() {
    applyRenderScale(this);
    const p = this.progress;
    // Grouped by rarity, Common first.
    const rarityOrder = Object.keys(RARITY);
    const ids = Object.keys(HEROES)
      .sort((a, b) => rarityOrder.indexOf(HEROES[a].rarity) - rarityOrder.indexOf(HEROES[b].rarity));
    const owned = ids.filter((id) => p.isOwned(id));
    const cx = DISPLAY.width / 2;

    fillView(this, 0x0d1117, 0.9);
    panel(this, cx - 70, 4, 140, 20, 'wood');
    text(this, cx, 14, 'CREW ROSTER', light()).setOrigin(0.5);
    text(this, cx + (ids.length > PER_PAGE ? 96 : 76), 14, `${owned.length}/${ids.length} FOUND`, { font: 'small', ...light() })
      .setOrigin(0, 0.5);
    if (owned.length) {
      text(this, 8, 14, 'CLICK A CARD', { font: 'small', ...light() }).setOrigin(0, 0.5);
    }

    this.ids = ids;
    this.pages = Math.ceil(ids.length / PER_PAGE);
    this.grid = this.add.container(0, 0);
    if (this.pages > 1) {
      const arrow = (x, step, angle) => {
        const b = new Button(this, x, 14, {
          width: 18, height: 18, icon: 'arrow_up', onClick: () => this.turnPage(step),
        });
        b.icon.setAngle(angle);
        return b;
      };
      this.prevButton = arrow(cx - 82, -1, -90);
      this.nextButton = arrow(cx + 82, 1, 90);
    }
    this.drawPage();

    new Button(this, DISPLAY.width - 30, 14, {
      width: 48, height: 20, label: 'Back', onClick: () => this.close(),
    });
  }

  turnPage(step) {
    const page = Phaser.Math.Clamp(this.page + step, 0, this.pages - 1);
    if (page === this.page) return;
    sfx.click();
    this.page = page;
    this.drawPage();
  }

  // This page's cards, in rows of up to five.
  drawPage() {
    const p = this.progress;
    const cx = DISPLAY.width / 2;
    const { width: w, height: h } = HERO_CARD_SIZE.small;
    const ids = this.ids.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE);
    this.grid.removeAll(true);
    ids.forEach((id, i) => {
      const row = Math.floor(i / MAX_PER_ROW);
      const inRow = Math.min(MAX_PER_ROW, ids.length - row * MAX_PER_ROW);
      const col = i % MAX_PER_ROW;
      const rowWidth = inRow * w + (inRow - 1) * GAP;
      const x = cx - rowWidth / 2 + w / 2 + col * (w + GAP);
      const y = GRID_TOP + h / 2 + row * (h + GAP);
      this.grid.add(createHeroCard(this, x, y, id, p.isOwned(id)
        ? { size: 'small', stars: p.heroStarCount(id), bonus: p.heroBonusLevels(id), level: p.heroLevel(id) }
        : { size: 'small', silhouette: true }));
      if (p.isOwned(id)) {
        this.grid.add(this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.showDetail(id)));
      }
    });
    this.prevButton?.setEnabled(this.page > 0);
    this.nextButton?.setEnabled(this.page < this.pages - 1);
  }

  // The hero's large card and a parchment panel with its ability; a click
  // anywhere closes it.
  showDetail(id) {
    sfx.click();
    const p = this.progress;
    const cx = DISPLAY.width / 2;
    const cy = DISPLAY.height / 2;
    const backdrop = fillView(this, 0x0d1117, 0.85);
    const card = createHeroCard(this, cx - 76, cy, id, {
      stars: p.heroStarCount(id), bonus: p.heroBonusLevels(id), level: p.heroLevel(id),
    });
    const w = 150;
    const h = 96;
    const left = cx - 12;
    const top = cy - h / 2;
    const info = this.add.container(0, 0, [
      panel(this, left, top, w, h, 'parchment'),
      panel(this, left + (w - 90) / 2, top - 8, 90, 20, 'wood'),
      text(this, left + w / 2, top + 2, 'ABILITY', light()).setOrigin(0.5),
      text(this, left + 10, top + 18, ABILITIES[id].name, dark()),
      text(this, left + 10, top + 34, cooldownLabel(id), subText()),
      text(this, left + 10, top + 46, describeAbility(id, p.abilityScale(id)).toUpperCase(),
        subText({ wrap: w - 20, lineSpacing: -2 })),
      text(this, left + 10, top + h - 22, 'KEYS 1-6 OR TAP ITS FACE IN BATTLE', subText({ wrap: w - 20 })),
    ]);
    backdrop.once('pointerdown', () => {
      sfx.click();
      for (const o of [backdrop, card, info]) o.destroy();
    });
  }

  close() {
    sfx.click();
    this.scene.stop();
    this.onClose?.();
  }
}
