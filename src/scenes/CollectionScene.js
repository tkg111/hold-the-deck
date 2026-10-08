import Phaser from 'phaser';
import { DISPLAY, HEROES } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale } from '../display.js';
import { Button } from '../ui/Button.js';
import { createHeroCard, HERO_CARD_SIZE } from '../ui/HeroCard.js';

const TEXT = { fontFamily: 'sans-serif', color: '#ffffff' };
const MAX_PER_ROW = 5;
const GAP = 22;

// Overlay listing every hero: owned ones as cards with level and stars,
// the rest as dark silhouettes. Launched with { progress, onClose }.
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
    const ids = Object.keys(HEROES);
    const owned = ids.filter((id) => p.isOwned(id));
    const cx = DISPLAY.width / 2;

    this.add.rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x0d1117, 0.94).setOrigin(0).setInteractive();
    this.add.text(cx, 36, 'Hero Collection', { ...TEXT, fontSize: '30px', fontStyle: 'bold', color: '#ffd54f' })
      .setOrigin(0.5);
    this.add.text(cx, 72, `${owned.length}/${ids.length} collected`, { ...TEXT, fontSize: '17px', color: '#b0bec5' })
      .setOrigin(0.5);

    // Grid: one row while it fits, smaller cards once heroes need more rows.
    const rows = Math.ceil(ids.length / MAX_PER_ROW);
    const scale = rows > 1 ? 0.62 : 0.88;
    const w = HERO_CARD_SIZE.width * scale;
    const h = HERO_CARD_SIZE.height * scale;
    const top = 100 + (360 - (rows * h + (rows - 1) * GAP)) / 2;

    ids.forEach((id, i) => {
      const row = Math.floor(i / MAX_PER_ROW);
      const inRow = Math.min(MAX_PER_ROW, ids.length - row * MAX_PER_ROW);
      const col = i % MAX_PER_ROW;
      const rowWidth = inRow * w + (inRow - 1) * GAP;
      const x = cx - rowWidth / 2 + w / 2 + col * (w + GAP);
      const y = top + h / 2 + row * (h + GAP);
      const isOwned = p.isOwned(id);
      createHeroCard(this, x, y, id, isOwned
        ? { scale, stars: p.heroStarCount(id), level: p.heroLevel(id) }
        : { scale, silhouette: true });
    });

    new Button(this, cx, 490, {
      width: 180, height: 44, label: 'Back', color: 0x546e7a, fontSize: '18px',
      onClick: () => this.close(),
    });
  }

  close() {
    sfx.click();
    this.scene.stop();
    this.onClose?.();
  }
}
