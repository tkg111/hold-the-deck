import Phaser from 'phaser';
import {
  DISPLAY, EXPEDITIONS, HEROES, PACK_FX, PACKS, PARTS, RARITY, SPRITES, UI_KIT,
} from '../config.js';
import { gameMaterials } from '../systems/Parts.js';
import { materialIcon } from '../ui/parts.js';
import { traitOf } from '../systems/Expeditions.js';
import {
  allPacks, bannerKey, PACK_DATA, unlockLabel,
} from '../systems/Packs.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, fillView } from '../display.js';
import { Progress } from '../systems/Progress.js';
import { saveProgress } from '../systems/Save.js';
import { Button } from '../ui/Button.js';
import { createHeroCard, HERO_CARD_SIZE } from '../ui/HeroCard.js';
import { cssColor, formatNum, pearlsLabel } from '../ui/format.js';
import {
  face, hexColor, icon, dark, light, panel, starRow, subText, text, traitIcon, UI,
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
// "Buy 10" results: a grid of small tiles where the chest stands.
const TILE_W = 84;
const TILE_H = 50;
const TILE_GAP = 6;
const TILE_COLS = 5;
const TILES_TOP = 74;


// Overlay scene for opening treasure chests. Launched on top of GameScene
// with { progress, onClose }; the full-screen backdrop swallows clicks
// underneath.
//
// The screen: the pack carousel (each pack's banner; arrows or a swipe turn
// it) over the pack's details (its crew, owned ones in colour with their
// stars and the rest as silhouettes, its odds and how many are found), and
// Open / Buy 10 under them, from the pack in the middle. Free chests open
// from whichever unlocked pack is chosen.
//
// Opening flow: build-up (the chest rattles, glows, and light leaks out of
// it in a colour that hints the rarity) → open (light spills out and the hero
// card rises out) → reveal (chime, glow, confetti for new heroes)
// → new-crewmate splash. The carousel and details come back with a tap, or
// when the pack is turned.
export class PackScene extends Phaser.Scene {
  constructor() {
    super('PackScene');
  }

  init({ progress, onClose }) {
    this.progress = progress;
    this.onClose = onClose;
    this.busy = false;
    this.showingResult = false;
    this.packs = allPacks();
    // A pack unlocked since it was last looked at first, then the last one
    // opened, then the first.
    const p = progress;
    const first = p.unseenPacks[0] ?? (p.lastPack && p.isPackUnlocked(p.lastPack) ? p.lastPack : null);
    this.index = Math.max(0, this.packs.findIndex((pack) => pack.id === first));
  }

  get pack() { return this.packs[this.index]; }

  create() {
    applyRenderScale(this);
    this.ensureConfettiTexture();
    fillView(this, 0x000000, 0.8);

    panel(this, CARD_X - 80, 4, 160, 20, 'wood');
    this.titleText = text(this, CARD_X, 14, 'TREASURE CHESTS', light()).setOrigin(0.5);

    this.carousel = this.buildCarousel();
    this.details = this.add.container(0, 0);

    this.chestGlow = this.add.rectangle(CARD_X, CHEST_Y, CHEST_W + 30, CHEST_H + 30, 0xffffff, 0);
    this.light = this.add.graphics({ x: CARD_X, y: LID_Y });
    this.buildChest();
    this.cardGlow = this.add.rectangle(CARD_X, CARD_Y, CARD_W + 12, CARD_H + 12, 0xffffff, 0).setVisible(false);
    this.card = this.add.container(CARD_X, CARD_Y).setVisible(false);

    this.resultText = text(this, CARD_X, 233, '', light({ font: 'big' })).setOrigin(0.5);
    // After a reveal, a tap on the result goes back to the pack.
    this.resultZone = this.add.zone(CARD_X, 150, 300, 170).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.backToPack());
    this.resultZone.disableInteractive();
    this.backHint = text(this, CARD_X, 32, 'TAP TO SEE THE PACK', { font: 'small', ...light() }).setOrigin(0.5).setVisible(false);

    this.bulkGrid = this.add.container(0, 0);
    this.materialStrip = this.drawMaterials();

    this.openButton = new Button(this, CARD_X - 100, 257, {
      width: 90, height: 22, style: 'gold', icon: 'pearl', label: '',
      onClick: () => this.openPack(),
    });
    this.bulkButton = new Button(this, CARD_X, 257, {
      width: 90, height: 22, style: 'gold', icon: 'pearl', label: `Buy ${PACKS.bulkCount}  ${formatNum(PACKS.bulkCost)}`,
      onClick: () => this.openBulk(),
    });
    this.closeButton = new Button(this, CARD_X + 100, 257, {
      width: 90, height: 22, label: 'Done',
      onClick: () => this.close(),
    });
    this.showPack();
  }

  // --- The carousel ---

  // A banner per pack, side by side PACKS.carousel.gap apart (the middle one
  // is the chosen pack), with arrows either side and a swipe zone over them.
  buildCarousel() {
    const { y, swipe } = PACKS.carousel;
    const [bw, bh] = PACK_DATA.size;
    const c = this.add.container(0, 0);
    this.banners = this.packs.map((pack) => {
      const b = this.add.container(0, y + bh / 2);
      const locked = !this.progress.isPackUnlocked(pack.id);
      if (pack.banner && this.textures.exists(bannerKey(pack.banner))) b.add(this.add.image(0, 0, bannerKey(pack.banner)));
      else b.add(panel(this, -bw / 2, -bh / 2, bw, bh, 'wood'));
      if (locked && PACK_DATA.lockedOverlay) b.add(this.add.image(0, 0, bannerKey(PACK_DATA.lockedOverlay)));
      // The name on a dark strip along the top, in the main font if it fits.
      const name = pack.name.toUpperCase();
      let label = text(this, 0, 0, name, light());
      if (label.inkWidth > bw - 8) {
        label.destroy();
        label = text(this, 0, 0, name, light({ font: 'small' }));
      }
      const stripH = label.inkHeight + 6;
      b.add(this.add.rectangle(0, -bh / 2 + stripH / 2, bw - 4, stripH, 0x000000, 0.45));
      b.add(label.setOrigin(0.5).setPosition(0, Math.round(-bh / 2 + stripH / 2)));
      if (locked) {
        const req = text(this, 0, 0, unlockLabel(pack).toUpperCase(), light({ font: 'small', color: UI.colors.warn })).setOrigin(0.5);
        const reqH = req.inkHeight + 6;
        b.add(this.add.rectangle(0, bh / 2 - reqH / 2, bw - 4, reqH, 0x000000, 0.6));
        b.add(req.setPosition(0, Math.round(bh / 2 - reqH / 2)));
      }
      // Shades the banner when it isn't the chosen one.
      b.shade = this.add.rectangle(0, 0, bw, bh, 0x000000, 0);
      b.add(b.shade);
      b.newDot = this.add.circle(bw / 2 - 5, -bh / 2 + 4, UI_KIT.dotRadius, hexColor(UI.colors.warn))
        .setStrokeStyle(1, hexColor(UI.colors.textOnParchment));
      b.add(b.newDot);
      c.add(b);
      return b;
    });
    const arrow = (dx, step, angle) => {
      const b = new Button(this, CARD_X + dx, y + bh / 2, {
        width: 18, height: 18, icon: 'arrow_up', onClick: () => this.turn(step),
      });
      b.icon.setAngle(angle);
      return b;
    };
    this.prevArrow = arrow(-bw / 2 - 14, -1, -90);
    this.nextArrow = arrow(bw / 2 + 14, 1, 90);
    c.add([this.prevArrow, this.nextArrow]);
    // A swipe across the banners turns the carousel.
    const zone = this.add.zone(CARD_X, y + bh / 2, DISPLAY.width - 140, bh).setInteractive();
    zone.on('pointerdown', (pointer) => { this.swipeFrom = pointer.x; });
    zone.on('pointerup', (pointer) => {
      if (this.swipeFrom == null) return;
      const dx = pointer.x - this.swipeFrom;
      this.swipeFrom = null;
      if (Math.abs(dx) >= swipe) this.turn(dx < 0 ? 1 : -1);
    });
    c.addAt(zone, 0);
    this.placeBanners(false);
    return c;
  }

  // The banners round the chosen one (sliding there unless instant), the
  // others shaded.
  placeBanners(slide = true) {
    const { gap, sideShade, slideMs } = PACKS.carousel;
    this.banners.forEach((b, i) => {
      const x = CARD_X + (i - this.index) * gap;
      const shade = i === this.index ? 0 : sideShade;
      this.tweens.killTweensOf([b, b.shade]);
      if (slide) {
        this.tweens.add({
          targets: b, x, duration: slideMs, ease: 'Quad.easeOut', onUpdate: () => { b.x = Math.round(b.x); },
        });
        this.tweens.add({ targets: b.shade, fillAlpha: shade, duration: slideMs });
      } else {
        b.setPosition(x, b.y);
        b.shade.setFillStyle(0x000000, shade);
      }
      b.newDot.setVisible(this.progress.unseenPacks.includes(this.packs[i].id));
    });
    this.prevArrow.setEnabled(this.index > 0);
    this.nextArrow.setEnabled(this.index < this.packs.length - 1);
  }

  turn(step) {
    if (this.busy) return;
    const index = Phaser.Math.Clamp(this.index + step, 0, this.packs.length - 1);
    if (index === this.index && !this.showingResult) return;
    sfx.click();
    this.index = index;
    this.showPack();
  }

  // The chosen pack: looked at now (its "new" dot goes), its details, and
  // the screen back from any result.
  showPack() {
    this.progress.markPackSeen(this.pack.id);
    saveProgress(this.progress);
    this.showingResult = false;
    this.resetChest();
    this.chest.setVisible(false);
    this.resultText.setText('');
    this.placeBanners(true);
    this.drawDetails();
    this.refresh();
  }

  backToPack() {
    if (this.busy || !this.showingResult) return;
    sfx.click();
    this.showPack();
  }

  // --- The details ---

  // Parchment under the carousel: the pack's odds (and the Abyss blessing),
  // a cell per crewmate (owned in colour with their stars, the rest a dark
  // silhouette with "?", each over its rarity's colour), how many are found,
  // and the wallet and pity lines.
  drawDetails() {
    const p = this.progress;
    const { pack } = this;
    const {
      x, y, width: w, cell, cols,
    } = PACKS.details;
    const crew = pack.crew;
    const rows = Math.ceil(crew.length / cols);
    const d = this.details.removeAll(true);
    // As tall as its rows of crew need.
    d.add(panel(this, x, y, w, 26 + rows * cell.height + 26, 'parchment'));
    const cx = x + w / 2;
    const rates = Progress.packRates(pack.id, p.abyssBlessed)
      .map(({ rarity, chance }) => `${RARITY[rarity].label} ${+(chance * 100).toFixed(1)}%`).join('  ');
    d.add(text(this, cx, y + 6, rates.toUpperCase(), subText()).setOrigin(0.5, 0));
    const { depth, legendary } = PACKS.abyssBlessing;
    const blessing = p.abyssBlessed
      ? text(this, cx, y + 15, `ABYSS BLESSING: LEGENDARY X${legendary}`, subText({ color: cssColor(RARITY.legendary.color) }))
      : text(this, cx, y + 15, `REACH ABYSS DEPTH ${depth}: LEGENDARY X${legendary}`, subText()).setAlpha(0.5);
    d.add(blessing.setOrigin(0.5, 0));

    const gridTop = y + 26;
    crew.forEach((id, i) => {
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, crew.length - row * cols);
      const left = cx - (inRow * cell.width) / 2;
      const ccx = Math.round(left + (i % cols + 0.5) * cell.width);
      const top = gridTop + row * cell.height;
      d.add(this.crewCell(id, ccx, top));
    });

    const owned = p.packOwnedCount(pack.id);
    const infoY = gridTop + rows * cell.height + 2;
    d.add(text(this, x + 10, infoY, `CREW FOUND ${owned}/${crew.length}`, subText()));
    this.walletText = text(this, x + w - 10, infoY, '', subText()).setOrigin(1, 0);
    this.pityText = text(this, cx, infoY + 10, '', subText({ color: UI.colors.warn })).setOrigin(0.5, 0);
    d.add([this.walletText, this.pityText]);
  }

  // A crewmate's cell: their 32x32 sprite over a strip in their rarity's
  // colour, and their stars (owned) or a "?" (not found yet).
  crewCell(id, x, top) {
    const p = this.progress;
    const owned = p.isOwned(id);
    const sprite = SPRITES.heroes[id];
    const c = this.add.container(x, top);
    c.add(this.add.rectangle(0, 33, 30, 2, RARITY[HEROES[id].rarity].color));
    const img = sprite && this.textures.exists(sprite.key)
      ? this.add.image(0, 32, sprite.key).setOrigin(0.5, 1)
      : this.add.rectangle(0, 32, 16, 26, HEROES[id].color).setOrigin(0.5, 1);
    c.add(img);
    if (owned) {
      c.add(starRow(this, 0, 38, p.heroStarCount(id), PACKS.maxStars));
    } else {
      if (img.setTintFill) img.setTintFill(0x1a120c);
      else img.setFillStyle(0x1a120c);
      img.setAlpha(0.85);
      c.add(text(this, 0, 20, '?', light()).setOrigin(0.5));
    }
    return c;
  }

  refresh() {
    const p = this.progress;
    const { pearls, freeChestCount: free, nextFreeChest: next, freeLegendaryChests: legendary } = p;
    const cost = p.packCost;
    const unlocked = p.isPackUnlocked(this.pack.id);
    const picking = !this.busy && !this.showingResult;
    this.carousel.setVisible(picking);
    this.details.setVisible(picking);
    this.materialStrip.setVisible(picking || (this.showingResult && !this.bulkGrid.length));
    this.titleText.setText(picking ? 'TREASURE CHESTS' : this.pack.name.toUpperCase());
    this.backHint.setVisible(this.showingResult && !this.busy);
    if (this.showingResult && !this.busy) this.resultZone.setInteractive({ useHandCursor: true });
    else this.resultZone.disableInteractive();
    this.walletText?.setText(`${pearlsLabel(pearls).toUpperCase()} - A CHEST COSTS ${formatNum(cost)}`);
    // Free chests (an island's Legendary ones, expeditions' finds) open
    // first, the best tier first, at no cost, from the chosen pack.
    this.openButton.setIcon(free || !unlocked ? null : 'pearl')
      .setLabel(!unlocked ? 'Locked' : free ? `Open free x${free}` : `Open ${formatNum(cost)}`);
    // Hold the pity line while a chest is opening: the counter resets the
    // moment a Legendary is rolled, which would spoil the reveal.
    if (!this.busy && this.pityText) {
      const n = p.packsUntilPity;
      const plural = free > 1 ? 'S' : '';
      this.pityText.setText(free
        ? (legendary === free
          ? `${free} FREE LEGENDARY CHEST${plural} - OPEN FROM ANY PACK`
          : `${free} FREE CHEST${plural} - NEXT: ${EXPEDITIONS.chests[next].label.toUpperCase()}`)
        : n <= 1
          ? 'NEXT CHEST IS A GUARANTEED LEGENDARY!'
          : `LEGENDARY GUARANTEED WITHIN ${n} CHESTS`);
    }
    this.openButton.setEnabled(!this.busy && p.canOpenFrom(this.pack.id));
    this.bulkButton.setEnabled(!this.busy && p.canOpenBulkFrom(this.pack.id));
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
    this.chest.add([body, this.seam]);
  }

  // Put the chest back for the next opening.
  resetChest() {
    this.tweens.killTweensOf([this.chest, this.light, this.cardGlow, this.card]);
    this.chest.setPosition(CARD_X, CHEST_Y).setAngle(0).setAlpha(1).setVisible(true);
    this.seam.setFillStyle(0xffffff, 0);
    this.light.clear().setAlpha(0).setScale(1);
    this.chestGlow.setFillStyle(HINT_START, 0).setScale(1).setAlpha(1);
    this.cardGlow.setVisible(false);
    this.card.removeAll(true).setVisible(false);
    this.bulkGrid.removeAll(true);
  }

  // The Materials strip down the left edge: each boss material in the game
  // and how many are held (ones never found dark, with a dash). Hidden
  // while a "Buy 10" grid covers it.
  drawMaterials() {
    const { x, y, width: w, rowHeight } = PARTS.strip;
    const mats = gameMaterials();
    const strip = this.add.container(0, 0);
    if (!mats.length) return strip;
    const h = 22 + (mats.length - 1) * rowHeight + 16;
    strip.add(panel(this, x, y, w, h, 'parchment'));
    strip.add(text(this, x + w / 2, y + 7, 'MATERIALS', subText()).setOrigin(0.5, 0));
    mats.forEach((m, i) => {
      const ry = y + 22 + i * rowHeight;
      const found = this.progress.hasFoundMaterial(m.id);
      const img = materialIcon(this, x + 14, ry, m.id);
      if (!found) img.setTintFill(hexColor(UI.colors.subText)).setAlpha(0.5);
      const count = found ? formatNum(this.progress.materialCount(m.id)) : '-';
      strip.add([img, text(this, x + 25, ry, count, subText({ color: UI.colors.textOnParchment })).setOrigin(0, 0.5)]);
    });
    return strip;
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
    const result = this.progress.openPack(this.pack.id);
    if (!result) return;
    saveProgress(this.progress);
    this.busy = true;
    this.showingResult = true;
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
    this.card.removeAll(true).add(createHeroCard(this, 0, 0, result.id, {
      stars: result.isNew ? 0 : result.stars, bonus: result.bonus,
    }));
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
    } else if (result.bonusLevel) {
      message = '+1 BONUS LEVEL!';
      color = cssColor(rarityColor);
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

  // "Buy 10": every chest at once, shown as a grid of small tiles (no
  // build-up), then the new-crewmate splash for each new hero in turn.
  openBulk() {
    if (this.busy) return;
    const results = this.progress.openBulk(this.pack.id);
    if (!results) return;
    saveProgress(this.progress);
    this.busy = true;
    this.showingResult = true;
    this.resetChest();
    this.chest.setVisible(false);
    this.resultText.setText('');

    const order = Object.keys(RARITY);
    const best = results.reduce((a, r) => (order.indexOf(HEROES[r.id].rarity) > order.indexOf(HEROES[a.id].rarity) ? r : a));
    const bestRarity = HEROES[best.id].rarity;
    const fresh = results.filter((r) => r.isNew);
    sfx.reveal(bestRarity, fresh.length > 0);
    const flash = PACK_FX.revealFlash[bestRarity];
    if (flash) this.cameras.main.flash(flash, 255, 236, 179);

    const left = CARD_X - (TILE_COLS * TILE_W + (TILE_COLS - 1) * TILE_GAP) / 2;
    results.forEach((r, i) => {
      const x = left + (i % TILE_COLS) * (TILE_W + TILE_GAP);
      const y = TILES_TOP + Math.floor(i / TILE_COLS) * (TILE_H + TILE_GAP);
      const tile = this.bulkTile(r, x, y).setAlpha(0);
      this.bulkGrid.add(tile);
      this.tweens.add({ targets: tile, alpha: 1, duration: 200, delay: i * 60 });
    });
    this.refresh();
    this.resultText.setText(fresh.length ? `${fresh.length} NEW CREWMATE${fresh.length > 1 ? 'S' : ''}!` : `${results.length} CHESTS OPENED`)
      .setColor(UI.colors.text).setAlpha(1);

    // New crewmates get their splash one after another.
    const next = () => {
      const r = fresh.shift();
      if (!r) {
        this.busy = false;
        this.refresh();
        return;
      }
      this.showSplash(r, next);
    };
    this.time.delayedCall(results.length * 60 + 500, next);
  }

  // One "Buy 10" result: parchment with a rarity stripe, the hero's face,
  // name and what the pull did.
  bulkTile(result, x, y) {
    const def = HEROES[result.id];
    const color = RARITY[def.rarity].color;
    const tag = result.isNew ? 'NEW!'
      : result.bonusLevel ? `BONUS +${result.bonus}`
        : `${result.stars} STAR${result.stars > 1 ? 'S' : ''}`;
    return this.add.container(Math.round(x), Math.round(y), [
      panel(this, 0, 0, TILE_W, TILE_H, 'parchment'),
      this.add.rectangle(3, 3, TILE_W - 6, 3, color).setOrigin(0),
      face(this, 14, 22, result.id),
      traitIcon(this, TILE_W - 10, 12, traitOf(result.id)),
      text(this, 26, 12, def.shortName, dark({ font: 'small' })),
      text(this, 26, 22, RARITY[def.rarity].label.toUpperCase(), subText()),
      text(this, TILE_W / 2, 38, tag, subText({ color: result.isNew ? UI.colors.warn : UI.colors.subText })).setOrigin(0.5, 0),
    ]);
  }

  // Big intro card for a hero pulled for the first time. Click to dismiss;
  // then onDone (by default the chest screen is ready again).
  showSplash(result, onDone = null) {
    const def = HEROES[result.id];
    const rarity = RARITY[def.rarity];
    const cx = DISPLAY.width / 2;
    const cardY = 124;
    const splash = this.add.container(0, 0).setDepth(50);

    const backdrop = fillView(this, 0x05070a, 0.9);
    backdrop.input.cursor = 'pointer';

    // Slowly turning light rays behind the card.
    const rays = this.add.graphics({ x: cx, y: cardY });
    rays.fillStyle(rarity.color, 0.16);
    const RAYS = 14;
    const reach = Math.hypot(this.view.width, this.view.height);  // past every corner of the view
    for (let i = 0; i < RAYS; i++) {
      const a = (i / RAYS) * Math.PI * 2;
      const b = a + Math.PI / RAYS;
      rays.fillTriangle(0, 0, Math.cos(a) * reach, Math.sin(a) * reach, Math.cos(b) * reach, Math.sin(b) * reach);
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
      if (onDone) {
        onDone();
        return;
      }
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
