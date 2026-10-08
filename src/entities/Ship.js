import { SHIP, SPRITES } from '../config.js';
import { LAYOUT } from '../layout.js';
import { SHIP_SLOTS_KEY, shipFrontKey, shipStageKey } from '../sprites.js';

// Draw order, back to front, as layout.json's drawOrder: background, ship,
// crew, enemies, The Kraken (and its splash), the animated foreground, then
// the ship's front railing layer. Slot markers and enemy HP bars go
// on top of the scene; projectiles and UI stay above all of these.
export const DEPTH = {
  background: -20,
  ship: -19,
  hero: -18,
  enemy: -17,
  kraken: -16,
  splash: -15,
  foreground: -14,
  shipFront: -13,
  slotMarkers: -12,
  enemyOverlay: -10,
};

const SLOT_ZONE = SPRITES.slotZone;

export class Ship {
  constructor(scene, progress) {
    this.scene = scene;
    const s = SPRITES.scale;
    this.spriteTop = LAYOUT.shipY;
    this.image = scene.add.image(LAYOUT.shipX, this.spriteTop, shipStageKey(1))
      .setOrigin(0).setScale(s).setDepth(DEPTH.ship);
    this.front = scene.add.image(LAYOUT.shipX, this.spriteTop, shipFrontKey(1))
      .setOrigin(0).setScale(s).setDepth(DEPTH.shipFront);
    this.graphics = scene.add.graphics().setDepth(DEPTH.slotMarkers);
    this.slots = this.loadSlots(scene.cache.json.get(SHIP_SLOTS_KEY));
    this.slotZones = [];
    this.selectedSlot = -1;
    this.slotsEnabled = true;
    this.sync(progress);
  }

  // Pull decks / max HP / slot contents from progress. Refills HP.
  sync(progress) {
    this.decks = progress.decks;
    this.maxHp = progress.hullMaxHp;
    this.hp = this.maxHp;
    this.slotHeroes = progress.slots.slice(0, progress.slotCount);
    this.draw();
    this.createSlotZones();
  }

  // Clickable areas over each usable slot; emit 'slot-clicked' with the index.
  createSlotZones() {
    for (const z of this.slotZones) z.destroy();
    this.slotZones = [];
    for (let s = 0; s < this.slotCount; s++) {
      const { x, feetY, zoneWidth } = this.slots[s];
      const zone = this.scene.add.rectangle(x, feetY - SLOT_ZONE.height / 2, zoneWidth, SLOT_ZONE.height, 0xffffff, 0)
        .setDepth(3).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => { zone.hovered = true; this.paintSlotZones(); });
      zone.on('pointerout', () => { zone.hovered = false; this.paintSlotZones(); });
      zone.on('pointerdown', () => this.slotsEnabled && this.scene.events.emit('slot-clicked', s));
      this.slotZones.push(zone);
    }
    this.setSlotsEnabled(this.slotsEnabled);
  }

  setSlotsEnabled(enabled) {
    this.slotsEnabled = enabled;
    for (const z of this.slotZones) z.input.cursor = enabled ? 'pointer' : 'default';
    if (!enabled) this.selectedSlot = -1;
    this.paintSlotZones();
  }

  selectSlot(slot) {
    this.selectedSlot = slot;
    this.paintSlotZones();
  }

  paintSlotZones() {
    this.slotZones.forEach((z, s) => {
      const selected = s === this.selectedSlot;
      z.setFillStyle(0xffffff, this.slotsEnabled && (z.hovered || selected) ? 0.2 : 0);
      z.setStrokeStyle(2, 0xffeb3b, selected ? 1 : 0);
    });
  }

  // ship_slots.json gives each deck's slots in sprite pixels (centre x, feet y);
  // flatten them into slot order (deck 1 first) in layout units.
  loadSlots(json) {
    const s = SPRITES.scale;
    const slots = [];
    for (let d = 1; d <= SHIP.maxDecks; d++) {
      const deck = json[`deck${d}`].slice(0, SHIP.slotsPerDeck);
      const xs = deck.map((p) => LAYOUT.shipX + p.x * s);
      const spacing = Math.min(...xs.slice(1).map((x, i) => Math.abs(x - xs[i])));
      deck.forEach((p, i) => {
        slots.push({
          index: slots.length,
          x: xs[i],
          feetY: this.spriteTop + p.feetY * s,
          zoneWidth: Math.min(SLOT_ZONE.maxWidth, spacing - 2),
        });
      });
    }
    return slots;
  }

  get left() { return LAYOUT.shipX; }
  // Where walking enemies stop (their front edge).
  get right() { return LAYOUT.shipContactX; }
  get slotCount() { return this.decks * SHIP.slotsPerDeck; }
  get isDestroyed() { return this.hp <= 0; }

  // Where a hero in the given slot stands: centre x and feet y.
  slotPosition(slot) {
    return this.slots[slot];
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.scene.cameras.main.shake(80, 0.003);
  }

  restore() {
    this.hp = this.maxHp;
  }

  // Swap in the sprite for the current deck count, and mark empty slots
  // with a frame and a "+".
  draw() {
    this.image.setTexture(shipStageKey(this.decks));
    this.front.setTexture(shipFrontKey(this.decks));
    const g = this.graphics;
    g.clear();
    for (let s = 0; s < this.slotCount; s++) {
      if (this.slotHeroes[s]) continue;
      const { x, feetY, zoneWidth } = this.slots[s];
      const y = feetY - SLOT_ZONE.height / 2;
      g.lineStyle(2, 0xfff3e0, 0.5);
      g.strokeRect(x - zoneWidth / 2 + 2, y - SLOT_ZONE.height / 2 + 2, zoneWidth - 4, SLOT_ZONE.height - 4);
      g.lineStyle(2, 0xfff3e0, 0.8);
      g.lineBetween(x - 5, y, x + 5, y);
      g.lineBetween(x, y - 5, x, y + 5);
    }
  }
}
