import { PARTS, SHIP, SPRITES } from '../config.js';
import { LAYOUT } from '../layout.js';
import { SHIP_SLOTS_KEY, shipFrontKey, shipStageKey } from '../sprites.js';
import { overlayKey, PART_DATA, partOf } from '../systems/Parts.js';

// Draw order, back to front, as layout.json's drawOrder: background (and the
// Frost Wyrm on its iceberg), ship, crew, enemies, The Kraken (and its
// splash), the animated foreground, an island's front layer (Frostbite Reef's
// pines), then the ship's front railing layer. Flying enemies are in front of
// all that (they dive at the decks); slot markers and enemy HP bars go on top
// of the scene; projectiles and UI stay above all of these.
export const DEPTH = {
  background: -20,
  perch: -19.5,        // the Frost Wyrm, in the background
  ship: -19,
  shipParts: -18.9,    // the equipped parts' overlays, over the ship and under the crew
  hero: -18,
  enemy: -17,
  ally: -16.5,         // the Bone Caller's skeletons, in front of the enemies
  kraken: -16,
  splash: -15,
  foreground: -14,
  frontScenery: -13.5,
  shipFront: -13,
  flyer: -12.5,
  slotMarkers: -12,
  enemyOverlay: -10,
  storm: -9,           // the finale's storm: over the battle, under projectiles and the HUD
};

const SLOT_ZONE = SPRITES.slotZone;

export class Ship {
  constructor(scene, progress) {
    this.scene = scene;
    this.spriteTop = LAYOUT.shipY;
    this.image = scene.add.image(LAYOUT.shipX, this.spriteTop, shipStageKey(1))
      .setOrigin(0).setDepth(DEPTH.ship);
    this.front = scene.add.image(LAYOUT.shipX, this.spriteTop, shipFrontKey(1))
      .setOrigin(0).setDepth(DEPTH.shipFront);
    this.graphics = scene.add.graphics().setDepth(DEPTH.slotMarkers);
    this.partImages = [];    // the equipped parts' overlays
    this.partsKey = null;    // what they show (parts and ship stage)
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
    this.drawParts(progress.equippedLevels);
    this.createSlotZones();
  }

  // Clickable areas over each usable slot; emit 'slot-clicked' with the
  // index (between waves), or 'slot-tapped' during a wave (it breaks the ice
  // on a frozen crewmate).
  createSlotZones() {
    for (const z of this.slotZones) z.destroy();
    this.slotZones = [];
    for (let s = 0; s < this.slotCount; s++) {
      const { x, feetY, zoneWidth } = this.slots[s];
      const zone = this.scene.add.rectangle(x, feetY - SLOT_ZONE.height / 2, zoneWidth, SLOT_ZONE.height, 0xffffff, 0)
        .setDepth(3).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => { zone.hovered = true; this.paintSlotZones(); });
      zone.on('pointerout', () => { zone.hovered = false; this.paintSlotZones(); });
      zone.on('pointerdown', () => this.scene.events.emit(this.slotsEnabled ? 'slot-clicked' : 'slot-tapped', s));
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
      z.setStrokeStyle(1, 0xffeb3b, selected ? 1 : 0);
    });
  }

  // ship_slots.json gives each deck's slots in sprite pixels (centre x, feet y);
  // flatten them into slot order (deck 1 first) in scene pixels.
  loadSlots(json) {
    const slots = [];
    for (let d = 1; d <= SHIP.maxDecks; d++) {
      const deck = json[`deck${d}`].slice(0, SHIP.slotsPerDeck);
      const xs = deck.map((p) => LAYOUT.shipX + p.x);
      const spacing = Math.min(...xs.slice(1).map((x, i) => Math.abs(x - xs[i])));
      deck.forEach((p, i) => {
        slots.push({
          index: slots.length,
          x: xs[i],
          feetY: this.spriteTop + p.feetY,
          zoneWidth: Math.min(SLOT_ZONE.maxWidth, spacing - 1),
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

  // Where a flyer hovers to attack the top deck: off its frontmost slot by
  // (hoverX, hoverY) from that slot's feet.
  flyerHoverPoint({ hoverX, hoverY }) {
    const top = this.slots.slice((this.decks - 1) * SHIP.slotsPerDeck, this.decks * SHIP.slotsPerDeck);
    const front = top.reduce((a, s) => (s.x > a.x ? s : a));
    return { x: front.x + hoverX, y: front.feetY + hoverY };
  }

  // Where a lava bomb lands on a built deck (0 = the bottom one): between
  // its slots, at their feet.
  deckSpot(deck) {
    const slots = this.slots.slice(deck * SHIP.slotsPerDeck, (deck + 1) * SHIP.slotsPerDeck);
    return {
      x: slots.reduce((sum, s) => sum + s.x, 0) / slots.length,
      feetY: Math.max(...slots.map((s) => s.feetY)),
    };
  }

  // The crewmate standing closest to the bow (furthest right), or null.
  crewNearestBow(heroes) {
    return heroes.reduce((a, h) => (!a || h.x > a.x ? h : a), null);
  }

  // enemy: who hit it, for the Captain's Log (only the HP actually lost
  // counts). crewmate: a charmed crewmate whose own attack it was (the Log
  // blames the enemy that charmed them; the balance sim tells them apart).
  takeDamage(amount, enemy = null, crewmate = null) {
    if (enemy) this.scene.stats?.hullHit(enemy, Math.min(amount, this.hp));
    this.hp = Math.max(0, this.hp - amount);
    this.scene.cameras.main.shake(80, 0.003);
  }

  restore() {
    this.hp = this.maxHp;
  }

  // Patch Up: mend up to amount; returns how much was mended.
  heal(amount) {
    const healed = Math.min(amount, this.maxHp - this.hp);
    this.hp += healed;
    return healed;
  }

  // A random spot on the hull (SHIP.hull).
  hullTarget() {
    const { left, right, minAbove, maxAbove } = SHIP.hull;
    return {
      x: LAYOUT.shipX + left + Math.random() * (LAYOUT.shipContactX - right - LAYOUT.shipX - left),
      y: LAYOUT.waterY - minAbove - Math.random() * (maxAbove - minAbove),
    };
  }

  // Each equipped part's overlay (176x160, like the ship) at the ship's
  // top-left, in slot order; the lantern's for this ship stage. The
  // Blackbones' Lantern's glow pulses: a copy of it added on top as light.
  drawParts(levels) {
    const slot = (id) => PART_DATA.slots.indexOf(partOf(id).slot);
    const ids = Object.keys(levels).filter((id) => partOf(id)).sort((a, b) => slot(a) - slot(b));
    const key = `${this.decks}:${ids.join(',')}`;
    if (key === this.partsKey) return;
    this.partsKey = key;
    const { scene } = this;
    for (const img of this.partImages) {
      scene.tweens.killTweensOf(img);
      img.destroy();
    }
    this.partImages = [];
    for (const id of ids) {
      const tex = overlayKey(partOf(id), this.decks);
      if (scene.textures && !scene.textures.exists(tex)) continue;
      const add = () => scene.add.image(LAYOUT.shipX, this.spriteTop, tex).setOrigin(0).setDepth(DEPTH.shipParts);
      this.partImages.push(add());
      if (id === 'blackbones_lantern') {
        const glow = add().setBlendMode('ADD').setAlpha(0);
        scene.tweens.add({
          targets: glow, alpha: PARTS.glowAlpha, duration: PARTS.glowMs, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
        this.partImages.push(glow);
      }
    }
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
      // 1px frame and "+" on whole pixels.
      const left = Math.round(x - zoneWidth / 2) + 1;
      const top = Math.round(y - SLOT_ZONE.height / 2) + 1;
      const cx = Math.round(x);
      const cy = Math.round(y);
      g.fillStyle(0xfff3e0, 0.5);
      g.fillRect(left, top, zoneWidth - 2, 1).fillRect(left, top + SLOT_ZONE.height - 3, zoneWidth - 2, 1);
      g.fillRect(left, top, 1, SLOT_ZONE.height - 2).fillRect(left + zoneWidth - 3, top, 1, SLOT_ZONE.height - 2);
      g.fillStyle(0xfff3e0, 0.8);
      g.fillRect(cx - 2, cy, 5, 1).fillRect(cx, cy - 2, 1, 5);
    }
  }
}
