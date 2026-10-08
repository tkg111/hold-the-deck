import { HEROES, RARITY, UI_KIT } from '../config.js';
import { rarityTextColor, starLabel } from './format.js';
import { face, hexColor, dark, subText, text, UI } from './kit.js';
import { ScrollPanel } from './ScrollPanel.js';

const pct = (n) => `${Math.round(n * 100)}%`;
const secs = (ms) => `${+(ms / 1000).toFixed(1)}s`;

// One-line summary of a hero's effect, built from its config numbers.
export function describeHero(def) {
  if (def.aura) {
    return `No attack. Deck buff: +${pct(def.aura.damageBonus)} dmg, +${pct(def.aura.attackSpeedBonus)} speed`;
  }
  const parts = [];
  if (def.stun) parts.push(`${pct(def.stun.chance)} chance to stun ${secs(def.stun.duration)}`);
  if (def.lob) parts.push('lobbed');
  if (def.area) parts.push('area hit');
  if (def.pierce) parts.push(`pierces up to ${def.pierce.maxTargets} enemies in a line`);
  if (def.poison) parts.push(`poison: ${pct(def.poison.ratio)} dmg/s for ${secs(def.poison.duration)}`);
  if (def.crit) parts.push(`${pct(def.crit.chance)} crit chance for ${def.crit.multiplier}x damage`);
  if (def.slow) parts.push(`slows ${pct(1 - def.slow.factor)} for ${secs(def.slow.duration)}`);
  if (def.curse) parts.push(`curse: +${pct(def.curse.bonus)} damage taken from all`);
  const text = parts.join(', ') || 'Fast shots, no effect';
  return text[0].toUpperCase() + text.slice(1);
}

// Popup listing owned heroes for one slot, on the same scrolling parchment as
// the Shipwright (which it replaces while open). Picking calls onPick(heroId | null).
export class HeroPicker extends ScrollPanel {
  constructor(scene, x, y, width, onPick) {
    super(scene, x, y, width, { title: 'SLOT', onClose: () => this.close() });
    this.onPick = onPick;
    this.setDepth(20).setVisible(false);
  }

  open(slot, progress) {
    const rows = [...progress.ownedHeroes, null];  // null = leave the slot empty
    this.setTitle(`SLOT ${slot + 1}`);
    this.offset = 0;
    this.setRows(rows.map((id) => this.createRow(id, slot, progress)));
    this.setVisible(true);
  }

  createRow(id, slot, progress) {
    const { scene } = this;
    const row = scene.add.container(0, 0);
    const current = progress.slots[slot] === id;
    const h = (UI_KIT.rowHeight - 3);
    const bg = scene.add.rectangle(0, -1, this.innerWidth, h, hexColor(UI.colors.subText), current ? 0.25 : 0)
      .setOrigin(0).setInteractive({ useHandCursor: true });
    row.add(bg);

    if (id) {
      const def = HEROES[id];
      const rarity = RARITY[def.rarity];
      const where = progress.slotOf(id);
      const note = where === slot ? '  HERE' : where >= 0 ? `  SLOT ${where + 1}` : '';
      const stars = starLabel(progress.heroStarCount(id));
      row.add([
        face(scene, 6, 11, id),
        text(scene, 16, -1, def.name, dark()),
        text(scene, 16, 15, `${rarity.label}  LV ${progress.heroLevel(id)}${stars ? `  ${stars}` : ''}${note}`,
          subText({ color: rarityTextColor(def.rarity) })),
      ]);
    } else {
      row.add(text(scene, 16, 6, 'Leave empty', subText()));
    }

    bg.on('pointerover', () => bg.setFillAlpha(current ? 0.35 : 0.15));
    bg.on('pointerout', () => bg.setFillAlpha(current ? 0.25 : 0));
    bg.on('pointerdown', () => this.onPick(id));
    return row;
  }

  close() {
    this.setVisible(false);
    this.setRows([]);
    this.emit('closed');
  }
}
