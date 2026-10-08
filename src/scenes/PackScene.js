import Phaser from 'phaser';
import { DISPLAY, HEROES, PACK_FX, RARITY } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, RENDER_SCALE } from '../display.js';
import { Progress } from '../systems/Progress.js';
import { saveProgress } from '../systems/Save.js';
import { Button } from '../ui/Button.js';
import { createHeroCard, HERO_CARD_SIZE } from '../ui/HeroCard.js';
import { cssColor, pearlsLabel } from '../ui/format.js';

const CARD_W = HERO_CARD_SIZE.width;
const CARD_H = HERO_CARD_SIZE.height;
const CARD_X = DISPLAY.width / 2;
const CARD_Y = 270;
const CHEST_Y = 300;           // centre of the chest body
const CHEST_W = 200;
const CHEST_H = 110;
const LID_Y = CHEST_Y - CHEST_H / 2;   // hinge line, top of the body
const GOLD = 0xc9a227;
// Build-up glow starts neutral white so the shift toward any rarity colour
// (including Legendary's orange) reads as the hint.
const HINT_START = 0xffffff;
const CONFETTI_COLORS = [0xffd54f, 0xe53935, 0xffffff, 0x66bb6a, 0x29b6f6];

const TEXT = { fontFamily: 'sans-serif', color: '#ffffff' };

// Overlay scene for opening treasure chests (packs). Launched on top of
// GameScene with { progress, onClose }; the full-screen backdrop swallows
// clicks underneath.
//
// Opening flow: build-up (the chest rattles, glows, and light leaks from the
// lid in a colour that hints the rarity) → open (lid swings back, light spills
// out, the hero card rises out) → reveal (chime, glow, confetti for new heroes)
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

    this.add.text(CARD_X, 36, 'Treasure Chest', { ...TEXT, fontSize: '30px', fontStyle: 'bold', color: '#ffd54f' })
      .setOrigin(0.5);
    this.walletText = this.add.text(CARD_X, 72, '', { ...TEXT, fontSize: '16px' }).setOrigin(0.5);
    const rates = Progress.packRates()
      .map(({ rarity, chance }) => `${RARITY[rarity].label} ${Math.round(chance * 100)}%`).join('  ·  ');
    this.add.text(CARD_X, 96, rates, { ...TEXT, fontSize: '13px', color: '#b0bec5' }).setOrigin(0.5);
    this.pityText = this.add.text(CARD_X, 116, '', { ...TEXT, fontSize: '13px', color: '#ffb74d' }).setOrigin(0.5);

    this.chestGlow = this.add.rectangle(CARD_X, CHEST_Y - 10, CHEST_W + 60, CHEST_H + 90, 0xffffff, 0);
    this.light = this.add.graphics({ x: CARD_X, y: LID_Y });
    this.buildChest();
    this.cardGlow = this.add.rectangle(CARD_X, CARD_Y, CARD_W + 36, CARD_H + 36, 0xffffff, 0).setVisible(false);
    this.card = this.add.container(CARD_X, CARD_Y).setVisible(false);

    this.resultText = this.add.text(CARD_X, 418, '', { ...TEXT, fontSize: '20px', fontStyle: 'bold', align: 'center' })
      .setOrigin(0.5);

    this.openButton = new Button(this, CARD_X - 100, 480, {
      width: 180, height: 44, label: '', color: 0x8d5a17, fontSize: '18px',
      onClick: () => this.openPack(),
    });
    this.closeButton = new Button(this, CARD_X + 100, 480, {
      width: 180, height: 44, label: 'Done', color: 0x546e7a, fontSize: '18px',
      onClick: () => this.close(),
    });
    this.refresh();
  }

  refresh() {
    const { pearls } = this.progress;
    const cost = this.progress.packCost;
    this.walletText.setText(`You have ${pearlsLabel(pearls)}  ·  A chest costs ${pearlsLabel(cost)}`);
    this.openButton.setLabel(`Open (${pearlsLabel(cost)})`);
    // Hold the pity line while a chest is opening: the counter resets the
    // moment a Legendary is rolled, which would spoil the reveal.
    if (!this.busy) {
      const n = this.progress.packsUntilPity;
      this.pityText.setText(n <= 1
        ? 'Next chest is a guaranteed Legendary!'
        : `Legendary guaranteed within ${n} chests`);
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

  // --- The chest ---

  // Wooden chest with gold bands. The lid is its own container, hinged at the
  // top of the body, so it can rattle and swing open.
  buildChest() {
    this.chest = this.add.container(CARD_X, CHEST_Y);
    const body = this.add.graphics();
    body.fillStyle(0x6d4520).fillRect(-CHEST_W / 2, -CHEST_H / 2, CHEST_W, CHEST_H);
    body.lineStyle(1, 0x4a2c12, 0.8);
    for (let y = -CHEST_H / 2 + 22; y < CHEST_H / 2; y += 22) body.lineBetween(-CHEST_W / 2, y, CHEST_W / 2, y);
    body.fillStyle(GOLD);
    for (const x of [-CHEST_W / 2 + 22, CHEST_W / 2 - 36]) body.fillRect(x, -CHEST_H / 2, 14, CHEST_H);
    body.fillRect(-16, -CHEST_H / 2 + 6, 32, 36);              // lock plate
    body.fillStyle(0x2b1a0b).fillCircle(0, -CHEST_H / 2 + 20, 4).fillRect(-2, -CHEST_H / 2 + 22, 4, 10);
    body.lineStyle(3, 0x3e2410).strokeRect(-CHEST_W / 2, -CHEST_H / 2, CHEST_W, CHEST_H);

    // Light leaking through the lid seam during the build-up.
    this.seam = this.add.rectangle(0, -CHEST_H / 2, CHEST_W - 8, 4, 0xffffff, 0);

    this.lid = this.add.container(0, -CHEST_H / 2);
    const lid = this.add.graphics();
    lid.fillStyle(0x7a4e24).fillRoundedRect(-CHEST_W / 2 - 4, -48, CHEST_W + 8, 48, { tl: 24, tr: 24, bl: 0, br: 0 });
    lid.fillStyle(GOLD);
    for (const x of [-CHEST_W / 2 + 22, CHEST_W / 2 - 36]) lid.fillRect(x, -46, 14, 46);
    lid.lineStyle(3, 0x3e2410).strokeRoundedRect(-CHEST_W / 2 - 4, -48, CHEST_W + 8, 48, { tl: 24, tr: 24, bl: 0, br: 0 });
    this.lid.add(lid);

    this.tapText = this.add.text(0, CHEST_H / 2 + 26, 'Tap Open', { ...TEXT, fontSize: '14px', color: '#ffe082' })
      .setOrigin(0.5);
    this.chest.add([body, this.seam, this.lid, this.tapText]);
  }

  // Close the lid and put the chest back for the next opening.
  resetChest() {
    this.tweens.killTweensOf([this.chest, this.lid, this.light, this.cardGlow, this.card]);
    this.chest.setPosition(CARD_X, CHEST_Y).setAngle(0).setAlpha(1).setVisible(true);
    this.lid.setPosition(0, -CHEST_H / 2).setScale(1).setAngle(0);
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
      const x0 = -CHEST_W / 2 + 12 + (i / (RAYS - 1)) * (CHEST_W - 24);
      const spread = x0 * 1.9;
      g.fillStyle(color, i % 2 ? 0.22 : 0.34);
      g.fillTriangle(x0 - 10, 0, x0 + 10, 0, spread, -280);
    }
    g.fillStyle(0xffffff, 0.5).fillRect(-CHEST_W / 2 + 6, -4, CHEST_W - 12, 6);
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
  // the light leaking from the lid are white at first and shift to the rarity
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
        this.chest.x = CARD_X + Math.sin(t / 21) * amp * 0.5;
        this.chest.y = CHEST_Y - Math.abs(Math.sin(t / 55)) * amp * 0.6;   // little hops
        this.lid.y = -CHEST_H / 2 - Math.abs(Math.sin(t / 37)) * (1 + 5 * k);  // lid jiggles

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

  // Lid swings back, light spills out, and the hero card rises from the chest.
  open(result) {
    const rarityColor = RARITY[HEROES[result.id].rarity].color;
    this.chest.setAngle(0).setPosition(CARD_X, CHEST_Y);
    this.seam.setFillStyle(rarityColor, 0);
    this.drawLight(rarityColor);
    this.light.setScale(1, 0.2);
    this.card.removeAll(true).add(createHeroCard(this, 0, 0, result.id, { stars: result.isNew ? 0 : result.stars }));
    this.card.setPosition(CARD_X, CHEST_Y).setScale(0.15).setAlpha(0).setVisible(true);
    sfx.flip();

    this.tweens.add({ targets: this.lid, y: -CHEST_H / 2 - 34, scaleY: 0.3, duration: 220, ease: 'Back.easeOut' });
    this.tweens.add({ targets: this.light, alpha: 1, scaleY: 1, duration: 320, ease: 'Quad.easeOut' });
    this.tweens.add({
      targets: this.card, y: CARD_Y, scale: 1, alpha: 1, duration: 480, delay: 260, ease: 'Back.easeOut',
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

    const name = HEROES[result.id].name;
    let message;
    let color;
    if (result.pity) {
      message = `Pity! `;
    }
    if (result.isNew) {
      message = (message ?? '') + (result.slot >= 0
        ? `NEW CREWMATE! ${name} joins slot ${result.slot + 1}`
        : `NEW CREWMATE! ${name} — assign a slot on the ship`);
      color = '#ffd54f';
    } else if (result.refund) {
      message = (message ?? '') + `${name} is at max stars — +${pearlsLabel(result.refund)} back`;
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
    const title = this.add.text(cx, 42, legendary ? 'NEW LEGENDARY CREWMATE!' : 'NEW CREWMATE!', {
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
