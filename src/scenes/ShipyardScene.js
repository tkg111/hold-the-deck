import Phaser from 'phaser';
import { DISPLAY, PARTS, UI_KIT } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, fillView } from '../display.js';
import { shipFrontKey, shipStageKey } from '../sprites.js';
import {
  gameMaterials, isEconomyPart, materialOf, materialSource, overlayKey, PART_DATA, partOf, slotParts,
} from '../systems/Parts.js';
import { saveProgress } from '../systems/Save.js';
import { Button } from '../ui/Button.js';
import { formatNum } from '../ui/format.js';
import {
  dark, glyph, hexColor, icon, light, panel, subText, tapArea, text, UI,
} from '../ui/kit.js';
import {
  economyTag, materialIcon, partIcon, partStat,
} from '../ui/parts.js';

const Y = PARTS.shipyard;
// "the Frost Wyrm", but "The Kraken" and "Captain Blackbones" as they are.
const bossTitle = (name) => (/^(The|Captain) /.test(name) ? name : `the ${name}`);

const SLOT_LABELS = {
  figurehead: 'Figurehead', sails: 'Sails', cannons: 'Cannons', lantern: 'Lantern',
};

// The Shipyard: ship parts made from boss materials. Left, a preview of the
// ship as it is now (its stage and every part on it); right, the four slots
// as cards (the part on each: icon, name, level, what it does). Tapping a
// slot lists the parts for it, each with what it costs to craft or upgrade
// (material and gold) and an Equip button once owned; the preview zooms in
// on that slot. A part whose material hasn't dropped yet shows dark, with
// the boss that drops it. The materials held run along the bottom.
// Launched over GameScene with { progress, onClose } (from the Shipwright's
// Parts row); closing rebuilds the ship and crew.
export class ShipyardScene extends Phaser.Scene {
  constructor() {
    super('ShipyardScene');
  }

  init({ progress, onClose }) {
    this.progress = progress;
    this.onClose = onClose;
    this.slot = null;   // the slot whose parts are listed, or null for the cards
  }

  create() {
    applyRenderScale(this);
    fillView(this, 0x0d1117, 0.9);
    const cx = DISPLAY.width / 2;
    panel(this, cx - 70, 4, 140, 20, 'wood');
    text(this, cx, 14, 'SHIPYARD', light()).setOrigin(0.5);
    new Button(this, DISPLAY.width - 30, 14, {
      width: 48, height: 20, label: 'Back', onClick: () => this.close(),
    });
    // Gold on hand, top left.
    panel(this, 8, 4, 92, 20, 'wood');
    icon(this, 20, 14, 'gold');
    this.goldText = text(this, 30, 14, '', light()).setOrigin(0, 0.5);

    this.preview = this.add.container(0, 0);
    this.side = this.add.container(0, 0);
    this.strip = this.add.container(0, 0);
    this.redraw();
  }

  // Everything that shows what's owned (after any craft, upgrade or equip).
  redraw() {
    this.goldText.setText(formatNum(this.progress.gold));
    this.drawPreview();
    if (this.slot) this.drawSlotParts(this.slot);
    else this.drawCards();
    this.drawMaterials();
  }

  // --- The preview ---

  // The ship's stage image, each equipped part's overlay and the railing in
  // front, on a patch of sea: the whole ship at 1x, or zoomed on a slot.
  drawPreview() {
    const p = this.progress;
    const { x, y, width: w, height: h, sea } = Y.preview;
    this.preview.removeAll(true);
    const add = (...objs) => this.preview.add(objs);
    add(panel(this, x, y, w, h, 'wood'));
    const inner = { x: x + 5, y: y + 5, w: w - 10, h: h - 22 };
    add(this.add.rectangle(inner.x, inner.y, inner.w, inner.h, sea).setOrigin(0));
    const stage = p.decks;
    const slotIndex = (id) => PART_DATA.slots.indexOf(partOf(id).slot);
    const parts = Object.keys(p.equippedLevels).filter((id) => partOf(id)).sort((a, b) => slotIndex(a) - slotIndex(b));
    const keys = [
      shipStageKey(stage),
      ...parts.map((id) => overlayKey(partOf(id), stage)).filter((k) => this.textures.exists(k)),
      shipFrontKey(stage),
    ];

    const zoom = this.slot ? Y.zoom : 1;
    const image = this.textures.get(keys[0]).getSourceImage();
    let crop = null;
    let left;
    let top;
    if (this.slot) {
      // The window onto the ship, centred on the slot's focus (kept inside
      // the ship image).
      const f = Y.focus[this.slot];
      const fy = Array.isArray(f.y) ? f.y[stage - 1] : f.y;
      const cw = Math.floor(inner.w / zoom);
      const ch = Math.floor(inner.h / zoom);
      const cxp = Phaser.Math.Clamp(Math.round(f.x - cw / 2), 0, Math.max(0, image.width - cw));
      const cyp = Phaser.Math.Clamp(Math.round(fy - ch / 2), 0, Math.max(0, image.height - ch));
      crop = { x: cxp, y: cyp, w: Math.min(cw, image.width), h: Math.min(ch, image.height) };
      left = inner.x + Math.floor((inner.w - crop.w * zoom) / 2) - crop.x * zoom;
      top = inner.y + Math.floor((inner.h - crop.h * zoom) / 2) - crop.y * zoom;
    } else {
      left = inner.x + Math.floor((inner.w - image.width) / 2);
      top = inner.y + Math.floor((inner.h - image.height) / 2);
    }
    for (const key of keys) {
      const img = this.add.image(left, top, key).setOrigin(0).setScale(zoom);
      if (crop) img.setCrop(crop.x, crop.y, crop.w, crop.h);
      add(img);
    }
    const caption = this.slot ? `${SLOT_LABELS[this.slot].toUpperCase()} - ${zoom}X` : 'YOUR SHIP';
    add(text(this, x + w / 2, y + h - 9, caption, light({ font: 'small' })).setOrigin(0.5));
  }

  // --- The slot cards ---

  drawCards() {
    const p = this.progress;
    const { x, y, width: w, cardHeight: h, gap } = Y.cards;
    this.side.removeAll(true);
    PART_DATA.slots.forEach((slot, i) => {
      const top = y + i * (h + gap);
      const id = p.equippedPart(slot);
      const card = this.add.container(0, 0);
      card.add(panel(this, x, top, w, h, 'parchment'));
      card.add(text(this, x + w - 8, top + 7, SLOT_LABELS[slot].toUpperCase(), subText()).setOrigin(1, 0));
      if (id) {
        const level = p.partLevel(id);
        card.add(partIcon(this, x + 24, top + h / 2, id));
        const name = text(this, x + 46, top + 7, partOf(id).name, dark());
        let after = x + 46 + name.inkWidth + 4;
        if (isEconomyPart(id)) {
          const tag = economyTag(this, after, top + 12);
          card.add(tag);
          after += tag[0].displayWidth + 4;
        }
        card.add([name, text(this, after, top + 11, `LV ${level}`, subText())]);
        card.add(text(this, x + 46, top + 25, partStat(id, level), subText({ wrap: w - 56 })));
      } else {
        card.add(this.add.rectangle(x + 8, top + h / 2 - 16, 32, 32, hexColor(UI_KIT.dividerColor)).setOrigin(0));
        card.add(text(this, x + 24, top + h / 2, '?', dark()).setOrigin(0.5));
        card.add(text(this, x + 46, top + 7, 'Empty', dark()));
        const any = slotParts(slot).length > 0;
        card.add(text(this, x + 46, top + 25, any ? 'TAP TO CHOOSE A PART' : 'NO PARTS FOUND YET', subText()));
      }
      // Something here can be crafted or upgraded.
      if (slotParts(slot).some((part) => p.canAffordPart(part.id))) {
        card.add(glyph(this, x + w - 10, top + h - 10, 'up', UI_KIT.affordColor));
      }
      const zone = this.add.zone(x, top, w, h).setOrigin(0).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => this.openSlot(slot));
      card.add(zone);
      this.side.add(card);
    });
  }

  openSlot(slot) {
    sfx.play('ui_click');
    this.slot = slot;
    this.redraw();
  }

  backToCards() {
    sfx.play('ui_back');
    this.slot = null;
    this.redraw();
  }

  // --- A slot's parts ---

  drawSlotParts(slot) {
    const { x, y, width: w } = Y.cards;
    this.side.removeAll(true);
    const add = (...objs) => this.side.add(objs);
    const back = new Button(this, x + 28, y + 9, {
      width: 56, height: 18, font: 'small', label: 'SLOTS', icon: 'arrow_up', onClick: () => this.backToCards(),
    });
    back.icon?.setAngle(-90);
    add(back);
    add(text(this, x + 64, y + 9, `${SLOT_LABELS[slot].toUpperCase()} PARTS`, light()).setOrigin(0, 0.5));
    slotParts(slot).forEach((part, i) => this.drawPartRow(part, x, y + 22 + i * (Y.rowHeight + 4), w));
  }

  drawPartRow(part, x, top, w) {
    const p = this.progress;
    const h = Y.rowHeight;
    const add = (...objs) => this.side.add(objs);
    const level = p.partLevel(part.id);
    const found = p.hasFoundMaterial(part.material);
    const material = materialOf(part.material);
    add(panel(this, x, top, w, h, 'parchment'));

    const iconImg = partIcon(this, x + 24, top + 24, part.id);
    // Not found yet: a dark silhouette.
    if (!found) iconImg.setTintFill(hexColor(UI.colors.subText)).setAlpha(0.6);
    add(iconImg);
    const name = text(this, x + 46, top + 7, part.name, dark());
    let after = x + 46 + name.inkWidth + 4;
    // Economy parts (the Blackbones' Lantern) say so in gold.
    if (isEconomyPart(part.id)) {
      const tag = economyTag(this, after, top + 12);
      add(...tag);
      after += tag[0].displayWidth + 4;
    }
    const lvLabel = level ? `LV ${level}${p.isEquipped(part.id) ? '  ON THE SHIP' : ''}` : 'NOT MADE YET';
    const lv = text(this, after, top + 11, lvLabel, subText());
    // Past the row's edge (after an ECONOMY tag): just the level; its
    // TAKE OFF button says it's on the ship.
    if (level && lv.anchorX + lv.inkWidth > x + w - 12) lv.setText(`LV ${level}`);
    add(name, lv);
    if (p.canAffordPart(part.id)) add(glyph(this, lv.anchorX + lv.inkWidth + 5, top + 13, 'up', UI_KIT.affordColor));
    const effect = text(this, x + 46, top + 23, part.effect.toUpperCase(), subText({ wrap: w - 54 }));
    add(effect);
    if (level) add(text(this, x + 46, top + 23 + effect.inkHeight + 5, `NOW: ${partStat(part.id, level)}`, subText({ color: UI.colors.textOnParchment })));

    const rowY = top + h - 16;
    if (!found) {
      // "Defeat the Frost Wyrm to find Wyrm Scale".
      const src = materialSource(part.material);
      add(text(this, x + 10, rowY, `DEFEAT ${bossTitle(src.boss.name).toUpperCase()} TO FIND ${material.name.toUpperCase()}`,
        subText({ color: UI.colors.warn, wrap: w - 20 })).setOrigin(0, 0.5));
      return;
    }

    // The next level's cost: material (have / need) and gold, red where short.
    const cost = p.partNextCost(part.id);
    if (cost) {
      const have = p.materialCount(part.material);
      add(materialIcon(this, x + 16, rowY, part.material));
      const mat = text(this, x + 26, rowY, `${formatNum(have)}/${formatNum(cost.material)}`,
        subText({ color: have >= cost.material ? UI.colors.textOnParchment : UI.colors.warn })).setOrigin(0, 0.5);
      add(mat);
      const gx = mat.anchorX + mat.inkWidth + 12;
      add(icon(this, gx, rowY, 'gold'));
      add(text(this, gx + 8, rowY, formatNum(cost.gold),
        subText({ color: p.gold >= cost.gold ? UI.colors.textOnParchment : UI.colors.warn })).setOrigin(0, 0.5));
    } else {
      add(text(this, x + 10, rowY, 'MAX LEVEL', subText()).setOrigin(0, 0.5));
    }

    // Craft / Upgrade (gold), and Equip / Take off (wood) once owned.
    const buy = new Button(this, x + w - 38, rowY, {
      width: 66, height: 20, style: 'gold', font: 'small',
      label: !cost ? 'MAX' : level ? 'UPGRADE' : 'CRAFT',
      onClick: () => this.upgrade(part.id),
    });
    add(buy.setEnabled(!!cost && p.canAffordPart(part.id)));
    if (level) {
      const on = p.isEquipped(part.id);
      add(new Button(this, x + w - 38 - 66 - 4, rowY, {
        width: 62, height: 20, font: 'small', label: on ? 'TAKE OFF' : 'EQUIP',
        onClick: () => this.equip(part.id, !on),
      }));
    }
  }

  upgrade(id) {
    const crafting = this.progress.partLevel(id) === 0;
    if (!this.progress.upgradePart(id)) {
      sfx.play('ui_error');
      return;
    }
    sfx.play('upgrade');
    this.changed();
  }

  equip(id, on) {
    if (!this.progress.equipPart(id, on)) return;
    sfx.play('ui_click');
    this.changed();
  }

  changed() {
    saveProgress(this.progress);
    this.redraw();
  }

  // --- Materials ---

  // Every material in the game with how many are held; ones never found are
  // dark, with a dash.
  drawMaterials() {
    const p = this.progress;
    const { y, height: h } = Y.materials;
    const left = 8;
    const width = DISPLAY.width - 16;
    this.strip.removeAll(true);
    this.strip.add(panel(this, left, y, width, h, 'parchment'));
    const label = text(this, left + 8, y + h / 2, 'MATERIALS', subText()).setOrigin(0, 0.5);
    this.strip.add(label);
    const mats = gameMaterials();
    const x0 = label.anchorX + label.inkWidth + 10;
    const step = Math.floor((left + width - 6 - x0) / Math.max(1, mats.length));
    mats.forEach((m, i) => {
      const mx = x0 + i * step + 8;
      const found = p.hasFoundMaterial(m.id);
      const img = materialIcon(this, mx, y + h / 2, m.id);
      if (!found) img.setTintFill(hexColor(UI.colors.subText)).setAlpha(0.5);
      const count = text(this, mx + 10, y + h / 2, found ? formatNum(p.materialCount(m.id)) : '-', subText({ color: UI.colors.textOnParchment }))
        .setOrigin(0, 0.5);
      // Hover a material for its name (no room for names here).
      tapArea(img, img.width, img.height).on('pointerover', () => this.tooltip(m, mx, y)).on('pointerout', () => this.tip?.destroy());
      this.strip.add([img, count]);
    });
  }

  // A material's name over its icon.
  tooltip(m, x, y) {
    this.tip?.destroy();
    const label = text(this, x, y - 8, m.name.toUpperCase(), light({ font: 'small' })).setOrigin(0.5);
    const w = label.inkWidth + 10;
    this.tip = this.add.container(0, 0, [panel(this, Math.round(x - w / 2), y - 17, w, 18, 'wood'), label]).setDepth(10);
  }

  close() {
    sfx.play('ui_back');
    this.scene.stop();
    this.onClose?.();
  }
}

