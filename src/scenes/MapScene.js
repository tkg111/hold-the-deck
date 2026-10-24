import Phaser from 'phaser';
import {
  ABYSS, DISPLAY, ENEMIES, HUNTS, ISLANDS, MAP, UI_KIT,
} from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, fillView } from '../display.js';
import {
  ABYSS_JSON_KEY, CURRENTS_KEY, MAP_JSON_KEY, mapKey,
} from '../sprites.js';
import { depthCurrents, newSeed } from '../systems/Abyss.js';
import * as Expeditions from '../systems/Expeditions.js';
import { Button } from '../ui/Button.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';
import { formatNum } from '../ui/format.js';
import {
  dark, expeditionKey, hexColor, light, panel, subText, text, UI,
} from '../ui/kit.js';
import { materialIcon } from '../ui/parts.js';
import { enemyPortrait } from '../ui/wanted.js';

// The world map ("The Cursed Seas"), after ui_mock_world_map.png: map_bg.png
// with every island from map/map.json at its spot, the route between them
// (legs already sailed in solid red dots, the rest in dotted ink) and the
// ship token bobbing by the current island. Cleared islands fly a flag;
// locked ones are greyscale and faded with a "?" and "???" for a name.
// Clicking an unlocked island shows its card (island number, waves, hazard,
// boss, best wave, Endless once cleared) with SET SAIL!, which sails there
// (or a disabled COMING SOON for an island with no content yet). Once one
// of an island's bosses has been beaten, the card gets a Boss Hunt tab: each
// of its bosses with its hunt level, what a win drops, today's doubles and
// HUNT, which sails there and starts the hunt. The
// Expeditions button (top right, with a badge counting the ones back) opens
// the board over the map. The Abyss (ABYSS.map) sits off the route: a dark
// silhouette with "???" until it opens, then its icon, whose card has the
// best depth, the depths a dive can start at, the currents it will face and
// DIVE!. The first time the map opens with it open (after the ending), it's
// revealed: the map zooms on it as it fades in, with ABYSS.reveal's message.
// During a dive, sailing to an island or a hunt asks first: it ends the dive.
// Launched with { progress, openExpeditions(onClosed), onClose(sailed, hunt,
// { dive, left }) } (hunt: { boss, island } to start, or null; dive: { from,
// seed } to start one; left: the dive that was left, Progress.endDive's
// summary). The Abyss card's trophy opens Rankings over the map.

const GREY = (key) => `${key}_grey`;
// The Abyss card's values, from its left (its labels are longer).
const ABYSS_VALUE_X = 76;

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

  init({ progress, onClose, openExpeditions }) {
    this.progress = progress;
    this.onClose = onClose;
    this.openExpeditions = openExpeditions;
    this.selected = progress.inAbyss ? ABYSS.id : progress.islandId;
    this.tab = 'island';   // the card's tab: 'island' or 'hunt'
    // The next dive's seed (so its card can show the currents it will meet)
    // and the depth it starts at (the deepest checkpoint open).
    this.diveSeed = newSeed();
    this.diveFrom = progress.abyssCheckpoints[progress.abyssCheckpoints.length - 1];
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
    // The map itself (what the reveal zooms), under the title, buttons and card.
    this.world = this.add.container(0, 0);
    const before = this.children.list.length;
    this.add.image(0, 0, mapKey('bg')).setOrigin(0);
    this.drawRoute();
    this.islands.forEach((island) => this.drawIsland(island));
    this.drawAbyss();
    this.ring = this.add.graphics();
    this.drawShipToken();
    this.world.add(this.children.list.slice(before));

    const cx = DISPLAY.width / 2;
    panel(this, cx - 80, 16, 160, 22, 'wood');
    text(this, cx, 27, MAP.title, light()).setOrigin(0.5);
    new Button(this, 26, 26, { width: 24, height: 24, label: 'X', onClick: () => this.close() });
    // Expeditions (greyed out until unlocked; tapping it then says how).
    this.expeditionButton = new Button(this, 426, 26, {
      width: 88, height: 24, icon: expeditionKey('icon_expedition'), label: 'Expeditions',
      onClick: () => this.openExpeditions?.(() => this.refreshExpeditions()),
    });
    this.expeditionHint = text(this, 470, 42, Expeditions.unlockLabel().toUpperCase(), light({ font: 'small' }))
      .setOrigin(1, 0).setVisible(false);
    this.expeditionButton.bg.on('pointerdown', () => {
      if (this.expeditionButton.enabled) return;
      this.expeditionHint.setVisible(true);
    });
    this.refreshExpeditions();

    this.card = this.add.container(0, 0);
    this.select(this.selected, { quiet: true });

    if (!this.progress.mapSeen) this.progress.mapSeen = true;
    if (this.progress.abyssUnlocked && !this.progress.abyss.revealed) this.reveal();
  }

  // The Abyss's spot (ABYSS.map): a dark silhouette with "???" until it
  // opens, then its icon and name (clickable).
  drawAbyss() {
    const { x, y, lockedTint, lockedAlpha } = ABYSS.map;
    const open = this.progress.abyssUnlocked;
    const shown = open && this.progress.abyss.revealed;
    const labelY = y + this.json.labelOffsetY;
    this.abyssIcon = this.add.image(x, y, mapKey(ABYSS.id));
    this.abyssLabel = text(this, x, labelY, shown ? ABYSS.name.toUpperCase() : '???', subText()).setOrigin(0.5, 0);
    if (!shown) this.abyssIcon.setTintFill(lockedTint).setAlpha(lockedAlpha);
    if (open) this.abyssIcon.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.select(ABYSS.id));
  }

  // The one-time reveal: the map zooms in on the Abyss as its silhouette
  // fades to its art, with the message; then it zooms back out and its card
  // opens. Taps on the map wait until it's done.
  reveal() {
    const p = this.progress;
    p.abyss.revealed = true;
    const { zoom, zoomMs, fadeMs, message } = ABYSS.reveal;
    const { x, y } = ABYSS.map;
    const blocker = fillView(this, 0x000000, 0.001);
    this.card.setVisible(false);
    // Zoomed on the icon, as far as the map's edges allow.
    const tx = Phaser.Math.Clamp(DISPLAY.width / 2 - x * zoom, DISPLAY.width - DISPLAY.width * zoom, 0);
    const ty = Phaser.Math.Clamp(DISPLAY.height / 2 - y * zoom, DISPLAY.height - DISPLAY.height * zoom, 0);
    const cx = DISPLAY.width / 2;
    const line = text(this, cx, 52, message, light()).setOrigin(0.5);
    const plate = panel(this, cx - line.inkWidth / 2 - 10, 42, line.inkWidth + 20, 20, 'wood');
    this.children.bringToTop(line);
    for (const o of [plate, line]) o.setAlpha(0);
    sfx.play('legendary');
    this.tweens.add({ targets: this.world, x: tx, y: ty, scale: zoom, duration: zoomMs, ease: 'Sine.easeInOut' });
    this.tweens.addCounter({
      from: 0, to: 1, delay: zoomMs / 2, duration: fadeMs,
      onUpdate: (tw) => {
        const v = tw.getValue();
        this.abyssIcon.setAlpha(ABYSS.map.lockedAlpha + (1 - ABYSS.map.lockedAlpha) * v);
        if (v > 0.5) this.abyssIcon.clearTint();
      },
      onComplete: () => this.abyssLabel.setText(ABYSS.name.toUpperCase()),
    });
    this.tweens.add({ targets: [plate, line], alpha: 1, delay: zoomMs, duration: 400 });
    const done = new Button(this, cx, 76, {
      width: 96, height: 22, style: 'gold', label: 'CONTINUE',
      onClick: () => {
        done.destroy();
        this.tweens.add({ targets: [plate, line], alpha: 0, duration: 300, onComplete: () => { plate.destroy(); line.destroy(); } });
        this.tweens.add({
          targets: this.world, x: 0, y: 0, scale: 1, duration: zoomMs * 0.6, ease: 'Sine.easeInOut',
          onComplete: () => {
            blocker.destroy();
            this.card.setVisible(true);
            this.select(ABYSS.id, { quiet: true });
          },
        });
      },
    }).setAlpha(0);
    this.tweens.add({ targets: done, alpha: 1, delay: zoomMs + 300, duration: 300 });
  }

  // The Expeditions button: enabled once unlocked, with a badge counting the
  // ones back (checked again each second while the map is open).
  refreshExpeditions() {
    const p = this.progress;
    const open = Expeditions.isUnlocked(p);
    Expeditions.tick(p);
    this.expeditionButton.setEnabled(open).setBadge(open ? Expeditions.readyCount(p) : 0);
    if (!this.expeditionTimer) {
      this.expeditionTimer = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.refreshExpeditions() });
    }
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
    // During a dive, by the Abyss.
    const spot = this.progress.inAbyss ? ABYSS.map : this.islands.find((i) => i.def.id === this.progress.islandId).spot;
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
    if (!quiet) sfx.play('ui_click');
    if (id !== this.selected) this.tab = 'island';
    this.selected = id;
    const spot = id === ABYSS.id ? ABYSS.map : this.islands.find((i) => i.def.id === id).spot;
    const g = this.ring.clear().fillStyle(MAP.ringColor, 1);
    const dots = 36;
    for (let k = 0; k < dots; k++) {
      const a = (k / dots) * Math.PI * 2;
      g.fillRect(Math.round(spot.x + Math.cos(a) * MAP.ringRadius) - 1, Math.round(spot.y + Math.sin(a) * MAP.ringRadius * 0.8) - 1, 2, 2);
    }
    this.drawCard();
  }

  // Where the card goes: away from what's selected (see MAP.card).
  get cardBox() {
    const { x, leftX, splitX, ...rest } = MAP.card;
    const spot = this.selected === ABYSS.id ? ABYSS.map : this.islands.find((i) => i.def.id === this.selected).spot;
    return { ...rest, x: spot.x > splitX ? leftX : x };
  }

  drawCard() {
    if (this.selected === ABYSS.id) {
      this.drawAbyssCard();
      return;
    }
    const p = this.progress;
    const index = this.islands.findIndex((i) => i.def.id === this.selected);
    const { def } = this.islands[index];
    const record = p.islandRecord(def.id);
    const cleared = p.isIslandCleared(def.id);
    const { x, y, width: w, height: h } = this.cardBox;
    const add = (...objs) => this.card.add(objs);
    this.card.removeAll(true);
    // Island / Boss Hunt tabs over the card's top edge, once there's a boss
    // to hunt here.
    const hunts = p.hasHunts(def.id);
    if (!hunts) this.tab = 'island';
    if (hunts) {
      [['island', 'ISLAND'], ['hunt', 'BOSS HUNT']].forEach(([tab, label], i) => {
        const b = new Button(this, x + 36 + i * 74, y - 7, {
          width: tab === 'hunt' ? 74 : 60, height: 16, font: 'small', label,
          style: this.tab === tab ? 'gold' : 'wood',
          onClick: () => this.setTab(tab),
        });
        add(b);
      });
    }
    add(panel(this, x, y, w, h, 'parchment'));
    if (this.tab === 'hunt') {
      this.drawHunts(def, index);
      return;
    }
    add(text(this, x + 10, y + 9, def.name, dark()));
    add(text(this, x + 10, y + 26, `ISLAND ${index + 1}  -  ${cleared ? 'ENDLESS' : `WAVES 1-${def.waves}`}`, subText()));
    const rows = [
      ['HAZARD', def.hazard.toUpperCase()],
      ['BOSS', def.boss.toUpperCase()],
      ['BEST WAVE', record?.best ? formatNum(record.best) : '-'],
      ['NOW AT', record ? `WAVE ${formatNum(record.wave)}` : '-'],
    ];
    rows.forEach(([label, value], i) => {
      const ry = y + 40 + i * 11;
      add(text(this, x + 10, ry, label, subText()), text(this, x + MAP.card.valueX, ry, value, subText({ color: UI.colors.textOnParchment })));
    });
    add(this.add.rectangle(x + 8, y + 86, w - 16, 1, hexColor(UI_KIT.dividerColor)).setOrigin(0));
    // An island without content yet can't be sailed to.
    const button = new Button(this, x + w / 2, y + h - 20, {
      width: w - 24, height: 24, style: 'gold', label: def.available ? 'SET SAIL!' : 'COMING SOON',
      onClick: () => this.setSail(def.id),
    });
    add(button.setEnabled(def.available));
  }

  // The Abyss's card: its best depth and dives, then either the dive under
  // way (back to it) or the depths a dive can start at (1 and each
  // checkpoint open), the currents it will face from there (this map's
  // seed for it: those active at the start depth, or the first one to come)
  // and DIVE!.
  drawAbyssCard() {
    const p = this.progress;
    // Taller than an island's (upward), for the Skip the shallows row.
    const box = this.cardBox;
    const { x, width: w } = box;
    const y = box.y - ABYSS.cardExtra;
    const h = box.height + ABYSS.cardExtra;
    const add = (...objs) => this.card.add(objs);
    this.card.removeAll(true);
    add(panel(this, x, y, w, h, 'parchment'));
    add(text(this, x + 10, y + 9, ABYSS.name, dark()));
    add(text(this, x + 10, y + 26, 'THE ENDLESS DIVE', subText()));
    add(new Button(this, x + w - 20, y + 16, {
      width: 24, height: 20, icon: 'trophy', label: '', onClick: () => this.openRankings(),
    }));
    const vx = x + ABYSS_VALUE_X;
    const rows = [
      ['BEST DEPTH', p.abyss.best ? formatNum(p.abyss.best) : '-'],
      [p.inAbyss ? 'NOW AT' : 'DIVES', p.inAbyss ? `DEPTH ${formatNum(p.depth)}` : formatNum(p.abyss.runs)],
    ];
    rows.forEach(([label, value], i) => {
      const ry = y + 40 + i * 11;
      add(text(this, x + 10, ry, label, subText()), text(this, vx, ry, value, subText({ color: UI.colors.textOnParchment })));
    });
    if (p.inAbyss) {
      add(text(this, x + 10, y + 66, 'SAILING ANYWHERE ELSE', subText()), text(this, x + 10, y + 75, 'ENDS THE DIVE', subText()));
      add(new Button(this, x + w / 2, y + h - 20, {
        width: w - 24, height: 24, style: 'gold', label: 'BACK TO THE DIVE', onClick: () => this.close(),
      }));
      return;
    }
    // Start depths: 1 and the deepest checkpoints that fit.
    const open = p.abyssCheckpoints;
    const shown = open.length > 4 ? [1, ...open.slice(-3)] : open;
    add(text(this, x + 10, y + 64, 'START AT', subText()));
    shown.forEach((d, i) => {
      add(new Button(this, vx + 10 + i * 22, y + 67, {
        width: 20, height: 14, font: 'small', label: `${d}`, style: d === this.diveFrom ? 'gold' : 'wood',
        onClick: () => this.pickStart(d),
      }));
    });
    // The currents this dive meets at its start, or the first to come.
    const { active } = depthCurrents(this.diveSeed, this.diveFrom);
    const first = ABYSS.currents.counts[0][0];
    const list = active.length ? active : depthCurrents(this.diveSeed, first).active;
    const order = this.cache.json.get(ABYSS_JSON_KEY)?.currents.order.map((c) => c.id) ?? [];
    const label = active.length ? 'CURRENTS' : `AT DEPTH ${first}`;
    add(text(this, x + 10, y + 80, label, subText()));
    list.forEach((id, i) => add(this.add.image(vx + 6 + i * 14, y + 82, CURRENTS_KEY, order.indexOf(id))));
    // Skip the shallows: from depth 1 once the best depth allows it.
    if (this.diveFrom === 1 && p.canSkipShallows) {
      add(text(this, x + 10, y + 94, `SKIP DEPTHS 1-${ABYSS.skip.depths}`, subText()));
      add(new Button(this, x + w - 30, y + 97, {
        width: 36, height: 14, font: 'small', label: p.abyss.skipShallows ? 'ON' : 'OFF',
        style: p.abyss.skipShallows ? 'gold' : 'wood', onClick: () => this.toggleSkip(),
      }));
    }
    add(this.add.rectangle(x + 8, y + 108, w - 16, 1, hexColor(UI_KIT.dividerColor)).setOrigin(0));
    add(new Button(this, x + w / 2, y + h - 20, {
      width: w - 24, height: 24, style: 'gold', label: 'DIVE!', onClick: () => this.dive(),
    }));
  }

  // Rankings (the Abyss's deepest dives), over the map.
  openRankings() {
    sfx.play('ui_open');
    this.scene.launch('RankingsScene', { progress: this.progress });
  }

  // Skip the shallows on or off (saved with the Abyss record).
  toggleSkip() {
    sfx.play('ui_click');
    this.progress.abyss.skipShallows = !this.progress.abyss.skipShallows;
    this.drawCard();
  }

  pickStart(depth) {
    if (depth === this.diveFrom) return;
    sfx.play('ui_click');
    this.diveFrom = depth;
    this.drawCard();
  }

  // Start a dive (from the island the ship is at; it stays there for when
  // the dive ends).
  dive() {
    sfx.play('ui_click');
    this.scene.stop();
    this.onClose?.(false, null, { dive: { from: this.diveFrom, seed: this.diveSeed } });
  }

  // During a dive, leaving the Abyss (to sail to an island, or for a hunt)
  // ends it: ask first, then go(left) with the dive's summary.
  leaveDive(go) {
    if (!this.progress.inAbyss) {
      go(null);
      return;
    }
    new ConfirmDialog(this, {
      title: 'Leave the Abyss?',
      message: `Your dive ends at depth ${formatNum(this.progress.depth)}. You can dive again any time.`,
      confirmLabel: 'Leave',
      onConfirm: () => go(this.progress.endDive()),
    });
  }

  setTab(tab) {
    if (tab === this.tab) return;
    sfx.play('ui_click');
    this.tab = tab;
    this.drawCard();
  }

  // The Boss Hunt tab: each of the island's bosses, beaten ones with their
  // hunt level, a win's drop, today's double drops left and HUNT; the rest
  // still to be beaten in a boss wave.
  drawHunts(def, index) {
    const p = this.progress;
    const { x, y, width: w } = this.cardBox;
    const add = (...objs) => this.card.add(objs);
    add(text(this, x + 10, y + 9, def.name, dark()));
    add(text(this, x + 10, y + 26, `ISLAND ${index + 1}  -  BOSS HUNTS`, subText()));
    p.huntableBosses(def.id).forEach(({ boss, open }, i) => {
      const top = y + 38 + i * 42;
      const enemy = ENEMIES[boss];
      add(this.add.rectangle(x + 7, top - 1, 34, 34, hexColor(UI_KIT.dividerColor)).setOrigin(0));
      const portrait = enemyPortrait(this, x + 8, top, boss);
      add(open ? portrait : portrait.setTintFill(hexColor(UI.colors.subText)));
      add(text(this, x + 46, top + 1, open ? enemy.name : '???', subText({ color: UI.colors.textOnParchment })));
      if (!open) {
        add(text(this, x + 46, top + 12, 'BEAT IT IN A BOSS WAVE', subText()));
        add(text(this, x + 46, top + 21, 'TO HUNT IT HERE', subText()));
        return;
      }
      const level = p.huntLevel(boss);
      const drop = p.huntDrop(boss, level);
      const left = p.huntDoublesLeft(boss);
      add(text(this, x + 46, top + 11, left ? `2X TODAY: ${left} LEFT` : 'NO 2X LEFT TODAY', subText({ color: left ? MAP.clearedColor : null })));
      const lv = text(this, x + 46, top + 22, `LV ${formatNum(level)}  WIN`, subText());
      add(lv, materialIcon(this, lv.anchorX + lv.inkWidth + 10, top + 24, drop.material),
        text(this, lv.anchorX + lv.inkWidth + 19, top + 22, `+${drop.count}`, subText({ color: UI.colors.textOnParchment })));
      add(new Button(this, x + w - 23, top + 25, {
        width: 36, height: 15, style: 'gold', font: 'small', label: 'HUNT',
        onClick: () => this.hunt(boss, def.id),
      }));
    });
    const note = `EACH WIN: +${Math.round(HUNTS.growth * 100)}% HP AND DAMAGE`;
    add(text(this, x + w / 2, y + MAP.card.height - 10, note, subText()).setOrigin(0.5));
  }

  // Sail to the island if the ship isn't there, and start a Boss Hunt.
  hunt(boss, id) {
    sfx.play('wave_start');
    this.leaveDive((left) => {
      const sailed = id !== this.progress.islandId && this.progress.sailTo(id);
      this.scene.stop();
      this.onClose?.(sailed, { boss, island: id }, { left });
    });
  }

  // Sail to the island (or, if the ship is already there, just back to it).
  setSail(id) {
    sfx.play('ui_click');
    this.leaveDive((left) => {
      const sailed = id !== this.progress.islandId && this.progress.sailTo(id);
      this.scene.stop();
      this.onClose?.(sailed, null, { left });
    });
  }

  close() {
    sfx.play('ui_back');
    this.scene.stop();
    this.onClose?.(false);
  }
}
