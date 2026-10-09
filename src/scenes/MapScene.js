import Phaser from 'phaser';
import { DISPLAY, ISLANDS, MAP, UI_KIT } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, fillView } from '../display.js';
import { MAP_JSON_KEY, mapKey } from '../sprites.js';
import { Button } from '../ui/Button.js';
import { fmtNumber } from '../ui/format.js';
import {
  dark, hexColor, light, panel, subText, text, UI,
} from '../ui/kit.js';

// The world map ("The Cursed Seas"), after ui_mock_world_map.png: map_bg.png
// with every island from map/map.json at its spot, the route between them
// (legs already sailed in solid red dots, the rest in dotted ink) and the
// ship token bobbing by the current island. Cleared islands fly a flag;
// locked ones are greyscale and faded with a "?" and "???" for a name.
// Clicking an unlocked island shows its card (island number, waves, hazard,
// boss, best wave, Endless once cleared) with SET SAIL!, which sails there.
// Launched with { progress, onClose(sailed) }.

const GREY = (key) => `${key}_grey`;

// A greyscale copy of a texture (for locked islands), made once.
function greyTexture(scene, key) {
  const grey = GREY(key);
  if (scene.textures.exists(grey)) return grey;
  const src = scene.textures.get(key).getSourceImage();
  const canvas = scene.textures.createCanvas(grey, src.width, src.height);
  const ctx = canvas.context;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, src.width, src.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const l = Math.round(0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]);
    d[i] = l;
    d[i + 1] = l;
    d[i + 2] = l;
  }
  ctx.putImageData(img, 0, 0);
  canvas.refresh();
  return grey;
}

export class MapScene extends Phaser.Scene {
  constructor() {
    super('MapScene');
  }

  init({ progress, onClose }) {
    this.progress = progress;
    this.onClose = onClose;
    this.selected = progress.islandId;
  }

  create() {
    applyRenderScale(this);
    const json = this.cache.json.get(MAP_JSON_KEY);
    this.json = json;
    // map.json's islands in order, with their ISLANDS config.
    this.islands = [...json.islands].sort((a, b) => a.order - b.order)
      .map((spot) => ({ spot, def: ISLANDS.find((d) => d.id === spot.id) }))
      .filter((i) => i.def);

    fillView(this, 0x0d1117, 0.9);
    this.add.image(0, 0, mapKey('bg')).setOrigin(0);
    this.drawRoute();
    this.islands.forEach((island) => this.drawIsland(island));
    this.ring = this.add.graphics();
    this.drawShipToken();

    const cx = DISPLAY.width / 2;
    panel(this, cx - 80, 16, 160, 22, 'wood');
    text(this, cx, 27, MAP.title, light()).setOrigin(0.5);
    new Button(this, 26, 26, { width: 20, height: 20, label: 'X', onClick: () => this.close() });

    this.card = this.add.container(0, 0);
    this.select(this.selected, { quiet: true });

    if (!this.progress.mapSeen) this.progress.mapSeen = true;
  }

  // The route: map.json's points, legPoints to a leg (island n to n + 1).
  // Legs to an unlocked island are sailed (solid red dots); the rest are
  // dotted ink.
  drawRoute() {
    const { route } = this.json;
    const g = this.add.graphics();
    const legs = this.islands.length - 1;
    const per = Math.round((route.length - 1) / Math.max(1, legs));
    for (let i = 0; i < route.length; i++) {
      const leg = Math.min(legs - 1, Math.floor(i / per));
      const sailed = this.progress.isIslandUnlocked(this.islands[leg + 1].def.id);
      const [x, y] = route[i];
      if (sailed) g.fillStyle(MAP.routeColor, 1).fillRect(x - 1, y - 1, 2, 2);
      else if (i % 2 === 0) g.fillStyle(MAP.inkColor, MAP.inkAlpha).fillRect(x - 1, y - 1, 2, 2);
    }
  }

  drawIsland({ spot, def }) {
    const p = this.progress;
    const unlocked = p.isIslandUnlocked(def.id);
    const cleared = p.isIslandCleared(def.id);
    const key = mapKey(def.id);
    const img = this.add.image(spot.x, spot.y, unlocked ? key : greyTexture(this, key));
    const labelY = spot.y + this.json.labelOffsetY;
    if (!unlocked) {
      img.setAlpha(MAP.lockedAlpha);
      text(this, spot.x, spot.y, '?', dark()).setOrigin(0.5);
      text(this, spot.x, labelY, '???', subText()).setOrigin(0.5, 0);
      return;
    }
    text(this, spot.x, labelY, def.name.toUpperCase(), subText()).setOrigin(0.5, 0);
    if (cleared) {
      const [fx, fy] = this.json.flagOffset;
      this.add.image(spot.x + fx, spot.y + fy, mapKey('flag')).setOrigin(0.5, 1);
      text(this, spot.x, labelY + 10, 'CLEARED', subText({ color: MAP.clearedColor })).setOrigin(0.5, 0);
    }
    img.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.select(def.id));
  }

  // The ship token: its two frames looping, bobbing by the current island.
  drawShipToken() {
    const { spot } = this.islands.find((i) => i.def.id === this.progress.islandId);
    const { shipToken } = this.json;
    const key = mapKey('ship_token');
    if (!this.anims.exists(key)) {
      this.anims.create({
        key, frames: this.anims.generateFrameNumbers(key, { start: 0, end: shipToken.frames - 1 }),
        frameRate: shipToken.fps, repeat: -1,
      });
    }
    const x = spot.x + MAP.shipTokenOffset.x;
    const y = spot.y + MAP.shipTokenOffset.y;
    const token = this.add.sprite(x, y, key).play(key);
    // Bob on whole pixels.
    this.tweens.addCounter({
      from: 0, to: 1, duration: MAP.bob.ms, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      onUpdate: (tw) => token.setY(y + Math.round(tw.getValue() * MAP.bob.px)),
    });
  }

  // A dotted gold ring round the selected island, and its card.
  select(id, { quiet = false } = {}) {
    if (!quiet) sfx.click();
    this.selected = id;
    const { spot } = this.islands.find((i) => i.def.id === id);
    const g = this.ring.clear().fillStyle(MAP.ringColor, 1);
    const dots = 36;
    for (let k = 0; k < dots; k++) {
      const a = (k / dots) * Math.PI * 2;
      g.fillRect(Math.round(spot.x + Math.cos(a) * MAP.ringRadius) - 1, Math.round(spot.y + Math.sin(a) * MAP.ringRadius * 0.8) - 1, 2, 2);
    }
    this.drawCard();
  }

  drawCard() {
    const p = this.progress;
    const index = this.islands.findIndex((i) => i.def.id === this.selected);
    const { def } = this.islands[index];
    const record = p.islandRecord(def.id);
    const cleared = p.isIslandCleared(def.id);
    const { x, y, width: w, height: h } = MAP.card;
    const add = (...objs) => this.card.add(objs);
    this.card.removeAll(true);
    add(panel(this, x, y, w, h, 'parchment'));
    add(text(this, x + 10, y + 9, def.name, dark()));
    add(text(this, x + 10, y + 26, `ISLAND ${index + 1}  -  ${cleared ? 'ENDLESS' : `WAVES 1-${def.waves}`}`, subText()));
    const rows = [
      ['HAZARD', def.hazard.toUpperCase()],
      ['BOSS', def.boss.toUpperCase()],
      ['BEST WAVE', record?.best ? fmtNumber(record.best) : '-'],
      ['NOW AT', record ? `WAVE ${fmtNumber(record.wave)}` : '-'],
    ];
    rows.forEach(([label, value], i) => {
      const ry = y + 40 + i * 11;
      add(text(this, x + 10, ry, label, subText()), text(this, x + MAP.card.valueX, ry, value, subText({ color: UI.colors.textOnParchment })));
    });
    add(this.add.rectangle(x + 8, y + 86, w - 16, 1, hexColor(UI_KIT.dividerColor)).setOrigin(0));
    add(new Button(this, x + w / 2, y + h - 20, {
      width: w - 24, height: 24, style: 'gold', label: 'SET SAIL!',
      onClick: () => this.setSail(def.id),
    }));
  }

  // Sail to the island (or, if the ship is already there, just back to it).
  setSail(id) {
    sfx.click();
    const sailed = id !== this.progress.islandId && this.progress.sailTo(id);
    this.scene.stop();
    this.onClose?.(sailed);
  }

  close() {
    sfx.click();
    this.scene.stop();
    this.onClose?.(false);
  }
}
