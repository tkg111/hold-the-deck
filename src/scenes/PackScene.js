import Phaser from 'phaser';
import { DISPLAY, HEROES, PACK_FX, RARITY } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale } from '../display.js';
import { Progress } from '../systems/Progress.js';
import { saveProgress } from '../systems/Save.js';
import { Button } from '../ui/Button.js';
import { createHeroCard, HERO_CARD_SIZE } from '../ui/HeroCard.js';
import { cssColor, pearlsLabel } from '../ui/format.js';
import {
  icon, dark, light, panel, subText, text, UI,
} from '../ui/kit.js';

const CARD_W = HERO_CARD_SIZE.large.width;
const CARD_H = HERO_CARD_SIZE.large.height;
const CARD_X = DISPLAY.width / 2;
const CARD_Y = 142;
// The chest is the kit's 12px chest icon blown up by a whole number.
const CHEST_SCALE = 6;
const CHEST_Y = 142;       // centre of the chest
const CHEST_W = (12 * CHEST_SCALE);
const CHEST_H = (12 * CHEST_SCALE);
const LID_Y = CHEST_Y - CHEST_H / 4;   // where the light pours out
// Build-up glow starts neutral white so the shift toward any rarity colour
// (including Legendary's orange) reads as the hint.
const HINT_START = 0xffffff;
const CONFETTI_COLORS = [0xffd54f, 0xe53935, 0xffffff, 0x66bb6a, 0x29b6f6];


// Overlay scene for opening treasure chests (packs). Launched on top of
// GameScene with { progress, onClose }; the full-screen backdrop swallows
// clicks underneath.
//
// Opening flow: build-up (the chest rattles, glows, and light leaks out of
// it in a colour that hints the rarity) → open (light spills out and the hero
// card rises out) → reveal (chime, glow, confetti for new heroes)
// → new-crewmate splash.
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

    // Title plate and a parchment strip with the wallet, rates and pity.
    panel(this, CARD_X - 80, 4, 160, 20, 'wood');
    text(this, CARD_X, 14, 'TREASURE CHEST', light()).setOrigin(0.5);
    panel(this, CARD_X - 150, 28, 300, 34, 'parchment');
    this.walletText = text(this, CARD_X, 32, '', dark({ font: 'small' })).setOrigin(0.5, 0);
    const rates = Progress.packRates()
      .map(({ rarity, chance }) => `${RARITY[rarity].label} ${Math.round(chance * 100)}%`).join('  ');
    text(this, CARD_X, 42, rates.toUpperCase(), subText()).setOrigin(0.5, 0);
    this.pityText = text(this, CARD_X, 52, '', subText({ color: UI.colors.warn })).setOrigin(0.5, 0);

    this.chestGlow = this.add.rectangle(CARD_X, CHEST_Y, CHEST_W + 30, CHEST_H + 30, 0xffffff, 0);
    this.light = this.add.graphics({ x: CARD_X, y: LID_Y });
    this.buildChest();
    this.cardGlow = this.add.rectangle(CARD_X, CARD_Y, CARD_W + 12, CARD_H + 12, 0xffffff, 0).setVisible(false);
    this.card = this.add.container(CARD_X, CARD_Y).setVisible(false);

    this.resultText = text(this, CARD_X, 233, '', light({ font: 'big' })).setOrigin(0.5);

    this.openButton = new Button(this, CARD_X - 50, 257, {
      width: 90, height: 22, style: 'gold', icon: 'pearl', label: '',
      onClick: () => this.openPack(),
    });
    this.closeButton = new Button(this, CARD_X + 50, 257, {
      width: 90, height: 22, label: 'Done',
      onClick: () => this.close(),
    });
    this.refresh();
  }

  refresh() {
    const { pearls } = this.progress;
    const cost = this.progress.packCost;
    this.walletText.setText(`YOU HAVE ${pearlsLabel(pearls).toUpperCase()}  -  A CHEST COSTS ${cost}`);
    this.openButton.setLabel(`Open ${cost}`);
    // Hold the pity line while a chest is opening: the counter resets the
    // moment a Legendary is rolled, which would spoil the reveal.
    if (!this.busy) {
      const n = this.progress.packsUntilPity;
      this.pityText.setText(n <= 1
        ? 'NEXT CHEST IS A GUARANTEED LEGENDARY!'
        : `LEGENDARY GUARANTEED WITHIN ${n} CHESTS`);
    }
    this.openButton.setEnabled(!this.busy && this.progress.canOpenPack);
    this.closeButton.setEnabled(!this.busy);
  }

  // Small white bar used for confetti.
  ensureConfettiTexture() {
    if (this.textures.exists('confetti')) return;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0xffffff).fillRect(0, 0, 4, 2);
    g.generateTexture('confetti', 4, 2);
    g.destroy();
  }

  // --- The chest ---

  // The chest: the kit's chest icon, scaled up.
  buildChest() {
    this.chest = this.add.container(CARD_X, CHEST_Y);
    const body = icon(this, 0, 0, 'chest').setScale(CHEST_SCALE);
    // Light leaking out of the chest during the build-up.
    this.seam = this.add.rectangle(0, -CHEST_H / 4, CHEST_W - 16, 2, 0xffffff, 0);
    this.tapText = text(this, 0, CHEST_H / 2 + 8, 'TAP OPEN', { font: 'small', ...light() }).setOrigin(0.5);
    this.chest.add([body, this.seam, this.tapText]);
  }

  // Put the chest back for the next opening.
  resetChest() {
    this.tweens.killTweensOf([this.chest, this.light, this.cardGlow, this.card]);
    this.chest.setPosition(CARD_X, CHEST_Y).setAngle(0).setAlpha(1).setVisible(true);
    this.seam.setFillStyle(0xffffff, 0);
    this.tapText.setVisible(false);
    this.light.clear().setAlpha(0).setScale(1);
    this.chestGlow.setFillStyle(HINT_START, 0).setScale(1).setAlpha(1);
    this.cardGlow.setVisible(false);
    this.card.removeAll(true).setVisible(false);
  }

  // Fan of light rays pouring up out of the open chest.
  drawLight(color) {
    const g = this.light.clear();
    const RAYS = 9;
    for (let i = 0; i < RAYS; i++) {
      const x0 = -CHEST_W / 2 + 6 + (i / (RAYS - 1)) * (CHEST_W - 12);
      const spread = x0 * 1.9;
      g.fillStyle(color, i % 2 ? 0.22 : 0.34);
      g.fillTriangle(x0 - 5, 0, x0 + 5, 0, spread, -140);
    }
    g.fillStyle(0xffffff, 0.5).fillRect(-CHEST_W / 2 + 4, -2, CHEST_W - 8, 3);
  }

  // --- Flow ---

  openPack() {
    if (this.busy) return;
    const result = this.progress.openPack();
    if (!result) return;
    saveProgress(this.progress);
    this.busy = true;
    this.resultText.setText('');
    this.resetChest();
    this.refresh();
    this.buildUp(result);
  }

  // Rattle harder and glow brighter over a rarity-dependent time. The glow and
  // the light leaking from the chest are white at first and shift to the rarity
  // colour near the end.
  buildUp(result) {
    const rarity = HEROES[result.id].rarity;
    const duration = PACK_FX.buildUp[rarity];
    const maxAngle = PACK_FX.shakeAngle[rarity];
    const from = Phaser.Display.Color.ValueToColor(HINT_START);
    const to = Phaser.Display.Color.ValueToColor(RARITY[rarity].color);
    const hintStart = 1 - PACK_FX.hintFraction;

    sfx.shake(duration, rarity);
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration,
      onUpdate: (tween) => {
        const k = tween.getValue();
        const t = tween.elapsed;
        const amp = maxAngle * (0.25 + 0.75 * k);
        this.chest.setAngle(Math.sin(t / 32) * amp * 0.6);
        this.chest.x = CARD_X + Math.sin(t / 21) * amp * 0.25;
        this.chest.y = CHEST_Y - Math.abs(Math.sin(t / 55)) * amp * 0.3;   // little hops

        const hint = k < hintStart ? 0 : (k - hintStart) / PACK_FX.hintFraction;
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 100, hint * 100);
        const color = Phaser.Display.Color.GetColor(c.r, c.g, c.b);
        this.seam.setFillStyle(color, 0.3 + 0.7 * k);
        this.chestGlow
          .setFillStyle(color, 0.12 + 0.55 * k)
          .setScale(1 + 0.08 * k + 0.02 * Math.sin(t / 50));
      },
      onComplete: () => this.open(result),
    });
  }

  // Light spills out of the chest and the hero card rises from it.
  open(result) {
    const rarityColor = RARITY[HEROES[result.id].rarity].color;
    this.chest.setAngle(0).setPosition(CARD_X, CHEST_Y);
    this.seam.setFillStyle(rarityColor, 0);
    this.drawLight(rarityColor);
    this.light.setScale(1, 0.2);
    this.card.removeAll(true).add(createHeroCard(this, 0, 0, result.id, { stars: result.isNew ? 0 : result.stars }));
    this.card.setPosition(CARD_X, CHEST_Y + 40).setAlpha(0).setVisible(true);
    sfx.flip();

    this.tweens.add({ targets: this.light, alpha: 1, scaleY: 1, duration: 320, ease: 'Quad.easeOut' });
    this.tweens.add({
      // Slides up (never scaled, so its text stays 1x) on whole pixels.
      targets: this.card, y: CARD_Y, alpha: 1, duration: 480, delay: 260, ease: 'Back.easeOut',
      onUpdate: () => { this.card.y = Math.round(this.card.y); },
      onComplete: () => this.reveal(result),
    });
    this.tweens.add({ targets: this.chest, alpha: 0, duration: 300, delay: 420 });
    this.tweens.add({ targets: [this.light, this.chestGlow], alpha: 0, duration: 700, delay: 600 });
  }

  reveal(result) {
    const rarity = HEROES[result.id].rarity;
    const rarityColor = RARITY[rarity].color;
    sfx.reveal(rarity, result.isNew);
    const flash = PACK_FX.revealFlash[rarity];
    if (flash) this.cameras.main.flash(flash, 255, 236, 179);

    this.cardGlow.setFillStyle(rarityColor, 0.55).setVisible(true).setScale(0.95).setAlpha(1);
    this.tweens.add({ targets: this.cardGlow, scale: 1.1, alpha: 0.5, duration: 700, yoyo: true, repeat: -1 });

    // Short headline in the big font; the card shows who it is, and the splash
    // says where a new crewmate goes.
    let message;
    let color = UI.colors.text;
    if (result.isNew) {
      message = 'NEW CREWMATE!';
    } else if (result.refund) {
      message = `MAX STARS! +${pearlsLabel(result.refund).toUpperCase()}`;
    } else {
      message = '+1 STAR!';
      color = cssColor(rarityColor);
    }
    if (result.pity) message = `PITY! ${message}`;
    this.resultText.setText(message).setColor(color).setAlpha(0);
    this.tweens.add({ targets: this.resultText, alpha: 1, duration: 250 });

    if (result.isNew) {
      this.confetti(CARD_X, CARD_Y - 20, PACK_FX.confetti[rarity], rarityColor);
      this.time.delayedCall(PACK_FX.splashDelay, () => this.showSplash(result));
    } else {
      this.busy = false;
      this.refresh();
    }
  }

  confetti(x, y, count, rarityColor) {
    const emitter = this.add.particles(x, y, 'confetti', {
      speed: { min: 110, max: 280 },
      angle: { min: 200, max: 340 },  // upward fan
      gravityY: 325,
      lifespan: { min: 1400, max: 2400 },
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
    const cardY = 124;
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
      rays.fillTriangle(0, 0, Math.cos(a) * 300, Math.sin(a) * 300, Math.cos(b) * 300, Math.sin(b) * 300);
    }
    this.tweens.add({ targets: rays, angle: 360, duration: 16000, repeat: -1 });

    const legendary = def.rarity === 'legendary';
    const titleText = text(this, 0, 0, legendary ? 'NEW LEGENDARY CREWMATE!' : 'NEW CREWMATE!', {
      ...light({ color: '#ffd86a' }), font: 'big',
    }).setOrigin(0.5);
    const titleW = titleText.inkWidth + 20;
    const title = this.add.container(cx, 22, [
      panel(this, -titleW / 2, -17, titleW, 34, 'wood'), titleText,
    ]);
    const card = createHeroCard(this, cx, cardY, result.id, { stars: 0 });
    const quoteText = text(this, 0, 0, `"${def.catchphrase}"`, dark({ align: 'center', wrap: 400 }))
      .setOrigin(0.5);
    const quoteH = quoteText.inkHeight + 12;
    const quote = this.add.container(cx, 226, [
      panel(this, -212, -quoteH / 2, 424, quoteH, 'parchment'), quoteText,
    ]);
    const where = text(this, cx, 249, result.slot >= 0
      ? `JOINS SLOT ${result.slot + 1}` : 'ASSIGN A SLOT ON THE SHIP', light({ font: 'small' })).setOrigin(0.5);
    const hint = text(this, cx, 262, 'TAP ANYWHERE TO CONTINUE', { font: 'small', ...light() })
      .setOrigin(0.5).setAlpha(0);

    splash.add([backdrop, rays, title, card, quote, where, hint]);

    // Entrance
    // Entrance: slide in and fade, never scaled, so text stays 1x.
    card.setAlpha(0).setY(cardY + 24);
    title.setAlpha(0).setY(title.y - 16);
    quote.setAlpha(0);
    where.setAlpha(0);
    const snap = (o) => () => { o.y = Math.round(o.y); };
    this.tweens.add({ targets: card, y: cardY, alpha: 1, duration: 450, ease: 'Back.easeOut', onUpdate: snap(card) });
    this.tweens.add({
      targets: title, y: title.y + 16, alpha: 1, duration: 350, delay: 100, ease: 'Back.easeOut', onUpdate: snap(title),
    });
    this.tweens.add({ targets: [quote, where], alpha: 1, duration: 400, delay: 450 });
    this.tweens.add({ targets: hint, alpha: 1, duration: 300, delay: 900 });

    // Ignore clicks for a moment so the opening click can't skip it by accident.
    let canDismiss = false;
    this.time.delayedCall(600, () => { canDismiss = true; });
    backdrop.on('pointerdown', () => {
      if (!canDismiss) return;
      sfx.click();
      this.tweens.killTweensOf([rays, card, title, quote, where, hint]);
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
