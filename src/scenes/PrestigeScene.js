import Phaser from 'phaser';
import { DISPLAY, HEROES, SHIP, PACKS, PRESTIGE, RENOWN_SHOP } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale } from '../display.js';
import { Button } from '../ui/Button.js';
import { pearlsLabel } from '../ui/format.js';

const TEXT = { fontFamily: 'sans-serif', color: '#ffffff' };
const TEAL = 0x26a69a;
const GOLD = '#ffd54f';
const S = '✦';  // Renown symbol

const fmt = (n) => n.toLocaleString('en-US');

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

    this.add.rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x0b1a1a, 0.95).setOrigin(0).setInteractive();
    this.add.text(cx, 32, 'New Voyage', { ...TEXT, fontSize: '30px', fontStyle: 'bold', color: '#80cbc4' })
      .setOrigin(0.5);
    this.add.text(cx, 62,
      `Set sail on a new voyage and start over, stronger.   Voyages so far: ${p.prestigeCount}   ·   Best wave: ${p.bestWave}`,
      { ...TEXT, fontSize: '13px', color: '#90a4ae' }).setOrigin(0.5);

    this.content = this.add.container(0, 0);
    this.buildContent();

    new Button(this, cx, 500, {
      width: 180, height: 44, label: 'Back', color: 0x546e7a, fontSize: '18px',
      onClick: () => this.close(),
    });
  }

  // Both panels; rebuilt after a shop purchase.
  buildContent() {
    this.content.removeAll(true);
    this.buildMovePanel(30, 90, 420, 370);
    this.buildShopPanel(470, 90, 460, 370);
  }

  panel(x, y, w, h, title) {
    this.content.add([
      this.add.rectangle(x, y, w, h, 0x132a2a).setOrigin(0).setStrokeStyle(2, TEAL, 0.5),
      this.add.text(x + 16, y + 12, title, { ...TEXT, fontSize: '19px', fontStyle: 'bold' }),
    ]);
  }

  buildMovePanel(x, y, w, h) {
    const p = this.progress;
    const add = (o) => this.content.add(o);
    this.panel(x, y, w, h, 'Set sail');

    if (!p.canPrestige) {
      const need = PRESTIGE.unlockWave;
      add(this.add.text(x + 16, y + 56, `Unlocks at wave ${need}.`, { ...TEXT, fontSize: '17px', color: GOLD }));
      add(this.add.text(x + 16, y + 84, `You're on wave ${p.wave}.`, { ...TEXT, fontSize: '15px', color: '#b0bec5' }));
      const barW = w - 32;
      const pct = Math.min(1, (p.wave - 1) / (need - 1));
      add(this.add.rectangle(x + 16, y + 118, barW, 12, 0x000000, 0.5).setOrigin(0));
      add(this.add.rectangle(x + 16, y + 118, barW * pct, 12, TEAL).setOrigin(0));
      add(this.add.text(x + 16, y + 150,
        'A new voyage resets your wave, gold, ship and hero\nlevels, but you keep your crew and their stars, and\nearn Renown for permanent bonuses. The further you\nsail, the more Renown you earn.',
        { ...TEXT, fontSize: '13px', color: '#90a4ae', lineSpacing: 4 }));
      return;
    }

    const r = p.prestigeRewards;
    add(this.add.text(x + 16, y + 52, `Setting sail now (from wave ${p.wave}) earns:`, { ...TEXT, fontSize: '15px', color: '#b0bec5' }));
    add(this.add.text(x + 16, y + 80, `${S} ${r.renown} Renown`, { ...TEXT, fontSize: '26px', fontStyle: 'bold', color: '#80cbc4' }));
    add(this.add.text(x + 16, y + 116, `+${pearlsLabel(r.pearls)}`, { ...TEXT, fontSize: '20px', fontStyle: 'bold', color: '#e0f7fa' }));

    // Teaser: what pushing 10 more waves would earn.
    const later = p.wave + 10;
    const laterRenown = Math.floor(PRESTIGE.renownBase * (later / PRESTIGE.unlockWave) ** PRESTIGE.renownExponent);
    add(this.add.text(x + 16, y + 156, `Push to wave ${later} first for ${S} ${laterRenown} instead.`,
      { ...TEXT, fontSize: '13px', color: '#90a4ae' }));

    const button = new Button(this, x + w / 2, y + h - 44, {
      width: 240, height: 46, label: 'New Voyage…', color: 0x00897b, fontSize: '19px',
      onClick: () => this.showConfirm(),
    });
    add(button);
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
    this.panel(x, y, w, h, 'Renown shop');
    add(this.add.text(x + w - 16, y + 14, `${S} ${p.renown}`, { ...TEXT, fontSize: '19px', fontStyle: 'bold', color: '#80cbc4' })
      .setOrigin(1, 0));

    const rowH = 76;
    Object.entries(RENOWN_SHOP).forEach(([key, bonus], i) => {
      const ry = y + 50 + i * rowH;
      const level = p.renownLevel(key);
      const cost = p.renownCost(key);
      const effect = cost == null
        ? `${bonus.description}: ${this.shopEffect(key, level)} (max)`
        : `${bonus.description}: ${this.shopEffect(key, level)} → ${this.shopEffect(key, level + 1)}`;
      add(this.add.rectangle(x + 10, ry, w - 20, rowH - 8, 0xffffff, 0.04).setOrigin(0));
      add(this.add.text(x + 22, ry + 10, `${bonus.name}  ·  Lv ${level}`, { ...TEXT, fontSize: '16px', fontStyle: 'bold' }));
      add(this.add.text(x + 22, ry + 36, effect, { ...TEXT, fontSize: '13px', color: '#b0bec5' }));
      const button = new Button(this, x + w - 78, ry + (rowH - 8) / 2, {
        width: 110, height: 34, label: cost == null ? 'MAX' : `${S} ${cost}`, color: 0x00897b, fontSize: '15px',
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
      this.add.rectangle(cx, 268, 920, 470, 0x10201f).setStrokeStyle(2, TEAL, 0.7),
      this.add.text(cx, 56, 'Set sail on a new voyage?', { ...TEXT, fontSize: '26px', fontStyle: 'bold', color: '#80cbc4' }).setOrigin(0.5),
    ]);

    const leveled = p.ownedHeroes.filter((id) => p.heroLevel(id) > 1);
    const heroLines = leveled.slice(0, 5).map((id) => `   ${HEROES[id].name}  Lv ${p.heroLevel(id)} → 1`);
    if (leveled.length > 5) heroLines.push(`   …and ${leveled.length - 5} more → Lv 1`);
    const totalStars = p.owned.reduce((sum, id) => sum + p.heroStarCount(id), 0);
    const shopLevels = Object.keys(RENOWN_SHOP).reduce((sum, k) => sum + p.renownLevel(k), 0);

    const columns = [
      {
        title: 'You lose', color: '#ef9a9a',
        lines: [
          `Wave ${p.wave} → 1`,
          `Gold ${fmt(p.gold)} → 0`,
          `Hull HP upgrades Lv ${p.hullHpLevel} → 0`,
          `Decks ${p.decks} → ${SHIP.startingDecks}`,
          leveled.length ? 'Hero levels:' : 'Hero levels (all Lv 1 already)',
          ...heroLines,
        ],
      },
      {
        title: 'You keep', color: '#90caf9',
        lines: [
          `Heroes: ${p.owned.length}/${Object.keys(HEROES).length} owned`,
          `Stars: ★${totalStars} in total`,
          'Hero slot assignments',
          `Pearls: ${p.pearls}`,
          `Legendary pity: within ${p.packsUntilPity} chests`,
          `Renown bonuses (${shopLevels} levels bought)`,
          `Unspent Renown: ${S} ${p.renown}`,
        ],
      },
      {
        title: 'You earn', color: GOLD,
        lines: [
          `${S} +${r.renown} Renown`,
          `   (total ${S} ${p.renown + r.renown})`,
          `+${r.pearls} Pearls`,
          `   (total ${p.pearls + r.pearls})`,
        ],
      },
    ];
    columns.forEach((col, i) => {
      const x = 40 + i * 300;
      modal.add([
        this.add.rectangle(x, 92, 280, 330, 0xffffff, 0.04).setOrigin(0),
        this.add.text(x + 14, 102, col.title, { ...TEXT, fontSize: '19px', fontStyle: 'bold', color: col.color }),
        this.add.text(x + 14, 136, col.lines.join('\n'), { ...TEXT, fontSize: '14px', color: '#eceff1', lineSpacing: 7 }),
      ]);
    });

    modal.add(new Button(this, cx - 130, 462, {
      width: 220, height: 46, label: 'Stay aboard', color: 0x546e7a, fontSize: '18px',
      onClick: () => modal.destroy(true),
    }));
    modal.add(new Button(this, cx + 130, 462, {
      width: 220, height: 46, label: 'Set sail!', color: 0x00897b, fontSize: '18px',
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
