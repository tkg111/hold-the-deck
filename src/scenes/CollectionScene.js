import Phaser from 'phaser';
import { DISPLAY, HEROES, RARITY } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale } from '../display.js';
import { Button } from '../ui/Button.js';
import { createHeroCard, HERO_CARD_SIZE } from '../ui/HeroCard.js';
import { light, panel, text } from '../ui/kit.js';

const MAX_PER_ROW = 5;
const GAP = 6;
const GRID_TOP = 28;

// Overlay listing every hero (the "collection book"): owned ones as parchment
// cards with level and stars, the rest as black silhouettes on wood.
// Launched with { progress, onClose }.
export class CollectionScene extends Phaser.Scene {
  constructor() {
    super('CollectionScene');
  }

  init({ progress, onClose }) {
    this.progress = progress;
    this.onClose = onClose;
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

    this.add.rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x0d1117, 0.9).setOrigin(0).setInteractive();
    panel(this, cx - 70, 4, 140, 20, 'wood');
    text(this, cx, 14, 'CREW ROSTER', light()).setOrigin(0.5);
    text(this, cx + 76, 14, `${owned.length}/${ids.length} FOUND`, { font: 'small', ...light() })
      .setOrigin(0, 0.5);

    const { width: w, height: h } = HERO_CARD_SIZE.small;
    ids.forEach((id, i) => {
      const row = Math.floor(i / MAX_PER_ROW);
      const inRow = Math.min(MAX_PER_ROW, ids.length - row * MAX_PER_ROW);
      const col = i % MAX_PER_ROW;
      const rowWidth = inRow * w + (inRow - 1) * GAP;
      const x = cx - rowWidth / 2 + w / 2 + col * (w + GAP);
      const y = GRID_TOP + h / 2 + row * (h + GAP);
      createHeroCard(this, x, y, id, p.isOwned(id)
        ? { size: 'small', stars: p.heroStarCount(id), level: p.heroLevel(id) }
        : { size: 'small', silhouette: true });
    });

    new Button(this, DISPLAY.width - 30, 14, {
      width: 48, height: 20, label: 'Back', onClick: () => this.close(),
    });
  }

  close() {
    sfx.click();
    this.scene.stop();
    this.onClose?.();
  }
}
