import { BATTLE_LOG, DISPLAY, ENEMIES, HEROES, WANTED } from '../config.js';
import { fmtNumber } from './format.js';
import {
  face, light, panel, text, UI, wantedKey,
} from './kit.js';
import { createPoster, wantedLayout } from './wanted.js';

// Battle notices that never pause the game: the "NEW ENEMY!" alert (top
// centre, one at a time, queued) when a type is met for the first time,
// bounty toasts (top-left, stacked) when a bounty is paid, and the MVP
// plaque (under the wave banner) after each wave. Timed on real time
// (update(delta) with the frame's unscaled delta), so they last as long at
// x2 speed. None of them take clicks.
export class Notices {
  constructor(scene, progress) {
    this.scene = scene;
    this.progress = progress;
    this.alerts = [];    // enemy ids waiting for their alert
    this.alert = null;   // { box, time }
    this.toasts = [];    // [{ box, time }], oldest first
    this.mvpNote = null; // { box, time }
    this.anchor = { centerX: 0, top: 0, left: 0 };
  }

  // Follow the view: the alert stays top-centre, toasts top-left.
  layout(view) {
    this.anchor = { centerX: Math.round(view.centerX), top: view.top, left: view.left };
    this.place();
  }

  place() {
    const { centerX, top, left } = this.anchor;
    if (this.alert) this.alert.box.setPosition(centerX - Math.round(WANTED.alert.width / 2), top + WANTED.alert.y);
    if (this.mvpNote) {
      const { box } = this.mvpNote;
      box.setPosition(centerX - DISPLAY.width / 2 + BATTLE_LOG.mvp.x - Math.round(box.plaqueWidth / 2), top + BATTLE_LOG.mvp.y);
    }
    let y = top + WANTED.toast.y;
    for (const t of this.toasts) {
      t.box.setPosition(left + WANTED.toast.x, y);
      y += t.height + WANTED.toast.gap;
    }
  }

  // The first sighting of an enemy type.
  newEnemy(id) {
    this.alerts.push(id);
    if (!this.alert) this.nextAlert();
  }

  // A wood plaque: the enemy's poster, "NEW ENEMY!", its name and description.
  nextAlert() {
    const id = this.alerts.shift();
    if (!id) return;
    const { scene } = this;
    const def = ENEMIES[id];
    const { width: w, height: minHeight } = WANTED.alert;
    const L = wantedLayout(scene);
    const tx = 8 + L.width + 8;
    const description = text(scene, tx, 38, def.description.toUpperCase(),
      light({ font: 'small', wrap: w - tx - 8, lineSpacing: -2 }));
    // As tall as the description needs.
    const h = Math.max(minHeight, 38 + description.inkHeight + 8);
    const box = scene.add.container(0, 0, [
      panel(scene, 0, 0, w, h, 'wood'),
      createPoster(scene, 8, Math.round((h - L.height) / 2), id, this.progress),
      text(scene, tx, 8, 'NEW ENEMY!', light({ color: UI.colors.warn })),
      text(scene, tx, 22, def.name, light()),
      description,
    ]).setDepth(15).setAlpha(0);
    this.alert = { box, time: 0 };
    this.place();
  }

  // A bounty paid: its stamp, the type and tier, and the Pearls.
  bounty(id, { tier, defeats, pearls }) {
    const { scene } = this;
    const line1 = text(scene, 22, 4, `${ENEMIES[id].name.toUpperCase()} x${defeats}`, light({ font: 'small' }));
    const line2 = text(scene, 22, 13, `BOUNTY +${pearls} PEARLS`, light({ font: 'small' }));
    const width = Math.max(line1.inkWidth, line2.inkWidth) + 30;
    const height = 24;
    const box = scene.add.container(0, 0, [
      panel(scene, 0, 0, width, height, 'wood'),
      scene.add.image(5, 5, wantedKey(`stamp_${tier}`)).setOrigin(0),
      line1, line2,
    ]).setDepth(15).setAlpha(0);
    this.toasts.push({ box, time: 0, height });
    this.place();
  }

  // The wave's MVP: a wood plaque with their face, "MVP: <name> - <damage>
  // dmg". Replaces one still showing.
  mvp(heroId, damage) {
    const { scene } = this;
    this.mvpNote?.box.destroy();
    const label = text(scene, 26, 6, `MVP: ${HEROES[heroId].name} - ${fmtNumber(damage)} dmg`, light());
    const width = 26 + label.inkWidth + 8;
    const box = scene.add.container(0, 0, [
      panel(scene, 0, 0, width, 22, 'wood'),
      face(scene, 15, 11, heroId),
      label.setOrigin(0, 0.5).setPosition(26, 11),
    ]).setDepth(15).setAlpha(0);
    box.plaqueWidth = width;
    this.mvpNote = { box, time: 0 };
    this.place();
  }

  update(delta) {
    const fade = (n, ms, fadeMs) => Math.min(1, n.time / fadeMs, (ms - n.time) / fadeMs);
    if (this.mvpNote) {
      const m = this.mvpNote;
      m.time += delta;
      m.box.setAlpha(Math.max(0, fade(m, BATTLE_LOG.mvp.ms, BATTLE_LOG.mvp.fadeMs)));
      if (m.time >= BATTLE_LOG.mvp.ms) {
        m.box.destroy();
        this.mvpNote = null;
      }
    }
    if (this.alert) {
      const a = this.alert;
      a.time += delta;
      a.box.setAlpha(Math.max(0, fade(a, WANTED.alert.ms, WANTED.alert.fadeMs)));
      if (a.time >= WANTED.alert.ms) {
        a.box.destroy();
        this.alert = null;
        this.nextAlert();
      }
    }
    const before = this.toasts.length;
    for (const t of this.toasts) {
      t.time += delta;
      t.box.setAlpha(Math.max(0, fade(t, WANTED.toast.ms, WANTED.toast.fadeMs)));
      if (t.time >= WANTED.toast.ms) t.box.destroy();
    }
    this.toasts = this.toasts.filter((t) => t.time < WANTED.toast.ms);
    if (this.toasts.length !== before) this.place();
  }
}
