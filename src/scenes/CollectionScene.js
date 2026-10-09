import Phaser from 'phaser';
import { ABILITIES, DISPLAY, HEROES, RARITY } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, fillView } from '../display.js';
import { Button } from '../ui/Button.js';
import { createHeroCard, HERO_CARD_SIZE } from '../ui/HeroCard.js';
import { cooldownLabel, describeAbility } from '../ui/HeroPicker.js';
import { dark, light, panel, subText, text } from '../ui/kit.js';

const MAX_PER_ROW = 5;
const GAP = 6;
const GRID_TOP = 28;

// Overlay listing every hero (the "collection book"): owned ones as parchment
// cards with level and stars, the rest as black silhouettes on wood. Clicking
// an owned card shows it large next to its ability.
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

    fillView(this, 0x0d1117, 0.9);
    panel(this, cx - 70, 4, 140, 20, 'wood');
    text(this, cx, 14, 'CREW ROSTER', light()).setOrigin(0.5);
    text(this, cx + 76, 14, `${owned.length}/${ids.length} FOUND`, { font: 'small', ...light() })
      .setOrigin(0, 0.5);
    if (owned.length) {
      text(this, 8, 14, 'CLICK A CARD FOR ABILITY', { font: 'small', ...light() }).setOrigin(0, 0.5);
    }

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
      if (p.isOwned(id)) {
        this.add.zone(x, y, w, h).setInteractive({ useHandCursor: true })
          .on('pointerdown', () => this.showDetail(id));
      }
    });

    new Button(this, DISPLAY.width - 30, 14, {
      width: 48, height: 20, label: 'Back', onClick: () => this.close(),
    });
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
      stars: p.heroStarCount(id), level: p.heroLevel(id),
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
