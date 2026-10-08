import Phaser from 'phaser';
import { DISPLAY, HEROES, PACKS, RARITY } from '../config.js';
import { Progress } from '../systems/Progress.js';
import { Button } from '../ui/Button.js';
import { describeHero } from '../ui/HeroPicker.js';
import { cssColor } from '../ui/format.js';

const CARD_W = 190;
const CARD_H = 250;
const CARD_X = DISPLAY.width / 2;
const CARD_Y = 270;

const TEXT = { fontFamily: 'sans-serif', color: '#ffffff' };

// Overlay scene for opening Ang Pow packs. Launched on top of GameScene with
// { progress, onClose }; the full-screen backdrop swallows clicks underneath.
export class PackScene extends Phaser.Scene {
  constructor() {
    super('PackScene');
  }

  init({ progress, onClose }) {
    this.progress = progress;
    this.onClose = onClose;
    this.busy = false;
  }

  create() {
    this.add.rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x000000, 0.8)
      .setOrigin(0).setInteractive();

    this.add.text(CARD_X, 36, 'Ang Pow Pack', { ...TEXT, fontSize: '30px', fontStyle: 'bold', color: '#ffd54f' })
      .setOrigin(0.5);
    this.walletText = this.add.text(CARD_X, 72, '', { ...TEXT, fontSize: '16px' }).setOrigin(0.5);
    const rates = Progress.packRates()
      .map(({ rarity, chance }) => `${RARITY[rarity].label} ${Math.round(chance * 100)}%`).join('  ·  ');
    this.add.text(CARD_X, 96, rates, { ...TEXT, fontSize: '13px', color: '#b0bec5' }).setOrigin(0.5);

    this.glow = this.add.rectangle(CARD_X, CARD_Y, CARD_W + 36, CARD_H + 36, 0xffffff, 0).setVisible(false);
    this.card = this.add.container(CARD_X, CARD_Y);
    this.showBack();

    this.resultText = this.add.text(CARD_X, 418, '', { ...TEXT, fontSize: '20px', fontStyle: 'bold', align: 'center' })
      .setOrigin(0.5);

    this.openButton = new Button(this, CARD_X - 100, 480, {
      width: 180, height: 44, label: '', color: 0xb71c1c, fontSize: '18px',
      onClick: () => this.openPack(),
    });
    this.closeButton = new Button(this, CARD_X + 100, 480, {
      width: 180, height: 44, label: 'Done', color: 0x546e7a, fontSize: '18px',
      onClick: () => this.close(),
    });
    this.refresh();
  }

  refresh() {
    const { angPow } = this.progress;
    this.walletText.setText(`You have ${angPow} Ang Pow  ·  Pack costs ${PACKS.cost}`);
    this.openButton.setLabel(`Open (${PACKS.cost} Ang Pow)`);
    this.openButton.setEnabled(!this.busy && this.progress.canOpenPack);
    this.closeButton.setEnabled(!this.busy);
  }

  // --- Card faces ---

  showBack() {
    this.card.removeAll(true);
    // Red envelope with a gold seal.
    this.card.add([
      this.add.rectangle(0, 0, CARD_W, CARD_H, 0xc62828).setStrokeStyle(4, 0xffd54f),
      this.add.rectangle(0, 0, CARD_W - 28, CARD_H - 28, 0xb71c1c).setStrokeStyle(2, 0xffca28, 0.6),
      this.add.circle(0, -10, 34, 0xffd54f),
      this.add.text(0, -10, '福', { ...TEXT, fontSize: '36px', color: '#b71c1c' }).setOrigin(0.5),
      this.add.text(0, 70, 'Tap Open', { ...TEXT, fontSize: '14px', color: '#ffe082' }).setOrigin(0.5),
    ]);
  }

  showFront(result) {
    const def = HEROES[result.id];
    const rarity = RARITY[def.rarity];
    const filled = result.isNew ? 0 : result.stars;
    const stars = '★'.repeat(filled) + '☆'.repeat(PACKS.maxStars - filled);

    this.card.removeAll(true);
    this.card.add([
      this.add.rectangle(0, 0, CARD_W, CARD_H, 0xfdf6e3).setStrokeStyle(5, rarity.color),
      this.add.rectangle(0, -CARD_H / 2 + 18, CARD_W, 36, rarity.color),
      this.add.text(0, -CARD_H / 2 + 18, rarity.label.toUpperCase(), { ...TEXT, fontSize: '15px', fontStyle: 'bold' })
        .setOrigin(0.5),
      this.add.rectangle(0, -32, 52, 76, def.color).setStrokeStyle(3, 0x1b1b1b),
      this.add.text(0, 30, def.name, { ...TEXT, fontSize: '18px', fontStyle: 'bold', color: '#3e2723' })
        .setOrigin(0.5),
      this.add.text(0, 54, describeHero(def), {
        ...TEXT, fontSize: '11px', color: '#5d4037', align: 'center', wordWrap: { width: CARD_W - 24 },
      }).setOrigin(0.5, 0),
      this.add.text(0, CARD_H / 2 - 22, stars, { ...TEXT, fontSize: '18px', color: '#f9a825' }).setOrigin(0.5),
    ]);
  }

  // --- Flow ---

  openPack() {
    if (this.busy) return;
    const result = this.progress.openPack();
    if (!result) return;
    this.busy = true;
    this.resultText.setText('');
    this.glow.setVisible(false);
    this.tweens.killTweensOf(this.glow);
    this.showBack();
    this.card.setScale(1).setAngle(0);
    this.refresh();

    const rarityColor = RARITY[HEROES[result.id].rarity].color;
    // Wiggle, flip to edge, swap faces, flip back, then glow.
    this.tweens.chain({
      targets: this.card,
      tweens: [
        { angle: { from: -4, to: 4 }, duration: 70, yoyo: true, repeat: 3 },
        { angle: 0, scaleX: 0, duration: 160, ease: 'Quad.easeIn', onComplete: () => this.showFront(result) },
        { scaleX: 1, duration: 200, ease: 'Back.easeOut' },
      ],
      onComplete: () => this.reveal(result, rarityColor),
    });
  }

  reveal(result, rarityColor) {
    this.glow.setFillStyle(rarityColor, 0.55).setVisible(true).setScale(0.9).setAlpha(1);
    this.tweens.add({ targets: this.glow, scale: 1.08, alpha: 0.5, duration: 700, yoyo: true, repeat: -1 });

    const name = HEROES[result.id].name;
    let message;
    let color;
    if (result.isNew) {
      message = result.slot >= 0
        ? `NEW HERO! ${name} joins slot ${result.slot + 1}`
        : `NEW HERO! ${name} — assign a slot on the house`;
      color = '#ffd54f';
    } else if (result.refund) {
      message = `${name} is at max stars — +${result.refund} Ang Pow back`;
      color = '#b0bec5';
    } else {
      message = `Duplicate! ${name} is now ★${result.stars}`;
      color = cssColor(rarityColor);
    }
    this.resultText.setText(message).setColor(color).setAlpha(0);
    this.tweens.add({ targets: this.resultText, alpha: 1, duration: 250 });

    this.busy = false;
    this.refresh();
  }

  close() {
    if (this.busy) return;
    this.scene.stop();
    this.onClose?.();
  }
}
