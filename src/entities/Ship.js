import { DISPLAY, SHIP } from '../config.js';

export class Ship {
  constructor(scene, progress) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
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
      const { x, y } = this.slotPosition(s);
      const zone = this.scene.add.rectangle(x, y, 30, 40, 0xffffff, 0)
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

  get left() { return SHIP.x; }
  get right() { return SHIP.x + SHIP.width; }
  get top() { return this.deckTop(this.decks - 1) - 30; }
  get slotCount() { return this.decks * SHIP.slotsPerDeck; }
  get isDestroyed() { return this.hp <= 0; }

  // Y of the top edge of a deck (0 = lowest deck).
  deckTop(deck) {
    return DISPLAY.groundY - SHIP.hullHeight - (deck + 1) * SHIP.deckHeight;
  }

  // Where a hero standing in the given slot is drawn.
  slotPosition(slot) {
    const deck = Math.floor(slot / SHIP.slotsPerDeck);
    const indexOnDeck = slot % SHIP.slotsPerDeck;
    const spacing = SHIP.width / (SHIP.slotsPerDeck + 1);
    return {
      x: SHIP.x + spacing * (indexOnDeck + 1),
      y: this.deckTop(deck) + SHIP.deckHeight - 16,
    };
  }

  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    this.scene.cameras.main.shake(80, 0.003);
  }

  restore() {
    this.hp = this.maxHp;
  }

  draw() {
    const g = this.graphics;
    g.clear();
    const waterY = DISPLAY.groundY;
    const hullTop = waterY - SHIP.hullHeight;
    const left = SHIP.x;
    const right = SHIP.x + SHIP.width;
    const keelY = waterY + 18;

    // Hull: flared at the top, tucked in below. At the waterline its right edge
    // sits at `right`, where enemies stop, so collision matches the picture.
    const hull = [
      { x: left - 16, y: hullTop },
      { x: right + 12, y: hullTop },
      { x: right - 6, y: keelY },
      { x: left + 6, y: keelY },
    ];
    g.fillStyle(0x5d3a1a).fillPoints(hull, true);
    g.lineStyle(1, 0x3e2410, 0.8);
    for (let y = hullTop + 12; y < keelY; y += 12) g.lineBetween(left - 10, y, right + 6, y);  // planks
    g.lineStyle(3, 0xc9a227).lineBetween(left - 16, hullTop + 2, right + 12, hullTop + 2);    // gold trim
    g.fillStyle(0x2b1a0b);
    for (const px of [left + 24, left + 70, left + 116]) g.fillCircle(px, hullTop + 24, 5);   // portholes
    g.lineStyle(2, 0x3e2410).strokePoints(hull, true);
    // Water lapping over the bottom of the hull.
    g.fillStyle(0x1d5f8f, 0.75).fillRect(left - 20, waterY, SHIP.width + 40, keelY - waterY + 2);

    // Decks (cabins), alternating plank shades
    for (let d = 0; d < this.decks; d++) {
      const y = this.deckTop(d);
      g.fillStyle(d % 2 === 0 ? 0x8b5a2b : 0x7a4e24);
      g.fillRect(left, y, SHIP.width, SHIP.deckHeight);
      g.lineStyle(1, 0x5d3a1a, 0.6);
      for (let py = y + 15; py < y + SHIP.deckHeight; py += 15) g.lineBetween(left, py, right, py);
      g.lineStyle(2, 0x3e2410);
      g.strokeRect(left, y, SHIP.width, SHIP.deckHeight);
    }

    // Hero slot frames, with a "+" in empty ones
    for (let s = 0; s < this.slotCount; s++) {
      const { x, y } = this.slotPosition(s);
      g.lineStyle(2, 0xfff3e0, 0.5);
      g.strokeRect(x - 13, y - 18, 26, 36);
      if (!this.slotHeroes[s]) {
        g.lineStyle(2, 0xfff3e0, 0.7);
        g.lineBetween(x - 5, y, x + 5, y);
        g.lineBetween(x, y - 5, x, y + 5);
      }
    }

    // Top deck: railing, mast, sail and a Jolly Roger.
    const deckY = this.deckTop(this.decks - 1);
    const mastX = left + SHIP.width / 2;
    // The mast never rises into the HUD (which ends around y 76); with all
    // decks built the mast and sail get shorter.
    const mastTop = Math.max(deckY - 78, 84);
    const sailTop = mastTop + 14;
    const sailBottom = Math.min(mastTop + 56, deckY - 14);
    g.lineStyle(2, 0x5d3a1a);
    g.lineBetween(left - 4, deckY - 8, right + 4, deckY - 8);
    for (let x = left; x <= right; x += 20) g.lineBetween(x, deckY - 8, x, deckY);
    g.fillStyle(0x4e342e).fillRect(mastX - 3, mastTop, 6, deckY - mastTop);
    g.fillStyle(0xf5ecd7).fillPoints([
      { x: mastX - 34, y: sailTop },
      { x: mastX + 34, y: sailTop },
      { x: mastX + 40, y: sailBottom },
      { x: mastX - 40, y: sailBottom },
    ], true);
    g.lineStyle(1, 0xc8b99a).strokeRect(mastX - 34, sailTop, 68, 1);
    g.fillStyle(0x111111).fillRect(mastX + 3, mastTop, 22, 13);                // flag
    g.fillStyle(0xffffff).fillCircle(mastX + 14, mastTop + 5, 3);              // skull
    g.lineStyle(1.5, 0xffffff).lineBetween(mastX + 9, mastTop + 10, mastX + 19, mastTop + 10);
  }
}
