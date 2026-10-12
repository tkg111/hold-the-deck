import Phaser from 'phaser';
import {
  DISPLAY, EXPEDITIONS, HEROES, PACK_FX, SPRITES, UI_KIT,
} from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, fillView } from '../display.js';
import { mapKey } from '../sprites.js';
import * as X from '../systems/Expeditions.js';
import { saveProgress } from '../systems/Save.js';
import { Button } from '../ui/Button.js';
import {
  cssColor, fmtClock, fmtNumber, fmtShort, fmtShortTime, starLabel,
} from '../ui/format.js';
import {
  Bar, dark, expeditionKey, face, hexColor, icon, light, panel, subText, text, traitIcon, UI,
} from '../ui/kit.js';

const CX = DISPLAY.width / 2;
const destKey = (id) => expeditionKey(`dest_${id}`);
const CONFETTI_COLORS = [0xffd54f, 0xe53935, 0xffffff, 0x66bb6a, 0x29b6f6];

// Planning screen layout (base pixels): destinations top-left, their details
// top-right, the crew across the middle, duration / preview / Send at the
// bottom. Every tap target is at least 24px.
const PLAN = {
  dest: { x: 6, y: 28, w: 292, h: 106, cellW: 64, cellH: 40, gap: 6, top: 44 },
  info: { x: 304, y: 28, w: 170, h: 106 },
  crew: { x: 6, y: 138, w: 468, h: 80, gridX: 120, gridY: 151, pitch: 28, tile: 26, cols: 7 },
  bottom: { x: 6, y: 222, w: 468, h: 44 },
};

// The Expeditions overlay, launched over GameScene (or the world map) with
// { progress, onClose(changed) }: the board (a card per slot: empty, out
// with a countdown, or back with a Collect button), the planning screen
// (destination, up to 3 crew, duration, a preview of the rewards, Send) and
// the reveal after collecting (the party, a line of story, then each reward
// flipping over, a bonus find last). Times are real time (Date.now; see
// Expeditions.tick), so the countdowns keep going while the game is closed.
export class ExpeditionScene extends Phaser.Scene {
  constructor() {
    super('ExpeditionScene');
  }

  init({ progress, onClose }) {
    this.progress = progress;
    this.onClose = onClose;
    this.changed = false;          // crew, gold or chests changed
    this.lastPlan = null;          // the last destination and duration picked
  }

  create() {
    applyRenderScale(this);
    if (!this.textures.exists('confetti')) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      g.fillStyle(0xffffff).fillRect(0, 0, 4, 2);
      g.generateTexture('confetti', 4, 2);
      g.destroy();
    }
    this.backdrop = fillView(this, 0x0d1117, 0.92);
    this.layer = this.add.container(0, 0);
    this.timers = [];   // board countdowns to update: { entry, label, bar }
    X.tick(this.progress);
    this.showBoard();
    // Countdowns (real time, a few times a second so seconds tick evenly).
    this.time.addEvent({ delay: 250, loop: true, callback: () => this.tickTimers() });
  }

  // Empty the screen for another view.
  reset() {
    this.tweens.killAll();
    this.layer.removeAll(true);
    this.timers = [];
    this.backdrop.removeAllListeners('pointerdown');
    this.mode = null;
  }

  add2(...objs) {
    this.layer.add(objs);
    return objs[0];
  }

  titlePlate(title, width = 160) {
    this.add2(panel(this, CX - width / 2, 4, width, 20, 'wood'));
    this.add2(text(this, CX, 14, title, light()).setOrigin(0.5));
  }

  // --- The board ---

  showBoard() {
    this.reset();
    this.mode = 'board';
    const p = this.progress;
    this.titlePlate('EXPEDITIONS');
    this.add2(new Button(this, DISPLAY.width - 30, 16, {
      width: 48, height: 24, label: 'Back', onClick: () => this.close(),
    }));
    const { cardWidth: w, cardHeight: h, gap, top } = EXPEDITIONS.board;
    const n = X.maxSlots();
    const left = Math.round(CX - (n * w + (n - 1) * gap) / 2);
    for (let i = 0; i < n; i++) this.slotCard(i, left + i * (w + gap), top, w, h);
    const ready = X.readyCount(p);
    this.add2(text(this, CX, 250, ready
      ? `${ready} EXPEDITION${ready > 1 ? 'S' : ''} BACK - TAP COLLECT!`
      : 'CREW KEEP SAILING WHILE THE GAME IS CLOSED', light({ font: 'small' })).setOrigin(0.5));
  }

  slotCard(i, x, y, w, h) {
    const p = this.progress;
    const cx = x + w / 2;
    if (i >= X.slotCount(p)) {
      // Locked: opens with an island.
      const island = X.slotIsland(i);
      this.add2(panel(this, x, y, w, h, 'wood'));
      this.add2(text(this, cx, y + h / 2 - 12, 'SLOT LOCKED', light()).setOrigin(0.5));
      this.add2(text(this, cx, y + h / 2 + 6, island ? `OPENS WITH ${island.name.toUpperCase()}` : '',
        light({ font: 'small', align: 'center', wrap: w - 16 })).setOrigin(0.5, 0));
      return;
    }
    const entry = p.expeditions[i];
    this.add2(panel(this, x, y, w, h, 'parchment'));
    if (!entry) {
      // Empty: tap anywhere on it to plan one.
      const zone = this.add2(this.add.zone(cx, y + h / 2, w, h).setInteractive({ useHandCursor: true }));
      zone.on('pointerdown', () => this.showPlan(i));
      this.plate(cx, y, w, `SLOT ${i + 1}`);
      this.add2(icon(this, cx, y + 62, expeditionKey('icon_expedition')).setScale(3));
      this.add2(new Button(this, cx, y + 112, {
        width: 104, height: 28, style: 'gold', label: '+ Send', onClick: () => this.showPlan(i),
      }));
      this.add2(text(this, cx, y + 136, `SEND UP TO ${EXPEDITIONS.maxParty} CREW`, subText()).setOrigin(0.5, 0));
      this.add2(text(this, cx, y + 148, 'TO BRING BACK LOOT', subText()).setOrigin(0.5, 0));
      return;
    }
    const dest = X.destinationOf(entry.dest);
    const returned = X.isReturned(entry);
    this.plate(cx, y, w, dest?.name ?? '?');
    this.add2(this.add.image(cx, y + 20, destKey(entry.dest)).setOrigin(0.5, 0).setScale(2));
    this.partyRow(entry.party, cx, y + 112);
    const duration = X.durationOf(entry.duration);
    this.add2(text(this, cx, y + 126, `${duration.label} EXPEDITION`, subText()).setOrigin(0.5, 0));
    if (returned) {
      this.stamp(cx, y + 60);
      this.add2(text(this, cx, y + 140, 'BACK WITH LOOT!', dark()).setOrigin(0.5, 0));
      const button = this.add2(new Button(this, cx, y + h - 24, {
        width: 112, height: 28, style: 'gold', label: 'Collect', onClick: () => this.collect(i),
      }));
      // A soft pulse so it's the obvious thing to tap.
      const glow = this.add.rectangle(cx, y + h - 25, 118, 32, hexColor(UI_KIT.starColor), 0.35);
      this.layer.addAt(glow, this.layer.getIndex(button));
      this.tweens.add({ targets: glow, alpha: 0.05, duration: 700, yoyo: true, repeat: -1 });
      return;
    }
    const label = this.add2(text(this, cx, y + 140, fmtClock(X.timeLeft(entry)), dark()).setOrigin(0.5, 0));
    const bar = new Bar(this, x + 12, y + h - 34, w - 24, 10, UI.colors.progress);
    this.add2(bar);
    this.add2(text(this, cx, y + h - 16, 'TIME LEFT', subText()).setOrigin(0.5, 0));
    this.timers.push({ entry, label, bar });
    this.updateTimer(this.timers[this.timers.length - 1]);
  }

  // A wood plate across the top of a card, with a title.
  plate(cx, y, w, title) {
    this.add2(panel(this, cx - (w - 8) / 2, y - 4, w - 8, 20, 'wood'));
    this.add2(text(this, cx, y + 6, title, light()).setOrigin(0.5));
  }

  // The party's faces side by side, each with its trait icon.
  partyRow(party, cx, y) {
    const pitch = 40;
    const left = cx - ((party.length - 1) * pitch) / 2;
    party.forEach((id, k) => {
      const x = Math.round(left + k * pitch);
      this.add2(this.add.rectangle(x - 3, y, 30, 18, hexColor(UI.colors.subText), 0.2));
      this.add2(face(this, x - 6, y, id));
      this.add2(traitIcon(this, x + 8, y, X.traitOf(id)));
    });
  }

  // "RETURNED!" stamped over a card's picture.
  stamp(cx, cy) {
    const label = text(this, cx, cy, 'RETURNED!', light({ color: UI.colors.warn })).setOrigin(0.5);
    const w = label.inkWidth + 14;
    const box = this.add.rectangle(cx, cy, w, 20, hexColor(UI.colors.textOnParchment), 0.85)
      .setStrokeStyle(2, hexColor(UI.colors.warn));
    this.add2(box);
    this.add2(label);
  }

  updateTimer(t) {
    const ms = X.durationOf(t.entry.duration).ms;
    t.label.setText(fmtClock(X.timeLeft(t.entry)));
    t.bar.setValue(t.entry.elapsed / ms);
  }

  // Real time passes: countdowns tick, and the board redraws when one comes
  // back. (The planning screen's away crew show times too.)
  tickTimers() {
    X.tick(this.progress);
    if (this.mode === 'board') {
      if (this.timers.some((t) => X.isReturned(t.entry))) {
        sfx.click();
        this.showBoard();
        return;
      }
      for (const t of this.timers) this.updateTimer(t);
    }
    if (this.mode === 'plan') for (const t of this.timers) t.label.setText(fmtShortTime(X.timeLeft(t.entry)));
  }

  // --- Planning ---

  // preset: { dest, party, duration } to start from.
  showPlan(slot, preset = null) {
    sfx.click();
    const p = this.progress;
    const open = EXPEDITION_DESTS().filter((d) => X.isDestinationOpen(p, d));
    const last = preset ?? this.lastPlan ?? {};
    this.plan = {
      slot,
      dest: open.some((d) => d.id === last.dest) ? last.dest : open[0]?.id,
      party: (last.party ?? []).filter((id) => p.isOwned(id) && !X.entryOf(p, id)),
      duration: X.durationOf(last.duration) ? last.duration : EXPEDITIONS.durations[0].id,
      peek: null,     // a locked destination tapped: its lock shows in the details
      focus: null,    // the crewmate whose details show
    };
    this.drawPlan();
  }

  drawPlan() {
    this.reset();
    this.mode = 'plan';
    this.titlePlate('PLAN EXPEDITION', 170);
    this.add2(new Button(this, DISPLAY.width - 30, 16, {
      width: 48, height: 24, label: 'Back', onClick: () => { sfx.click(); this.showBoard(); },
    }));
    this.drawDestinations();
    this.drawDestinationInfo();
    this.drawCrew();
    this.drawBottom();
  }

  drawDestinations() {
    const p = this.progress;
    const { x, y, w, h, cellW, cellH, gap, top } = PLAN.dest;
    this.add2(panel(this, x, y, w, h, 'parchment'));
    this.add2(text(this, x + 9, y + 6, 'DESTINATION', subText()));
    const dests = EXPEDITION_DESTS();
    const cols = 4;
    const gridW = cols * cellW + (cols - 1) * gap;
    const left = Math.round(x + (w - gridW) / 2);
    dests.forEach((dest, i) => {
      const cx = left + (i % cols) * (cellW + gap);
      const cy = top + Math.floor(i / cols) * (cellH + gap);
      const isOpen = X.isDestinationOpen(p, dest);
      if (isOpen) {
        this.add2(this.add.image(cx, cy, destKey(dest.id)).setOrigin(0));
      } else {
        // Locked: the island's silhouette, and the wave it opens on.
        this.add2(this.add.rectangle(cx, cy, cellW, cellH, hexColor(UI.colors.textOnParchment), 0.55).setOrigin(0));
        const sil = this.add.image(cx, cy - 6, mapKey(dest.island)).setOrigin(0).setTintFill(0x000000).setAlpha(0.7);
        sil.setCrop(0, 6, cellW, cellH);
        this.add2(sil);
        this.add2(text(this, cx + cellW / 2, cy + 11, `WAVE ${X.destinationWave(dest)}`, light({ font: 'small' })).setOrigin(0.5, 0));
        const island = X.destinationIslandName(dest, { short: true }).toUpperCase();
        this.add2(text(this, cx + cellW / 2, cy + 22, island, light({ font: 'small' })).setOrigin(0.5, 0));
      }
      const selected = (this.plan.peek ?? this.plan.dest) === dest.id;
      if (selected) {
        this.add2(this.add.rectangle(cx - 2, cy - 2, cellW + 4, cellH + 4).setOrigin(0)
          .setStrokeStyle(2, hexColor(isOpen ? UI_KIT.starColor : UI.colors.warn)));
      }
      const zone = this.add2(this.add.zone(cx, cy, cellW, cellH).setOrigin(0).setInteractive({ useHandCursor: true }));
      zone.on('pointerdown', () => {
        if (isOpen) {
          sfx.click();
          this.plan.dest = dest.id;
          this.plan.peek = null;
        } else {
          sfx.denied();
          this.plan.peek = dest.id;
        }
        this.drawPlan();
      });
    });
  }

  drawDestinationInfo() {
    const { x, y, w, h } = PLAN.info;
    this.add2(panel(this, x, y, w, h, 'parchment'));
    const dest = X.destinationOf(this.plan.peek ?? this.plan.dest);
    const tx = x + 9;
    if (!dest) {
      this.add2(text(this, tx, y + 8, 'No destination yet', dark()));
      return;
    }
    this.add2(text(this, tx, y + 7, dest.name, dark()));
    this.add2(text(this, tx, y + 23, X.destinationIslandName(dest).toUpperCase(), subText()));
    if (this.plan.peek) {
      this.add2(text(this, tx, y + 40, X.destinationLockLabel(dest).toUpperCase(),
        subText({ color: UI.colors.warn, wrap: w - 18 })));
      return;
    }
    this.add2(text(this, tx, y + 37, 'FAVOURS', subText()));
    this.add2(traitIcon(this, tx + 53, y + 40, dest.favouredTrait));
    this.add2(text(this, tx + 62, y + 37, X.traitLabel(dest.favouredTrait).toUpperCase(),
      subText({ color: UI.colors.textOnParchment })));
    this.add2(text(this, tx, y + 50, 'REWARD', subText()));
    this.add2(text(this, tx + 48, y + 50, EXPEDITIONS.focus[dest.rewardFocus].label.toUpperCase(),
      subText({ color: UI.colors.textOnParchment, wrap: w - 66 })));
    const bonus = X.partyBonus(this.progress, this.plan.party, dest);
    this.add2(this.add.rectangle(x + 8, y + 72, w - 16, 1, hexColor(UI_KIT.dividerColor)).setOrigin(0));
    this.add2(text(this, tx, y + 78, `PARTY BONUS +${Math.round((bonus.multiplier - 1) * 100)}%`, subText({ color: UI.colors.textOnParchment })));
    const parts = `${bonus.matches} ${X.traitLabel(dest.favouredTrait).toUpperCase()}${bonus.matches === 1 ? '' : 'S'}, ${bonus.stars} STAR${bonus.stars === 1 ? '' : 'S'}`;
    this.add2(text(this, tx, y + 88, parts, subText()));
    if (bonus.guaranteed) this.add2(text(this, tx, y + 96, 'FULL MATCH: BONUS FIND!', subText({ color: '#b8860b' })));
  }

  // Crew sorted for the destination: the favoured trait first, then the
  // rest, strongest first; crew already away last.
  sortedCrew(dest) {
    const p = this.progress;
    const rank = (id) => (X.entryOf(p, id) ? 2 : X.traitOf(id) === dest?.favouredTrait ? 0 : 1);
    return [...p.ownedHeroes].sort((a, b) => rank(a) - rank(b)
      || p.heroStarCount(b) - p.heroStarCount(a)
      || p.heroLevel(b) - p.heroLevel(a));
  }

  drawCrew() {
    const p = this.progress;
    const C = PLAN.crew;
    const dest = X.destinationOf(this.plan.dest);
    this.add2(panel(this, C.x, C.y, C.w, C.h, 'parchment'));
    this.add2(text(this, C.x + 9, C.y + 6, `CREW (UP TO ${EXPEDITIONS.maxParty})`, subText()));

    // The party: tap one to take them off it.
    for (let k = 0; k < EXPEDITIONS.maxParty; k++) {
      const bx = C.x + 10 + k * 34;
      const by = C.gridY;
      const id = this.plan.party[k];
      this.add2(this.add.rectangle(bx, by, 30, 30, hexColor(UI.colors.subText), id ? 0.3 : 0.12).setOrigin(0)
        .setStrokeStyle(1, hexColor(UI.colors.subText)));
      if (!id) {
        this.add2(text(this, bx + 15, by + 15, '+', subText()).setOrigin(0.5));
        continue;
      }
      this.add2(face(this, bx + 15, by + 12, id));
      this.add2(traitIcon(this, bx + 22, by + 23, X.traitOf(id)));
      const zone = this.add2(this.add.zone(bx, by, 30, 30).setOrigin(0).setInteractive({ useHandCursor: true }));
      zone.on('pointerdown', () => this.toggleCrew(id));
    }
    this.add2(text(this, C.x + 10 + 50, C.gridY + 36, 'YOUR PARTY', subText()).setOrigin(0.5, 0));

    // Everyone else, favoured trait first.
    this.sortedCrew(dest).forEach((id, i) => {
      const tx = C.gridX + (i % C.cols) * C.pitch;
      const ty = C.gridY + Math.floor(i / C.cols) * C.pitch;
      this.crewTile(id, tx, ty, dest);
    });

    this.drawCrewInfo(C.gridX + C.cols * C.pitch + 6, C.gridY - 2);
    // The deck warning.
    const leaving = X.onDeck(p, this.plan.party);
    if (leaving.length) {
      const names = leaving.map((id) => HEROES[id][leaving.length > 1 ? 'shortName' : 'name']);
      const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0];
      this.add2(text(this, C.x + 9, C.y + C.h - 11,
        `${who} will leave the deck until the expedition returns`.toUpperCase(), subText({ color: UI.colors.warn })));
    }
  }

  crewTile(id, x, y, dest) {
    const p = this.progress;
    const s = PLAN.crew.tile;
    const entry = X.entryOf(p, id);
    const inParty = this.plan.party.includes(id);
    const favoured = !!dest && X.traitOf(id) === dest.favouredTrait;
    const bg = this.add2(this.add.rectangle(x, y, s, s, hexColor(inParty ? UI_KIT.starColor : UI.colors.subText), inParty ? 0.45 : 0.15)
      .setOrigin(0));
    if (inParty) bg.setStrokeStyle(2, hexColor('#b8860b'));
    if (this.plan.focus === id) bg.setStrokeStyle(1, hexColor(UI.colors.textOnParchment));
    const cx = x + s / 2;
    const portrait = this.add2(face(this, cx - 2, y + 9, id));
    if (entry) {
      // Away: dimmed, with the hourglass and the time left.
      portrait.setAlpha(0.35);
      this.add2(icon(this, cx, y + 10, expeditionKey('icon_hourglass')));
      const label = this.add2(text(this, cx, y + s - 7, X.isReturned(entry) ? 'BACK' : fmtShortTime(X.timeLeft(entry)),
        subText({ color: UI.colors.textOnParchment })).setOrigin(0.5, 0));
      this.timers.push({ entry, label });
    } else {
      if (favoured) {
        // The favoured trait's icon glows.
        const glow = this.add2(this.add.circle(x + s - 6, y + s - 6, 7, EXPEDITIONS.glowColor, 0.7));
        this.tweens.add({ targets: glow, alpha: 0.15, duration: 600, yoyo: true, repeat: -1 });
      }
      this.add2(traitIcon(this, x + s - 6, y + s - 6, X.traitOf(id)));
      const slot = p.slotOf(id);
      if (slot >= 0) this.add2(text(this, x + 2, y + s - 9, `${slot + 1}`, subText({ color: UI.colors.textOnParchment })));
    }
    const zone = this.add2(this.add.zone(x, y, s, s).setOrigin(0).setInteractive({ useHandCursor: true }));
    zone.on('pointerdown', () => this.toggleCrew(id));
  }

  // The tapped crewmate: level, stars, trait and where they are.
  drawCrewInfo(x, y) {
    const p = this.progress;
    const id = this.plan.focus;
    if (!id) {
      this.add2(text(this, x, y + 2, 'TAP CREW TO ADD', subText()));
      this.add2(text(this, x, y + 12, 'THEM TO THE PARTY.', subText()));
      this.add2(text(this, x, y + 26, 'THE FAVOURED TRAIT', subText()));
      this.add2(text(this, x, y + 36, 'GLOWS AND GIVES +25%;', subText()));
      this.add2(text(this, x, y + 46, 'EVERY STAR GIVES +5%.', subText()));
      return;
    }
    const entry = X.entryOf(p, id);
    const slot = p.slotOf(id);
    this.add2(text(this, x, y, HEROES[id].name, dark()));
    const stars = starLabel(p.heroStarCount(id), p.heroBonusLevels(id)) || '0 STARS';
    this.add2(text(this, x, y + 16, `LV ${p.heroLevel(id)}  ${stars}`, subText()));
    this.add2(traitIcon(this, x + 5, y + 30, X.traitOf(id)));
    this.add2(text(this, x + 14, y + 27, X.traitLabel(X.traitOf(id)).toUpperCase(), subText({ color: UI.colors.textOnParchment })));
    let where = slot >= 0 ? `ON DECK, SLOT ${slot + 1}` : 'ON THE BENCH';
    if (entry) where = X.isReturned(entry) ? 'BACK - COLLECT LOOT' : `AWAY, BACK IN ${fmtClock(X.timeLeft(entry))}`;
    this.add2(text(this, x, y + 40, where, subText({ color: entry ? UI.colors.warn : UI.colors.subText })));
  }

  toggleCrew(id) {
    const p = this.progress;
    this.plan.focus = id;
    const party = this.plan.party;
    if (X.entryOf(p, id)) {
      sfx.denied();
    } else if (party.includes(id)) {
      sfx.click();
      party.splice(party.indexOf(id), 1);
    } else if (party.length >= EXPEDITIONS.maxParty) {
      sfx.denied();
    } else {
      sfx.click();
      party.push(id);
    }
    this.drawPlan();
  }

  drawBottom() {
    const p = this.progress;
    const B = PLAN.bottom;
    this.add2(panel(this, B.x, B.y, B.w, B.h, 'parchment'));
    const by = B.y + B.h / 2 + 1;
    EXPEDITIONS.durations.forEach((d, k) => {
      const selected = d.id === this.plan.duration;
      this.add2(new Button(this, B.x + 34 + k * 54, by, {
        width: 50, height: 26, style: selected ? 'gold' : 'wood', label: d.label,
        onClick: () => {
          sfx.click();
          this.plan.duration = d.id;
          this.drawPlan();
        },
      }));
    });
    const tx = B.x + 176;
    const { slot, dest, party, duration } = this.plan;
    const problem = X.sendProblem(p, slot, dest, party, duration);
    if (!dest) {
      this.add2(text(this, tx, B.y + 8, 'No destination open', dark()));
    } else if (!party.length) {
      this.add2(text(this, tx, B.y + 8, 'Pick up to 3 crew', dark()));
      this.add2(text(this, tx, B.y + 26, `${X.durationOf(duration).label} EXPEDITION TO`, subText()));
      this.add2(text(this, tx, B.y + 34, X.destinationOf(dest).name.toUpperCase(), subText()));
    } else {
      const v = X.preview(p, dest, party, duration);
      this.add2(text(this, tx, B.y + 7, `~${fmtShort(v.gold[0])}-${fmtShort(v.gold[1])} gold`, dark()));
      const extras = [];
      if (v.pearls[1]) extras.push(`${v.pearls[0]}-${v.pearls[1]} PEARLS`);
      if (v.chests) extras.push(`${v.chests} CHEST${v.betterChests ? ', MAYBE RARE+' : ''}`);
      if (v.chestChance) extras.push(v.chestChance >= 1 ? 'A CHEST' : `${Math.round(v.chestChance * 100)}% CHANCE OF A CHEST`);
      this.add2(text(this, tx, B.y + 24, extras.join(', ') || 'GOLD ONLY', subText()));
      this.add2(text(this, tx, B.y + 33, v.bonusChance >= 1 ? 'BONUS FIND GUARANTEED!' : `${Math.round(v.bonusChance * 100)}% CHANCE OF A BONUS FIND`,
        subText({ color: v.bonusChance >= 1 ? '#b8860b' : UI.colors.subText })));
    }
    const send = this.add2(new Button(this, B.x + B.w - 46, by, {
      width: 80, height: 28, style: 'gold', label: 'Send', onClick: () => this.send(),
    }));
    send.setEnabled(!problem);
  }

  send() {
    const p = this.progress;
    const { slot, dest, party, duration } = this.plan;
    if (!X.send(p, slot, dest, party, duration)) {
      sfx.denied();
      return;
    }
    this.lastPlan = { dest, duration };
    this.changed = true;
    saveProgress(p);
    sfx.flip();
    this.showBoard();
  }

  // --- Collecting: the reveal ---

  collect(slot) {
    const p = this.progress;
    X.tick(p);
    const entry = X.collect(p, slot);
    if (!entry) return;
    this.changed = true;
    saveProgress(p);   // paid before the show, so closing mid-reveal loses nothing
    this.showReveal(entry, slot);
  }

  // The rewards to flip, in order: gold, Pearls, chests, then the bonus find.
  rewardsOf(entry) {
    const { loot } = entry;
    const list = [{ kind: 'gold', amount: loot.gold }];
    if (loot.pearls) list.push({ kind: 'pearls', amount: loot.pearls });
    for (const tier of loot.chests) list.push({ kind: 'chest', tier });
    if (loot.bonus) list.push({ ...loot.bonus, bonus: true });
    return list;
  }

  showReveal(entry, slot) {
    this.reset();
    this.mode = 'reveal';
    const R = EXPEDITIONS.reveal;
    const dest = X.destinationOf(entry.dest);
    this.titlePlate(dest?.name ?? 'EXPEDITION', 170);

    // The destination with the party standing in front of it.
    this.add2(this.add.image(CX, 28, destKey(entry.dest)).setOrigin(0.5, 0).setScale(2));
    const pitch = 34;
    const left = CX - ((entry.party.length - 1) * pitch) / 2;
    entry.party.forEach((id, k) => {
      const key = SPRITES.heroes[id]?.key;
      const hero = key
        ? this.add.image(Math.round(left + k * pitch), 107, key).setOrigin(0.5, 1)
        : this.add.rectangle(Math.round(left + k * pitch), 107, 12, 25, HEROES[id].color).setOrigin(0.5, 1);
      this.add2(hero.setAlpha(0));
      this.tweens.add({ targets: hero, alpha: 1, duration: 250, delay: k * 120 });
    });

    // A line of story.
    const story = text(this, CX, 121, entry.story, dark()).setOrigin(0.5);
    const sw = Math.max(200, story.inkWidth + 20);
    const strip = this.add2(this.add.container(0, 0, [panel(this, CX - sw / 2, 111, sw, 20, 'parchment'), story]).setAlpha(0));
    this.tweens.add({ targets: strip, alpha: 1, duration: 300, delay: R.storyMs - 200 });

    // The rewards, face down, flipping one at a time.
    const rewards = this.rewardsOf(entry);
    const w = R.cardWidth;
    const rowW = rewards.length * w + (rewards.length - 1) * R.gap;
    const rowLeft = Math.round(CX - rowW / 2);
    this.reveal = {
      entry, slot, cards: [], next: 0, done: false,
    };
    rewards.forEach((r, i) => {
      const card = this.rewardCard(r, rowLeft + i * (w + R.gap) + w / 2, 137 + R.cardHeight / 2);
      this.reveal.cards.push(card);
    });
    // The first card flips once the story is up, then one every stepMs.
    this.revealTimer = this.time.delayedCall(R.storyMs + 400, () => {
      this.flipNext();
      if (!this.reveal.done) this.revealTimer = this.time.addEvent({ delay: R.stepMs, loop: true, callback: () => this.flipNext() });
    });
    // Tap anywhere to show everything at once.
    this.backdrop.on('pointerdown', () => this.finishReveal());
  }

  // A reward card: wood back (with a "?"), then parchment front.
  rewardCard(reward, cx, cy) {
    const R = EXPEDITIONS.reveal;
    const w = R.cardWidth;
    const h = R.cardHeight;
    const color = this.rewardColor(reward);
    const glow = this.add.rectangle(cx, cy, w + 8, h + 8, color, 0).setOrigin(0.5);
    const back = this.add.container(cx, cy, [
      panel(this, -w / 2, -h / 2, w, h, 'wood'),
      text(this, 0, 0, '?', light({ font: 'big' })).setOrigin(0.5),
    ]);
    if (reward.bonus) back.add(this.add.rectangle(0, 0, w - 2, h - 2).setStrokeStyle(2, EXPEDITIONS.glowColor));
    const frontArt = this.add.container(cx, cy, [panel(this, -w / 2, -h / 2, w, h, 'parchment')]).setVisible(false);
    const art = this.rewardArt(reward);
    frontArt.add(art);
    const labels = this.add.container(0, 0, this.rewardLabels(reward, cx, cy)).setAlpha(0);
    this.add2(glow);
    this.add2(back);
    this.add2(frontArt);
    this.add2(labels);
    return { reward, glow, back, frontArt, labels, cx, cy, flipped: false };
  }

  rewardColor(r) {
    if (r.bonus) return EXPEDITIONS.glowColor;
    if (r.kind === 'chest') return EXPEDITIONS.chests[r.tier].color;
    if (r.kind === 'pearls') return 0xbfe6ff;
    return 0xffd86a;
  }

  // The big icon on the front (3x the kit's 12px icon).
  rewardArt(r) {
    const name = r.kind === 'chest' ? 'chest' : r.kind === 'pearls' ? 'pearl' : 'gold';
    return icon(this, 0, -14, name).setScale(3);
  }

  rewardLabels(r, cx, cy) {
    const R = EXPEDITIONS.reveal;
    const bottom = cy + R.cardHeight / 2;
    let amount;
    let label;
    if (r.kind === 'gold') {
      amount = `+${fmtShort(r.amount)}`;
      label = 'GOLD';
    } else if (r.kind === 'pearls') {
      amount = `+${fmtNumber(r.amount)}`;
      label = r.bonus ? 'PEARLS X2' : 'PEARLS';
    } else {
      amount = '+1';
      label = EXPEDITIONS.chests[r.tier].label.toUpperCase();
    }
    return [
      text(this, cx, bottom - 31, amount, dark()).setOrigin(0.5, 0),
      text(this, cx, bottom - 15, label, subText({ align: 'center', wrap: R.cardWidth - 6, color: r.kind === 'chest' ? cssColor(this.rewardColor(r)) : null }))
        .setOrigin(0.5, 0.5),
    ];
  }

  flipNext() {
    const rv = this.reveal;
    if (!rv || rv.done) return;
    const card = rv.cards[rv.next];
    if (!card) {
      this.endReveal();
      return;
    }
    rv.next++;
    if (card.reward.bonus) this.bonusBanner();
    // A little rattle, then over it goes.
    const R = EXPEDITIONS.reveal;
    this.tweens.add({
      targets: card.back, x: card.cx + 2, duration: 40, yoyo: true, repeat: 2,
      onComplete: () => {
        card.back.x = card.cx;
        this.tweens.add({
          targets: card.back, scaleX: 0, duration: R.flipMs, ease: 'Quad.easeIn',
          onComplete: () => this.showFront(card, true),
        });
      },
    });
  }

  // Turn a card face up (animated, or at once when skipping).
  showFront(card, animate) {
    if (card.flipped) return;
    card.flipped = true;
    const R = EXPEDITIONS.reveal;
    card.back.setVisible(false);
    card.frontArt.setVisible(true);
    const r = card.reward;
    if (animate) {
      sfx.loot(r.bonus ? 'bonus' : r.kind === 'chest' ? r.tier : r.kind);
      card.frontArt.setScale(0, 1);
      this.tweens.add({ targets: card.frontArt, scaleX: 1, duration: R.flipMs, ease: 'Quad.easeOut' });
      this.tweens.add({ targets: card.labels, alpha: 1, duration: 200, delay: R.flipMs });
    } else {
      card.frontArt.setScale(1);
      card.labels.setAlpha(1);
    }
    // Chests and the bonus glow in their colour, like a chest's reveal.
    if (r.kind === 'chest' || r.bonus) {
      card.glow.setFillStyle(this.rewardColor(r), 0.55);
      this.tweens.add({ targets: card.glow, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });
    }
    if (r.bonus && animate) {
      const flash = PACK_FX.revealFlash.legendary;
      if (flash) this.cameras.main.flash(flash, 255, 236, 179);
      const emitter = this.add.particles(card.cx, card.cy - 20, 'confetti', {
        speed: { min: 110, max: 260 },
        angle: { min: 200, max: 340 },
        gravityY: 325,
        lifespan: { min: 1200, max: 2200 },
        rotate: { start: 0, end: 720 },
        alpha: { start: 1, end: 0, ease: 'Quad.easeIn' },
        tint: [EXPEDITIONS.glowColor, ...CONFETTI_COLORS],
        emitting: false,
      }).setDepth(60);
      emitter.explode(EXPEDITIONS.reveal.bonusConfetti);
      this.time.delayedCall(2400, () => emitter.destroy());
    }
  }

  // The gold "Bonus Find!" banner, over the rewards.
  bonusBanner() {
    if (this.reveal.banner) return;
    const label = text(this, CX, 226, 'BONUS FIND!', light({ color: '#ffd86a' })).setOrigin(0.5);
    const w = label.inkWidth + 24;
    const banner = this.add.container(0, 0, [panel(this, CX - w / 2, 217, w, 18, 'wood'), label]).setAlpha(0);
    this.add2(banner);
    this.reveal.banner = banner;
    this.tweens.add({ targets: banner, alpha: 1, duration: 200 });
  }

  // Skip: every card face up now.
  finishReveal() {
    const rv = this.reveal;
    if (!rv || rv.done) return;
    for (const card of rv.cards) {
      this.tweens.killTweensOf([card.back, card.frontArt, card.labels]);
      if (card.reward.bonus) this.bonusBanner();
      this.showFront(card, false);
    }
    sfx.loot(rv.cards.some((c) => c.reward.bonus) ? 'bonus' : 'gold');
    this.endReveal();
  }

  endReveal() {
    const rv = this.reveal;
    rv.done = true;
    this.revealTimer?.remove();
    this.backdrop.removeAllListeners('pointerdown');
    const { entry, slot } = rv;
    const p = this.progress;
    const chests = entry.loot.chests.length + (entry.loot.bonus?.kind === 'chest' ? 1 : 0);
    if (chests) {
      this.add2(text(this, CX, 241, `CHEST${chests > 1 ? 'S' : ''} WAITING IN THE CHEST SCREEN`, light({ font: 'small' })).setOrigin(0.5));
    }
    this.add2(new Button(this, CX - 58, 258, {
      width: 96, height: 24, label: 'Done', onClick: () => { sfx.click(); this.showBoard(); },
    }));
    // The same party, destination and duration, in one tap.
    const again = this.add2(new Button(this, CX + 58, 258, {
      width: 104, height: 24, style: 'gold', label: 'Send again',
      onClick: () => {
        if (!X.send(p, slot, entry.dest, entry.party, entry.duration)) {
          sfx.denied();
          return;
        }
        this.lastPlan = { dest: entry.dest, duration: entry.duration };
        saveProgress(p);
        sfx.flip();
        this.showBoard();
      },
    }));
    again.setEnabled(!X.sendProblem(p, slot, entry.dest, entry.party, entry.duration));
  }

  close() {
    sfx.click();
    this.scene.stop();
    this.onClose?.(this.changed);
  }
}

// Destinations in expedition.json's order.
const EXPEDITION_DESTS = () => X.EXPEDITION_DATA.destinations;
