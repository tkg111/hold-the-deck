import Phaser from 'phaser';
import {
  DISPLAY, HEROES, PACKS, PRESTIGE, RENOWN_SHOP, SHIP, UI_KIT,
} from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale } from '../display.js';
import { Button } from '../ui/Button.js';
import { fmtNumber as fmt, pearlsLabel } from '../ui/format.js';
import {
  Bar, hexColor, icon, dark, light, panel, subText, text, UI,
} from '../ui/kit.js';

const PLATE_H = 20;

// New Voyage (prestige) and the Renown shop. Launched over GameScene with
// { progress, onChange, onClose, onPrestige }. onChange runs after each shop
// purchase; onPrestige runs after the reset is applied.
export class PrestigeScene extends Phaser.Scene {
  constructor() {
    super('PrestigeScene');
  }

  init({ progress, onChange, onClose, onPrestige }) {
    this.progress = progress;
    this.onChange = onChange;
    this.onClose = onClose;
    this.onPrestige = onPrestige;
  }

  create() {
    applyRenderScale(this);
    const p = this.progress;
    const cx = DISPLAY.width / 2;

    this.add.rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x0d1117, 0.9).setOrigin(0).setInteractive();
    panel(this, cx - 70, 4, 140, PLATE_H, 'wood');
    text(this, cx, 14, 'NEW VOYAGE', light()).setOrigin(0.5);
    text(this, cx, 30, `VOYAGES SO FAR: ${p.prestigeCount}   BEST WAVE: ${p.bestWave}`, { font: 'small', ...light() })
      .setOrigin(0.5);

    this.content = this.add.container(0, 0);
    this.buildContent();

    new Button(this, cx, 256, {
      width: 70, height: 22, label: 'Back', onClick: () => this.close(),
    });
  }

  // Both panels; rebuilt after a shop purchase.
  buildContent() {
    this.content.removeAll(true);
    this.buildMovePanel(10, 50, 220, 190);
    this.buildShopPanel(240, 50, 230, 190);
  }

  // Parchment panel under a wood title plate.
  panel(x, y, w, h, title) {
    const plateW = 110;
    this.content.add([
      panel(this, x, y, w, h, 'parchment'),
      panel(this, x + (w - plateW) / 2, y - 8, plateW, PLATE_H, 'wood'),
      text(this, x + w / 2, y - 8 + (PLATE_H / 2), title, light()).setOrigin(0.5),
    ]);
  }

  buildMovePanel(x, y, w, h) {
    const p = this.progress;
    const add = (o) => this.content.add(o);
    this.panel(x, y, w, h, 'SET SAIL');
    const left = x + 10;
    const wrap = w - 20;

    if (!p.canPrestige) {
      const need = PRESTIGE.unlockWave;
      add(text(this, left, y + 18, `Unlocks at wave ${need}`, dark()));
      add(text(this, left, y + 34, `YOU'RE ON WAVE ${p.wave}`, subText()));
      add(new Bar(this, left, y + 46, wrap, 10, UI.colors.progress)
        .setValue(Math.min(1, (p.wave - 1) / (need - 1)), `${p.wave} / ${need}`));
      add(text(this, left, y + 64,
        'A NEW VOYAGE RESETS YOUR WAVE, GOLD, SHIP AND HERO LEVELS, BUT YOU KEEP YOUR CREW AND THEIR STARS, AND EARN RENOWN FOR PERMANENT BONUSES. THE FURTHER YOU SAIL, THE MORE RENOWN YOU EARN.',
        subText({ wrap, lineSpacing: 2 })));
      return;
    }

    const r = p.prestigeRewards;
    add(text(this, left, y + 18, `SETTING SAIL NOW (FROM WAVE ${p.wave}) EARNS:`, subText({ wrap })));
    add(icon(this, left + 6, y + 44, 'renown'));
    add(text(this, left + 16, y + 44, `${r.renown} Renown`, dark()).setOrigin(0, 0.5));
    add(icon(this, left + 6, y + 70, 'pearl'));
    add(text(this, left + 16, y + 70, `+${pearlsLabel(r.pearls)}`, dark()).setOrigin(0, 0.5));

    // Teaser: what pushing 10 more waves would earn.
    const later = p.wave + 10;
    const laterRenown = Math.floor(PRESTIGE.renownBase * (later / PRESTIGE.unlockWave) ** PRESTIGE.renownExponent);
    add(text(this, left, y + 90, `PUSH TO WAVE ${later} FIRST FOR ${laterRenown} RENOWN INSTEAD.`,
      subText({ wrap })));

    add(new Button(this, x + w / 2, y + h - 20, {
      width: 120, height: 24, style: 'gold', icon: 'renown', label: 'New Voyage...',
      onClick: () => this.showConfirm(),
    }));
  }

  // Current and next effect text for a shop bonus.
  shopEffect(key, level) {
    const bonus = RENOWN_SHOP[key];
    if (key === 'packDiscount') return pearlsLabel(Math.max(1, PACKS.cost - level * bonus.perLevel));
    return `+${Math.round(level * bonus.perLevel * 100)}%`;
  }

  buildShopPanel(x, y, w, h) {
    const p = this.progress;
    const add = (o) => this.content.add(o);
    this.panel(x, y, w, h, 'RENOWN SHOP');
    add(icon(this, x + w - 30, y + 8, 'renown'));
    add(text(this, x + w - 22, y + 8, fmt(p.renown), dark({ font: 'small' })).setOrigin(0, 0.5));

    const rowH = 40;
    Object.entries(RENOWN_SHOP).forEach(([key, bonus], i) => {
      const ry = y + 16 + i * rowH;
      const level = p.renownLevel(key);
      const cost = p.renownCost(key);
      const effect = cost == null
        ? `${bonus.description}: ${this.shopEffect(key, level)} (max)`
        : `${bonus.description}: ${this.shopEffect(key, level)} > ${this.shopEffect(key, level + 1)}`;
      if (i > 0) add(this.add.rectangle(x + 8, ry - 3, w - 16, 1, hexColor(UI_KIT.dividerColor)).setOrigin(0));
      add(text(this, x + 10, ry - 1, `${bonus.name}  LV ${level}`, dark()));
      add(text(this, x + 10, ry + 15, effect.toUpperCase(), subText({ wrap: w - 84 })));
      const button = new Button(this, x + w - 40, ry + 14, {
        width: 64, height: 19, style: 'gold', icon: cost == null ? null : 'renown',
        label: cost == null ? 'MAX' : fmt(cost),
        onClick: () => {
          if (!p.buyRenown(key)) return;
          sfx.click();
          this.onChange?.();
          this.buildContent();
        },
      });
      button.setEnabled(cost != null && p.renown >= cost);
      add(button);
    });
  }

  // Full preview of exactly what a new voyage does, then confirm.
  showConfirm() {
    const p = this.progress;
    const r = p.prestigeRewards;
    const modal = this.add.container(0, 0).setDepth(50);
    const cx = DISPLAY.width / 2;
    modal.add([
      this.add.rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x000000, 0.85).setOrigin(0).setInteractive(),
      panel(this, 10, 16, 460, 244, 'wood'),
      text(this, cx, 30, 'Set sail on a new voyage?', light()).setOrigin(0.5),
    ]);

    const leveled = p.ownedHeroes.filter((id) => p.heroLevel(id) > 1);
    const heroLines = leveled.slice(0, 5).map((id) => `  ${HEROES[id].name} LV ${p.heroLevel(id)} > 1`);
    if (leveled.length > 5) heroLines.push(`  AND ${leveled.length - 5} MORE > LV 1`);
    const totalStars = p.owned.reduce((sum, id) => sum + p.heroStarCount(id), 0);
    const shopLevels = Object.keys(RENOWN_SHOP).reduce((sum, k) => sum + p.renownLevel(k), 0);

    const columns = [
      {
        title: 'You lose', color: UI.colors.warn,
        lines: [
          `Wave ${p.wave} > 1`,
          `Gold ${fmt(p.gold)} > 0`,
          `Hull HP upgrades LV ${p.hullHpLevel} > 0`,
          `Decks ${p.decks} > ${SHIP.startingDecks}`,
          leveled.length ? 'Hero levels:' : 'Hero levels (all LV 1 already)',
          ...heroLines,
        ],
      },
      {
        title: 'You keep', color: UI.colors.progress,
        lines: [
          `Heroes: ${p.owned.length}/${Object.keys(HEROES).length} owned`,
          `Stars: ${totalStars} in total`,
          'Hero slot assignments',
          `Pearls: ${p.pearls}`,
          `Legendary pity: within ${p.packsUntilPity} chests`,
          `Renown bonuses (${shopLevels} levels bought)`,
          `Unspent Renown: ${p.renown}`,
        ],
      },
      {
        title: 'You earn', color: '#ffd86a',
        lines: [
          `+${r.renown} Renown`,
          `  (total ${p.renown + r.renown})`,
          `+${r.pearls} Pearls`,
          `  (total ${p.pearls + r.pearls})`,
        ],
      },
    ];
    columns.forEach((col, i) => {
      const x = (18 + i * 150);
      modal.add([
        panel(this, x, 42, 144, 176, 'parchment'),
        text(this, x + 8, 46, col.title, light({ color: col.color })),
        text(this, x + 8, 64, col.lines.join('\n').toUpperCase(), dark({ font: 'small', wrap: 128, lineSpacing: 2 })),
      ]);
    });

    modal.add(new Button(this, cx - 60, 238, {
      width: 100, height: 24, label: 'Stay aboard',
      onClick: () => modal.destroy(true),
    }));
    modal.add(new Button(this, cx + 60, 238, {
      width: 100, height: 24, style: 'gold', label: 'SET SAIL!',
      onClick: () => this.confirmPrestige(),
    }));
  }

  confirmPrestige() {
    const rewards = this.progress.prestige();
    if (!rewards) return;
    sfx.reveal('legendary', true);
    this.scene.stop();
    this.onPrestige?.(rewards);
  }

  close() {
    sfx.click();
    this.scene.stop();
    this.onClose?.();
  }
}
