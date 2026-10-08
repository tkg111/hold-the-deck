import { DISPLAY, HOUSE } from '../config.js';

export class House {
  constructor(scene, progress) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.slotZones = [];
    this.selectedSlot = -1;
    this.slotsEnabled = true;
    this.sync(progress);
  }

  // Pull floors / max HP / slot contents from progress. Refills HP.
  sync(progress) {
    this.floors = progress.floors;
    this.maxHp = progress.houseMaxHp;
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

  get left() { return HOUSE.x; }
  get right() { return HOUSE.x + HOUSE.width; }
  get top() { return this.floorTop(this.floors - 1) - 30; }
  get slotCount() { return this.floors * HOUSE.slotsPerFloor; }
  get isDestroyed() { return this.hp <= 0; }

  // Y of the top edge of a floor (0 = ground floor).
  floorTop(floor) {
    return DISPLAY.groundY - HOUSE.stiltHeight - (floor + 1) * HOUSE.floorHeight;
  }

  // Where a hero standing in the given slot is drawn.
  slotPosition(slot) {
    const floor = Math.floor(slot / HOUSE.slotsPerFloor);
    const indexOnFloor = slot % HOUSE.slotsPerFloor;
    const spacing = HOUSE.width / (HOUSE.slotsPerFloor + 1);
    return {
      x: HOUSE.x + spacing * (indexOnFloor + 1),
      y: this.floorTop(floor) + HOUSE.floorHeight - 16,
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
    const groundY = DISPLAY.groundY;

    // Stilts
    g.fillStyle(0x5d4037);
    for (const sx of [HOUSE.x + 8, HOUSE.x + HOUSE.width / 2 - 4, HOUSE.x + HOUSE.width - 16]) {
      g.fillRect(sx, groundY - HOUSE.stiltHeight, 8, HOUSE.stiltHeight);
    }

    // Floors
    for (let f = 0; f < this.floors; f++) {
      const y = this.floorTop(f);
      g.fillStyle(f % 2 === 0 ? 0xa1887f : 0x8d6e63);
      g.fillRect(HOUSE.x, y, HOUSE.width, HOUSE.floorHeight);
      g.lineStyle(2, 0x4e342e);
      g.strokeRect(HOUSE.x, y, HOUSE.width, HOUSE.floorHeight);
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

    // Roof
    const roofBase = this.floorTop(this.floors - 1);
    g.fillStyle(0x6d2b1f);
    g.fillTriangle(
      HOUSE.x - 14, roofBase,
      HOUSE.x + HOUSE.width + 14, roofBase,
      HOUSE.x + HOUSE.width / 2, roofBase - 40,
    );
  }
}
