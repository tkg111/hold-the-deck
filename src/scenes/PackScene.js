import Phaser from 'phaser';
import { DISPLAY, HEROES, PACK_FX, PACKS, RARITY } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, RENDER_SCALE } from '../display.js';
import { Progress } from '../systems/Progress.js';
import { saveProgress } from '../systems/Save.js';
import { Button } from '../ui/Button.js';
import { createHeroCard, HERO_CARD_SIZE } from '../ui/HeroCard.js';
import { cssColor } from '../ui/format.js';

const CARD_W = HERO_CARD_SIZE.width;
const CARD_H = HERO_CARD_SIZE.height;
const CARD_X = DISPLAY.width / 2;
const CARD_Y = 270;
const ENVELOPE_GOLD = 0xffd54f;
// Build-up glow starts neutral white so the shift toward any rarity colour
// (including Legendary's orange-gold) reads as the hint.
const HINT_START = 0xffffff;
const CONFETTI_COLORS = [0xffd54f, 0xe53935, 0xffffff, 0x66bb6a, 0x29b6f6];

const TEXT = { fontFamily: 'sans-serif', color: '#ffffff' };

// Overlay scene for opening Ang Pow packs. Launched on top of GameScene with
// { progress, onClose }; the full-screen backdrop swallows clicks underneath.
//
// Opening flow: build-up (shake + glow that hints the rarity) → flip →
// reveal (chime, glow, confetti for new heroes) → new-hero splash.
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
    applyRenderScale(this);
    this.ensureConfettiTexture();
    this.add.rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x000000, 0.8)
      .setOrigin(0).setInteractive();

    this.add.text(CARD_X, 36, 'Ang Pow Pack', { ...TEXT, fontSize: '30px', fontStyle: 'bold', color: '#ffd54f' })
      .setOrigin(0.5);
    this.walletText = this.add.text(CARD_X, 72, '', { ...TEXT, fontSize: '16px' }).setOrigin(0.5);
    const rates = Progress.packRates()
      .map(({ rarity, chance }) => `${RARITY[rarity].label} ${Math.round(chance * 100)}%`).join('  ·  ');
    this.add.text(CARD_X, 96, rates, { ...TEXT, fontSize: '13px', color: '#b0bec5' }).setOrigin(0.5);
    this.pityText = this.add.text(CARD_X, 116, '', { ...TEXT, fontSize: '13px', color: '#ffb74d' }).setOrigin(0.5);

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
    // Hold the pity line while a pack is opening: the counter resets the moment
    // a Legendary is rolled, which would spoil the reveal.
    if (!this.busy) {
      const n = this.progress.packsUntilPity;
      this.pityText.setText(n <= 1
        ? 'Next pack is a guaranteed Legendary!'
        : `Legendary guaranteed within ${n} packs`);
    }
    this.openButton.setEnabled(!this.busy && this.progress.canOpenPack);
    this.closeButton.setEnabled(!this.busy);
  }

  // Small white bar used for confetti, drawn at render resolution so it stays sharp.
  ensureConfettiTexture() {
    if (this.textures.exists('confetti')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff).fillRect(0, 0, 8 * RENDER_SCALE, 4 * RENDER_SCALE);
    g.generateTexture('confetti', 8 * RENDER_SCALE, 4 * RENDER_SCALE);
    g.destroy();
  }

  // --- Card faces ---

  showBack() {
    this.card.removeAll(true);
    // Red envelope with a gold seal.
    this.card.add([
      this.add.rectangle(0, 0, CARD_W, CARD_H, 0xc62828).setStrokeStyle(4, ENVELOPE_GOLD),
      this.add.rectangle(0, 0, CARD_W - 28, CARD_H - 28, 0xb71c1c).setStrokeStyle(2, 0xffca28, 0.6),
      this.add.circle(0, -10, 34, ENVELOPE_GOLD),
      this.add.text(0, -10, '福', { ...TEXT, fontSize: '36px', color: '#b71c1c' }).setOrigin(0.5),
      this.add.text(0, 70, 'Tap Open', { ...TEXT, fontSize: '14px', color: '#ffe082' }).setOrigin(0.5),
    ]);
  }

  showFront(result) {
    this.card.removeAll(true);
    this.card.add(createHeroCard(this, 0, 0, result.id, { stars: result.isNew ? 0 : result.stars }));
  }

  // --- Flow ---

  openPack() {
    if (this.busy) return;
    const result = this.progress.openPack();
    if (!result) return;
    saveProgress(this.progress);
    this.busy = true;
    this.resultText.setText('');
    this.tweens.killTweensOf(this.glow);
    this.showBack();
    this.card.setScale(1).setAngle(0).setX(CARD_X);
    this.refresh();
    this.buildUp(result);
  }

  // Shake harder and glow brighter over a rarity-dependent time. The glow is
  // envelope-gold at first and shifts to the rarity colour near the end.
  buildUp(result) {
    const rarity = HEROES[result.id].rarity;
    const duration = PACK_FX.buildUp[rarity];
    const maxAngle = PACK_FX.shakeAngle[rarity];
    const from = Phaser.Display.Color.ValueToColor(HINT_START);
    const to = Phaser.Display.Color.ValueToColor(RARITY[rarity].color);
    const hintStart = 1 - PACK_FX.hintFraction;

    this.glow.setVisible(true).setFillStyle(HINT_START, 0).setScale(1).setAlpha(1);
    sfx.shake(duration, rarity);

    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      onUpdate: (tween) => {
        const k = tween.getValue();
        const t = tween.elapsed;
        const amp = maxAngle * (0.25 + 0.75 * k);
        this.card.setAngle(Math.sin(t / 32) * amp);
        this.card.x = CARD_X + Math.sin(t / 21) * amp * 0.5;

        const hint = k < hintStart ? 0 : (k - hintStart) / PACK_FX.hintFraction;
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, hint * 100);
        this.glow
          .setFillStyle(Phaser.Display.Color.GetColor(c.r, c.g, c.b), 0.15 + 0.6 * k)
          .setScale(1 + 0.08 * k + 0.02 * Math.sin(t / 50));
      },
      onComplete: () => this.flip(result),
    });
  }

  flip(result) {
    this.card.setAngle(0).setX(CARD_X);
    sfx.flip();
    this.tweens.chain({
      targets: this.card,
      tweens: [
        { scaleX: 0, duration: 140, ease: 'Quad.easeIn', onComplete: () => this.showFront(result) },
        { scaleX: 1, duration: 220, ease: 'Back.easeOut' },
      ],
      onComplete: () => this.reveal(result),
    });
  }

  reveal(result) {
    const rarity = HEROES[result.id].rarity;
    const rarityColor = RARITY[rarity].color;
    sfx.reveal(rarity, result.isNew);
    const flash = PACK_FX.revealFlash[rarity];
    if (flash) this.cameras.main.flash(flash, 255, 236, 179);

    this.glow.setFillStyle(rarityColor, 0.55).setVisible(true).setScale(0.95).setAlpha(1);
    this.tweens.add({ targets: this.glow, scale: 1.1, alpha: 0.5, duration: 700, yoyo: true, repeat: -1 });

    const name = HEROES[result.id].name;
    let message;
    let color;
    if (result.pity) {
      message = `Pity! `;
    }
    if (result.isNew) {
      message = (message ?? '') + (result.slot >= 0
        ? `NEW HERO! ${name} joins slot ${result.slot + 1}`
        : `NEW HERO! ${name} — assign a slot on the house`);
      color = '#ffd54f';
    } else if (result.refund) {
      message = (message ?? '') + `${name} is at max stars — +${result.refund} Ang Pow back`;
      color = '#b0bec5';
    } else {
      message = (message ?? '') + `Duplicate! ${name} is now ★${result.stars}`;
      color = cssColor(rarityColor);
    }
    this.resultText.setText(message).setColor(color).setAlpha(0);
    this.tweens.add({ targets: this.resultText, alpha: 1, duration: 250 });

    if (result.isNew) {
      this.confetti(CARD_X, CARD_Y - 40, PACK_FX.confetti[rarity], rarityColor);
      this.time.delayedCall(PACK_FX.splashDelay, () => this.showSplash(result));
    } else {
      this.busy = false;
      this.refresh();
    }
  }

  confetti(x, y, count, rarityColor) {
    const emitter = this.add.particles(x, y, 'confetti', {
      speed: { min: 220, max: 560 },
      angle: { min: 200, max: 340 },  // upward fan
      gravityY: 650,
      lifespan: { min: 1400, max: 2400 },
      scale: 1 / RENDER_SCALE,
      rotate: { start: 0, end: 720 },
      alpha: { start: 1, end: 0, ease: 'Quad.easeIn' },
      tint: [rarityColor, rarityColor, ...CONFETTI_COLORS],
      emitting: false,
    }).setDepth(60);  // above the splash so it keeps falling over it
    emitter.explode(count);
    this.time.delayedCall(2600, () => emitter.destroy());
  }

  // Big intro card for a hero pulled for the first time. Click to dismiss.
  showSplash(result) {
    const def = HEROES[result.id];
    const rarity = RARITY[def.rarity];
    const cx = DISPLAY.width / 2;
    const cardY = 250;
    const splash = this.add.container(0, 0).setDepth(50);

    const backdrop = this.add.rectangle(0, 0, DISPLAY.width, DISPLAY.height, 0x05070a, 0.9)
      .setOrigin(0).setInteractive({ useHandCursor: true });

    // Slowly turning light rays behind the card.
    const rays = this.add.graphics({ x: cx, y: cardY });
    rays.fillStyle(rarity.color, 0.16);
    const RAYS = 14;
    for (let i = 0; i < RAYS; i++) {
      const a = (i / RAYS) * Math.PI * 2;
      const b = a + Math.PI / RAYS;
      rays.fillTriangle(0, 0, Math.cos(a) * 600, Math.sin(a) * 600, Math.cos(b) * 600, Math.sin(b) * 600);
    }
    this.tweens.add({ targets: rays, angle: 360, duration: 16000, repeat: -1 });

    const legendary = def.rarity === 'legendary';
    const title = this.add.text(cx, 42, legendary ? 'NEW LEGENDARY HERO!' : 'NEW HERO!', {
      ...TEXT, fontSize: '36px', fontStyle: 'bold', color: '#ffd54f', stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5);
    const card = createHeroCard(this, cx, cardY, result.id, { scale: 1.3, stars: 0 });
    const quote = this.add.text(cx, 448, `“${def.catchphrase}”`, {
      ...TEXT, fontSize: '22px', fontStyle: 'italic', align: 'center',
      stroke: '#000000', strokeThickness: 4, wordWrap: { width: 760 },
    }).setOrigin(0.5);
    const hint = this.add.text(cx, 508, 'Tap anywhere to continue', { ...TEXT, fontSize: '14px', color: '#90a4ae' })
      .setOrigin(0.5).setAlpha(0);

    splash.add([backdrop, rays, title, card, quote, hint]);

    // Entrance
    card.setScale(0.3).setAlpha(0);
    title.setScale(0.5).setAlpha(0);
    quote.setAlpha(0);
    this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 450, ease: 'Back.easeOut' });
    this.tweens.add({ targets: title, scale: 1, alpha: 1, duration: 350, delay: 100, ease: 'Back.easeOut' });
    this.tweens.add({ targets: quote, alpha: 1, duration: 400, delay: 450 });
    this.tweens.add({ targets: hint, alpha: 1, duration: 300, delay: 900 });

    // Ignore clicks for a moment so the opening click can't skip it by accident.
    let canDismiss = false;
    this.time.delayedCall(600, () => { canDismiss = true; });
    backdrop.on('pointerdown', () => {
      if (!canDismiss) return;
      sfx.click();
      this.tweens.killTweensOf([rays, card, title, quote, hint]);
      splash.destroy(true);
      this.busy = false;
      this.refresh();
    });
  }

  close() {
    if (this.busy) return;
    this.scene.stop();
    this.onClose?.();
  }
}
