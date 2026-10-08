import Phaser from 'phaser';
import { HEROES, RARITY } from '../config.js';
import { cssColor, starLabel } from './format.js';

const WIDTH = 300;
const ROW_HEIGHT = 48;
const HEADER = 40;

const pct = (n) => `${Math.round(n * 100)}%`;
const secs = (ms) => `${+(ms / 1000).toFixed(1)}s`;

// One-line summary of a hero's effect, built from its config numbers.
export function describeHero(def) {
  const parts = [];
  if (def.stun) parts.push(`${pct(def.stun.chance)} chance to stun ${secs(def.stun.duration)}`);
  if (def.area) parts.push('area hit');
  if (def.slow) parts.push(`slows ${pct(1 - def.slow.factor)} for ${secs(def.slow.duration)}`);
  if (def.curse) parts.push(`curse: +${pct(def.curse.bonus)} damage taken from all`);
  const text = parts.join(', ') || 'Fast shots, no effect';
  return text[0].toUpperCase() + text.slice(1);
}

// Popup listing owned heroes for one slot. Picking calls onPick(heroId | null).
export class HeroPicker extends Phaser.GameObjects.Container {
  constructor(scene, x, y, onPick) {
    super(scene, x, y);
    this.onPick = onPick;
    this.setDepth(20).setVisible(false);
    scene.add.existing(this);
  }

  open(slot, progress) {
    this.removeAll(true);
    const heroes = progress.ownedHeroes;
    const rows = [...heroes, null];  // null = leave the slot empty
    const height = HEADER + rows.length * ROW_HEIGHT + 8;

    this.add(this.scene.add.rectangle(0, 0, WIDTH, height, 0x1b1f2a, 0.95)
      .setOrigin(0).setStrokeStyle(2, 0xffeb3b, 0.6));
    this.add(this.scene.add.text(14, 10, `Slot ${slot + 1}  ·  choose a hero`, {
      fontFamily: 'sans-serif', fontSize: '16px', color: '#ffffff', fontStyle: 'bold',
    }));
    const close = this.scene.add.text(WIDTH - 14, 8, '✕', {
      fontFamily: 'sans-serif', fontSize: '18px', color: '#b0bec5',
    }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
    close.on('pointerdown', () => this.close());
    this.add(close);

    rows.forEach((id, i) => this.add(this.createRow(id, slot, progress, HEADER + i * ROW_HEIGHT)));
    this.setVisible(true);
  }

  createRow(id, slot, progress, y) {
    const row = this.scene.add.container(8, y);
    const current = progress.slots[slot] === id;
    const bg = this.scene.add.rectangle(0, 0, WIDTH - 16, ROW_HEIGHT - 6, 0xffffff, current ? 0.12 : 0.04)
      .setOrigin(0).setInteractive({ useHandCursor: true });
    row.add(bg);

    if (id) {
      const def = HEROES[id];
      const rarity = RARITY[def.rarity];
      const where = progress.slotOf(id);
      const note = where === slot ? '  (here)' : where >= 0 ? `  (slot ${where + 1})` : '';
      row.add(this.scene.add.rectangle(8, 8, 12, 26, def.color).setOrigin(0).setStrokeStyle(2, rarity.color));
      const stars = starLabel(progress.heroStarCount(id));
      row.add(this.scene.add.text(28, 5, `${def.name}  ·  Lv ${progress.heroLevel(id)}${stars ? `  ${stars}` : ''}${note}`, {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#ffffff',
      }));
      row.add(this.scene.add.text(28, 23, `${rarity.label} · ${describeHero(def)}`, {
        fontFamily: 'sans-serif', fontSize: '11px',
        color: cssColor(rarity.color),
        wordWrap: { width: WIDTH - 50 },
      }));
    } else {
      row.add(this.scene.add.text(28, 13, 'Leave empty', {
        fontFamily: 'sans-serif', fontSize: '14px', color: '#b0bec5', fontStyle: 'italic',
      }));
    }

    bg.on('pointerover', () => bg.setFillStyle(0xffffff, 0.18));
    bg.on('pointerout', () => bg.setFillStyle(0xffffff, current ? 0.12 : 0.04));
    bg.on('pointerdown', () => this.onPick(id));
    return row;
  }

  close() {
    this.setVisible(false);
    this.removeAll(true);
    this.emit('closed');
  }
}
