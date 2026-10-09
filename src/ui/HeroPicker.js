import { ABILITIES, HEROES, RARITY, UI_KIT } from '../config.js';
import { rarityTextColor, starLabel } from './format.js';
import { antiAirIcon, face, hexColor, hitsFlyers, dark, subText, text, UI } from './kit.js';
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
  if (def.antiAir) parts.push('hits flyers');
  if (def.netsFlyers) parts.push('nets ground flyers');
  const text = parts.join(', ') || 'Fast shots, no effect';
  return text[0].toUpperCase() + text.slice(1);
}

// A crewmate's ability effect line, from ABILITIES[id].effect with its
// {placeholders} filled in. scale: the hero's ability scale (level and stars),
// which lengthens durations.
export function describeAbility(id, scale = 1) {
  const a = ABILITIES[id];
  const values = {
    duration: a.duration != null && secs(a.duration * scale),
    stun: a.stun != null && secs(a.stun * scale),
    slow: a.slow != null && pct(1 - a.slow),
    bonus: a.bonus != null && pct(a.bonus),
    attackSpeed: a.attackSpeed != null && pct(a.attackSpeed - 1),
    damage: a.damage != null && `${a.damage}x`,
    balls: a.balls,
    hits: a.hits,
  };
  return a.effect.replace(/\{(\w+)\}/g, (_, key) => values[key]);
}

// "15S COOLDOWN", and "RAPID FIRE  15S COOLDOWN".
export const cooldownLabel = (id) => `${secs(ABILITIES[id].cooldown).toUpperCase()} COOLDOWN`;
export const abilityTitle = (id) => `${ABILITIES[id].name.toUpperCase()}  ${cooldownLabel(id)}`;

// Popup listing owned heroes for one slot, on the same scrolling parchment as
// the Shipwright (which it replaces while open). Picking calls onPick(heroId | null).
export class HeroPicker extends ScrollPanel {
  constructor(scene, x, y, width, onPick) {
    super(scene, x, y, width, {
      title: 'SLOT', onClose: () => this.close(),
      visibleRows: UI_KIT.pickerRows, rowHeight: UI_KIT.pickerRowHeight,
    });
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
    const h = this.rowHeight - 3;
    const bg = scene.add.rectangle(0, -1, this.innerWidth, h, hexColor(UI.colors.subText), current ? 0.25 : 0)
      .setOrigin(0).setInteractive({ useHandCursor: true });
    row.add(bg);

    if (id) {
      const def = HEROES[id];
      const rarity = RARITY[def.rarity];
      const where = progress.slotOf(id);
      const note = where === slot ? '  HERE' : where >= 0 ? `  SLOT ${where + 1}` : '';
      const stars = starLabel(progress.heroStarCount(id));
      const name = text(scene, 16, -1, def.name, dark());
      row.add([
        face(scene, 6, 14, id),
        name,
        text(scene, 16, 11, `${rarity.label}  LV ${progress.heroLevel(id)}${stars ? `  ${stars}` : ''}${note}`,
          subText({ color: rarityTextColor(def.rarity) })),
        text(scene, 16, 19, abilityTitle(id), subText()),
        text(scene, 16, 26, describeAbility(id, progress.abilityScale(id)), subText()),
      ]);
      // Anti-air crew: the mark after their name.
      if (hitsFlyers(def)) row.add(antiAirIcon(scene, 16 + name.inkWidth + 7, 4));
    } else {
      row.add(text(scene, 16, 12, 'Leave empty', subText()));
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
