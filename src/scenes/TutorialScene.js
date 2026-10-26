import Phaser from 'phaser';
import {
  AUDIO, TUTORIAL, UI_KIT,
} from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, hudEdges } from '../display.js';
import { TUTORIAL_JSON_KEY, tutorialKey } from '../sprites.js';
import { targetRect } from '../tutorial/targets.js';
import { Button } from '../ui/Button.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.js';
import { dark, light, panel, text } from '../ui/kit.js';

const KEY = 'TutorialScene';
// The battle's bottom button bar's centre line (GameScene, base layout).
const BAR_Y = 251;

// The Captain typing: a blip each time the count of characters shown
// passes a multiple of AUDIO.blipEvery (from was to now).
function blip(was, now) {
  if (Math.floor(now / AUDIO.blipEvery) > Math.floor(was / AUDIO.blipEvery)) sfx.play('captain_blip');
}

// Lays out a line of dialogue into rows no wider than `width` (whole words),
// so typing it out never makes a word jump to the next row.
function wrapRows(measure, str, width) {
  const rows = [];
  let row = '';
  for (const word of str.split(/\s+/).filter(Boolean)) {
    const next = row ? `${row} ${word}` : word;
    if (row && measure(next) > width) {
      rows.push(row);
      row = word;
    } else {
      row = next;
    }
  }
  if (row) rows.push(row);
  return rows.join('\n');
}

// Rectangles ([x, y, w, h]) covering the view except the cutouts: a band
// between each pair of cutout edges, split round the cutouts across it.
function coverAround(view, cutouts) {
  const edges = (lo, hi, list) => [...new Set([lo, hi, ...list])].filter((e) => e >= lo && e <= hi).sort((a, b) => a - b);
  const ys = edges(view.top, view.bottom, cutouts.flatMap((c) => [c.y, c.bottom]));
  const out = [];
  for (let i = 0; i < ys.length - 1; i++) {
    const [y0, y1] = [ys[i], ys[i + 1]];
    const across = cutouts.filter((c) => c.y < y1 && c.bottom > y0).sort((a, b) => a.x - b.x);
    let x = view.left;
    for (const c of across) {
      if (c.x > x) out.push([x, y0, c.x - x, y1 - y0]);
      x = Math.max(x, c.right);
    }
    if (x < view.right) out.push([x, y0, view.right - x, y1 - y0]);
  }
  return out;
}

// The tutorial's driver for TutorialManager (its `view`): runs the scene
// when there's something to show, and hands it what to show (the scene
// may not have been created yet the first time).
export class TutorialView {
  constructor(game, manager) {
    this.game = game;
    this.manager = manager;
    this.step = null;       // the step showing (see TutorialManager.show)
    this.banners = [];      // banner lines waiting
  }

  get scene() {
    const s = this.game.scene.getScene(KEY);
    return s?.ready ? s : null;
  }

  wake() {
    const s = this.game.scene.getScene(KEY);
    if (s.sys.settings.status === Phaser.Scenes.RUNNING) this.scene?.refresh();
    else this.game.scene.run(KEY, { view: this });
  }

  show(step) {
    this.step = step;
    this.wake();
  }

  hide() {
    this.step = null;
    this.scene?.refresh();
  }

  banner(line) {
    this.banners.push(line);
    this.wake();
  }
}

// Over every other scene: the Captain's dialogue box, the spotlight (a dim
// with a hole, corner brackets and a pointer) and banner tips (a strip
// that slides in at the top). Asleep while there's nothing to show.
export class TutorialScene extends Phaser.Scene {
  constructor() {
    super(KEY);
  }

  init({ view }) {
    this.driver = view ?? this.driver;
  }

  create() {
    applyRenderScale(this);
    const data = this.cache.json.get(TUTORIAL_JSON_KEY);
    this.faces = data.captain_portrait.faces;
    this.miniFaces = data.captain_mini.faces;
    this.fingertip = data.pointer.fingertip;

    // The dim: rectangles covering the view but the hole, the box, the
    // banner and Skip (see layout), made again when those move.
    this.dim = [];
    this.dimKey = '';
    // Takes every tap, except in the hole of a guided step (which goes on
    // to the scene underneath).
    this.blocker = this.add.zone(0, 0, 10, 10).setOrigin(0);
    this.blocker.setInteractive(new Phaser.Geom.Rectangle(0, 0, 10, 10), (area, x, y) => this.blocks(x, y));
    this.blocker.on('pointerdown', () => this.onTap());

    this.brackets = [[false, false], [true, false], [false, true], [true, true]]
      .map(([fx, fy]) => this.add.image(0, 0, tutorialKey('bracket')).setOrigin(0).setFlip(fx, fy));
    this.pointer = this.add.sprite(0, 0, tutorialKey('pointer'), 0)
      .setOrigin((this.fingertip[0] + 0.5) / data.pointer.frame[0], (this.fingertip[1] + 0.5) / data.pointer.frame[1]);

    this.createBox();
    this.createBanner();
    const { width, height } = TUTORIAL.skip;
    this.skipButton = new Button(this, 0, 0, {
      width, height, font: 'small', label: 'Skip', onClick: () => this.confirmSkip(),
    });
    // Everything but the dim in one container; the dim's rectangles are
    // drawn after it, round what should stay bright (see drawDim).
    this.add.container(0, 0, [this.box, ...this.brackets, this.pointer, this.bannerBox, this.skipButton]);

    // The step on screen: { step, lines, index, face, full, chars, typing, rect }.
    this.state = null;
    this.clock = 0;
    this.ready = true;
    this.events.on('view-resize', () => this.layout());
    this.events.on('wake', () => this.refresh());
    this.refresh();
  }

  // --- The dialogue box ---

  createBox() {
    const { width: w, height: h } = TUTORIAL.box;
    this.portrait = this.add.sprite(6, 2, tutorialKey('captain_portrait'), 0).setOrigin(0);
    const plate = this.add.image(6, h - 15, tutorialKey('nameplate')).setOrigin(0);
    const name = text(this, 6 + plate.width / 2, h - 15 + plate.height / 2, 'CAPTAIN', light({ font: 'small' })).setOrigin(0.5);
    this.line = text(this, 60, 9, '', dark({ lineSpacing: -2 }));
    this.nextArrow = this.add.sprite(w - 14, h - 10, tutorialKey('next_arrow'), 0).setOrigin(0);
    this.box = this.add.container(0, 0, [panel(this, 0, 0, w, h, 'parchment'), this.portrait, plate, name, this.line, this.nextArrow]);
  }

  // Each line of a step in turn: typed out at TUTORIAL.typeCps.
  startLine(i) {
    const s = this.state;
    s.index = i;
    const { face, text: str } = s.lines[i];
    s.face = face;
    const measure = (t) => {
      this.line.setText(t);
      return this.line.inkWidth;
    };
    s.full = wrapRows(measure, str, TUTORIAL.box.wrap);
    s.chars = 0;
    s.typing = true;
    this.line.setText('');
    this.setFace(face);
  }

  setFace(face) {
    this.portrait.setFrame(Math.max(0, this.faces.indexOf(face)));
  }

  get lastLine() { return !this.state.lines || this.state.index >= this.state.lines.length - 1; }

  onTap() {
    const s = this.state;
    if (!s?.lines) return;
    if (s.typing) {
      s.chars = s.full.length;
      return;
    }
    if (!this.lastLine) {
      sfx.play('ui_click');
      this.startLine(s.index + 1);
      return;
    }
    if (s.step.mode !== 'guided') {
      sfx.play('ui_click');
      s.step.onLinesDone();
    }
  }

  // --- Showing a step ---

  // Show what the driver has: a step (or none), and the next banner.
  refresh() {
    if (!this.ready) return;
    const step = this.driver.step;
    if (step !== this.state?.step) {
      if (step) {
        // A step with no lines keeps the box as it is (the same script's
        // next guided target).
        const keep = !step.lines && this.state?.lines;
        this.state = keep
          ? { ...this.state, step, rectKey: null }
          : { step, lines: step.lines, index: 0, rectKey: null };
        if (!keep && step.lines) this.startLine(0);
      } else {
        this.state = null;
      }
    }
    if (!this.bannerShowing && this.driver.banners.length) this.nextBanner();
    this.scene.bringToTop();
    this.layout();
    if (!this.state && !this.bannerShowing) this.scene.sleep();
  }

  // Where things go: the dim and its hole, the box (bottom, or top if the
  // target is there), the brackets and pointer, the banner, Skip.
  layout() {
    const v = this.view;
    const s = this.state;
    const mode = s?.step.mode;
    const rect = s ? this.holeRect() : null;
    if (s) s.rect = rect;

    this.placeBox(rect);
    this.skipButton.setVisible(!!s?.step.skip)
      .setPosition(v.right - 4 - TUTORIAL.skip.width / 2, v.top + 4 + TUTORIAL.skip.height / 2);
    this.placeBanner();
    this.drawDim(rect);
    this.blocker.setPosition(v.left, v.top).setSize(v.width, v.height);
    this.blocker.input.hitArea.setSize(v.width, v.height);
    if (s) this.blocker.setInteractive();
    else this.blocker.disableInteractive();

    for (const b of this.brackets) b.setVisible(!!rect);
    this.pointer.setVisible(!!rect && mode === 'guided');
  }

  // The dim over the view, round the hole (if there is one), the box, Skip
  // and the banner.
  drawDim(rect) {
    const bounds = (o, w, h) => o.visible && new Phaser.Geom.Rectangle(o.x, o.y, w, h);
    const { width: sw, height: sh } = TUTORIAL.skip;
    const cutouts = [
      rect,
      bounds(this.box, TUTORIAL.box.width, TUTORIAL.box.height),
      bounds(this.skipButton, sw, sh) && new Phaser.Geom.Rectangle(this.skipButton.x - sw / 2, this.skipButton.y - sh / 2, sw, sh),
      bounds(this.bannerBox, this.bannerBg.width, this.bannerBg.height),
    ].filter(Boolean);
    const strips = this.state ? coverAround(this.view, cutouts) : [];
    const key = strips.join('|');
    if (key === this.dimKey) return;
    this.dimKey = key;
    for (const r of this.dim) r.destroy();
    this.dim = strips.map(([x, y, w, h]) => this.add.rectangle(x, y, w, h, 0x000000, TUTORIAL.dim).setOrigin(0));
  }

  // The target's rectangle here (padded), or null.
  holeRect() {
    const key = this.state.step.target;
    if (!key) return null;
    const found = targetRect(this.driver.manager.target(key));
    if (!found) return null;
    const { rect, scene } = found;
    const pad = TUTORIAL.pad;
    // Every scene's view is 480 wide on the same scale; only its top differs.
    const dy = this.view.top - scene.view.top;
    const r = new Phaser.Geom.Rectangle(Math.floor(rect.x) - pad, Math.floor(rect.y + dy) - pad,
      Math.ceil(rect.width) + 2 * pad, Math.ceil(rect.height) + 2 * pad);
    return Phaser.Geom.Rectangle.Intersection(r, new Phaser.Geom.Rectangle(this.view.left, this.view.top, this.view.width, this.view.height));
  }

  // The box sits just above the battle's button bar, or at the top of the
  // view if that would cover the target (and its pointer); hidden for a
  // step with no lines at all.
  placeBox(rect) {
    const s = this.state;
    this.box.setVisible(!!s?.lines);
    if (!s?.lines) return;
    const v = this.view;
    const { width: w, height: h, barGap, margin } = TUTORIAL.box;
    const barTop = hudEdges(v).bottom + BAR_Y - UI_KIT.bottomButtonHeight / 2;
    const bottom = barTop - barGap - h;
    const ys = [bottom, bottom - TUTORIAL.box.lift, v.top + margin, Math.round(v.centerY - h / 2)];
    const xs = [Math.round(v.centerX - w / 2), v.left + margin, v.right - margin - w];
    // The target and, for a guided step, its pointer above or below it.
    const pointer = s.step.mode === 'guided' ? this.pointer.height + TUTORIAL.pointerBob : 0;
    const keepClear = rect && new Phaser.Geom.Rectangle(rect.x, rect.y - pointer, rect.width, rect.height + 2 * pointer);
    const overlap = (x, y) => {
      if (!keepClear) return 0;
      const o = Phaser.Geom.Rectangle.Intersection(new Phaser.Geom.Rectangle(x, y, w, h), keepClear);
      return o.width * o.height;
    };
    // The first spot clear of it (or the one that covers least).
    let best = null;
    for (const y of ys) {
      for (const x of xs) {
        const o = overlap(x, y);
        if (!best || o < best.o) best = { x, y, o };
        if (o === 0) break;
      }
      if (best.o === 0) break;
    }
    this.box.setPosition(best.x, best.y);
  }

  // --- Banner tips ---

  createBanner() {
    this.bannerBg = panel(this, 0, 0, 100, TUTORIAL.banner.height, 'parchment');
    this.mini = this.add.sprite(4, 2, tutorialKey('captain_mini'), 0).setOrigin(0);
    this.bannerText = text(this, 32, 8, '', dark({ lineSpacing: -2 }));
    this.bannerBox = this.add.container(0, 0, [this.bannerBg, this.mini, this.bannerText]).setVisible(false);
    this.bannerBg.setInteractive({ useHandCursor: true });
    this.bannerBg.on('pointerdown', () => this.dismissBanner(true));
  }

  nextBanner() {
    const line = this.driver.banners.shift();
    const { height: minHeight, maxWidth, slideMs } = TUTORIAL.banner;
    const measure = (t) => this.bannerText.setText(t).inkWidth;
    // Wrapped to two rows if it's long; the strip fits it.
    const full = wrapRows(measure, line.text, maxWidth - 40);
    const width = Math.max(...full.split('\n').map(measure)) + 40;
    const inkHeight = this.bannerText.setText(full).inkHeight;
    const height = Math.max(minHeight, inkHeight + 12);
    this.bannerText.setText('').setOrigin(0, 0).setPosition(32, Math.round((height - inkHeight) / 2));
    this.mini.setY(Math.round((height - this.mini.height) / 2));
    this.bannerBg.setSize(width, height);
    this.bannerBg.input.hitArea.setSize(width, height);
    this.bannerLine = { ...line, text: full, chars: 0, typing: true, held: 0 };
    this.bannerShowing = true;
    this.bannerSlide = 0;   // 0 (above the view) .. 1 (in place)
    this.bannerOut = false;
    this.bannerBox.setVisible(true);
    this.tweens.addCounter({
      from: 0, to: 1, duration: slideMs, onUpdate: (tw) => { this.bannerSlide = tw.getValue(); this.placeBanner(); },
    });
    this.mini.setFrame(this.miniFace(line.face));
    sfx.play('tip');
  }

  miniFace(face) {
    return Math.max(0, this.miniFaces.indexOf(face === 'worried' ? 'worried' : 'talk0'));
  }

  placeBanner() {
    if (!this.bannerShowing) return;
    const v = this.view;
    const { y } = TUTORIAL.banner;
    const w = this.bannerBg.width;
    const height = this.bannerBg.height;
    const top = v.top - height - 2;
    this.bannerBox.setPosition(Math.round(v.centerX - w / 2), Math.round(top + (v.top + y - top) * this.bannerSlide));
    if (this.state) this.drawDim(this.state.rect);
  }

  // tapped: by the player (a line with onTap acts on it: the update banner).
  dismissBanner(tapped = false) {
    if (!this.bannerShowing || this.bannerOut) return;
    this.bannerOut = true;
    if (tapped) this.bannerLine?.onTap?.();
    this.tweens.addCounter({
      from: this.bannerSlide,
      to: 0,
      duration: TUTORIAL.banner.slideMs,
      onUpdate: (tw) => { this.bannerSlide = tw.getValue(); this.placeBanner(); },
      onComplete: () => {
        this.bannerShowing = false;
        this.bannerBox.setVisible(false);
        this.refresh();
      },
    });
  }

  // --- Skip ---

  confirmSkip() {
    if (this.confirming) return;
    this.confirming = new ConfirmDialog(this, {
      title: 'Skip the tutorial?',
      message: 'The Captain will still give tips.',
      confirmLabel: 'Skip',
      onConfirm: () => this.driver.manager.skipOnboarding(),
    });
    this.confirming.setDepth(50).once('destroy', () => { this.confirming = null; });
  }

  // --- Every frame ---

  // Taps the blocker takes: all of them, except a guided step's hole.
  blocks(x, y) {
    const s = this.state;
    if (!s) return false;
    if (s.step.mode !== 'guided' || !s.rect) return true;
    return !Phaser.Geom.Rectangle.Contains(s.rect, x + this.view.left, y + this.view.top);
  }

  update(_time, delta) {
    this.clock += delta;
    const talking = Math.floor(this.clock * TUTORIAL.talkFps / 1000) % 2 === 1;
    const s = this.state;
    if (s?.lines && s.full != null) {
      if (s.typing) {
        const was = Math.floor(s.chars);
        s.chars = Math.min(s.full.length, s.chars + delta * TUTORIAL.typeCps / 1000);
        blip(was, Math.floor(s.chars));
        this.line.setText(s.full.slice(0, Math.floor(s.chars)));
        if (s.chars >= s.full.length) s.typing = false;
      }
      const talks = s.typing && (s.face === 'talk0' || s.face === 'point');
      this.setFace(talks && talking ? 'talk1' : s.face);
      const more = !s.typing && !(this.lastLine && s.step.mode === 'guided');
      this.nextArrow.setVisible(more).setFrame(Math.floor(this.clock * TUTORIAL.box.arrowFps / 1000) % 2);
    }
    // The spotlight follows its target (a merchant ship sails on).
    if (s?.step.target) this.layout();
    if (s && s.rect) this.placeSpot(s.rect);
    this.updateBanner(delta, talking);
  }

  placeSpot(rect) {
    const pulse = Math.floor(this.clock / TUTORIAL.bracketPulseMs) % 2;
    const [tl, tr, bl, br] = this.brackets;
    const bw = tl.width;
    tl.setPosition(rect.x - pulse, rect.y - pulse);
    tr.setPosition(rect.right - bw + pulse, rect.y - pulse);
    bl.setPosition(rect.x - pulse, rect.bottom - bw + pulse);
    br.setPosition(rect.right - bw + pulse, rect.bottom - bw + pulse);
    // The pointer above the target, fingertip on its edge; below it,
    // pointing up, if there's no room above.
    const bob = Math.round(TUTORIAL.pointerBob * (0.5 - 0.5 * Math.cos(this.clock / 1000 * Math.PI * 2 * TUTORIAL.pointerFps / 2)));
    const above = rect.y - this.pointer.height - 2 >= this.view.top;
    const cx = Math.round(rect.centerX);
    this.pointer.setFrame(Math.floor(this.clock * TUTORIAL.pointerFps / 1000) % 2)
      .setAngle(above ? 0 : 180)
      .setPosition(cx, above ? rect.y - bob : rect.bottom + bob);
  }

  updateBanner(delta, talking) {
    const b = this.bannerLine;
    if (!this.bannerShowing || !b) return;
    if (b.typing) {
      const was = Math.floor(b.chars);
      b.chars = Math.min(b.text.length, b.chars + delta * TUTORIAL.typeCps / 1000);
      blip(was, Math.floor(b.chars));
      this.bannerText.setText(b.text.slice(0, Math.floor(b.chars)));
      if (b.chars >= b.text.length) b.typing = false;
      this.mini.setFrame(b.face !== 'worried' && talking ? this.miniFaces.indexOf('talk1') : this.miniFace(b.face));
      return;
    }
    this.mini.setFrame(this.miniFace(b.face));
    b.held += delta;
    // A sticky line stays until it's tapped.
    if (!b.sticky && b.held >= TUTORIAL.banner.holdMs) this.dismissBanner();
  }
}
