import Phaser from 'phaser';
import { DISPLAY, ENEMIES, HEROES, ISLANDS, UI_KIT, WANTED } from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { applyRenderScale, fillView } from '../display.js';
import { enemyDebut, waveScaling } from '../systems/WaveManager.js';
import { Button } from '../ui/Button.js';
import { fmtNumber } from '../ui/format.js';
import {
  Bar, dark, face, hexColor, icon, light, panel, subText, text, UI, wantedKey,
} from '../ui/kit.js';
import { createPoster, enemyPortrait, traitIconKey, traitsOf, wantedLayout } from '../ui/wanted.js';

// The Wanted Board (enemy book): a poster for every enemy type on the left,
// in the order they're met on the voyage, a page of them at a time (arrows by
// the title turn it), and the selected one's page on the right (portrait,
// traits, stats at the current wave, description, crew it's weak to,
// bounty). Posters of types not met yet are blank and can't be opened;
// opening one marks it seen. Launched with { progress, onClose }.

// Where a type comes in the voyage, for sorting: island, then wave.
const debutOrder = (id) => {
  const debut = enemyDebut(id);
  return debut ? debut.island * 1000 + debut.wave : Infinity;
};

// The page's "first wave" stat: [label, value]. Skull Cove's types give the
// wave; later islands' name the island in the label.
function firstWave(id) {
  const debut = enemyDebut(id);
  if (!debut) return ['FIRST WAVE', '-'];
  const label = debut.island === 0 ? 'FIRST WAVE' : `${ISLANDS[debut.island].name.toUpperCase()} WAVE`;
  return [label, `${debut.wave}`];
}
export class WantedScene extends Phaser.Scene {
  constructor() {
    super('WantedScene');
  }

  init({ progress, onClose }) {
    this.progress = progress;
    this.onClose = onClose;
    this.selected = null;
    this.posterPage = 0;   // which page of posters shows
  }

  create() {
    applyRenderScale(this);
    const p = this.progress;
    this.ids = Object.keys(ENEMIES).filter((id) => !ENEMIES[id].minion)
      .sort((a, b) => debutOrder(a) - debutOrder(b));
    this.perPage = WANTED.columns * WANTED.rows;
    this.pages = Math.ceil(this.ids.length / this.perPage);
    const cx = DISPLAY.width / 2;

    fillView(this, 0x0d1117, 0.9);
    panel(this, cx - 70, 4, 140, 20, 'wood');
    text(this, cx, 14, 'WANTED BOARD', light()).setOrigin(0.5);
    const found = this.ids.filter((id) => p.isDiscovered(id)).length;
    text(this, cx + (this.pages > 1 ? 96 : 76), 14, `${found}/${this.ids.length} FOUND`, { font: 'small', ...light() }).setOrigin(0, 0.5);
    if (this.pages > 1) {
      const arrow = (x, step, angle) => {
        const b = new Button(this, x, 14, {
          width: 18, height: 18, icon: 'arrow_up', onClick: () => this.turnPage(step),
        });
        b.icon.setAngle(angle);
        return b;
      };
      this.prevButton = arrow(cx - 82, -1, -90);
      this.nextButton = arrow(cx + 82, 1, 90);
    }
    text(this, 8, 14, 'CLICK A POSTER', { font: 'small', ...light() }).setOrigin(0, 0.5);
    new Button(this, DISPLAY.width - 30, 14, {
      width: 48, height: 20, label: 'Back', onClick: () => this.close(),
    });

    this.posters = this.add.container(0, 0);
    this.drawPosters();
    this.drawLegend();
    this.page = this.add.container(0, 0);
    this.drawPage();
  }

  posterPos(i) {
    const L = wantedLayout(this);
    const col = i % WANTED.columns;
    const row = Math.floor(i / WANTED.columns);
    return { x: WANTED.gridX + col * (L.width + WANTED.gap), y: WANTED.gridY + row * (L.height + WANTED.gap) };
  }

  turnPage(step) {
    const page = Phaser.Math.Clamp(this.posterPage + step, 0, this.pages - 1);
    if (page === this.posterPage) return;
    sfx.click();
    this.posterPage = page;
    this.drawPosters();
  }

  // This page's posters; met ones open their page, the selected one is framed.
  drawPosters() {
    const p = this.progress;
    const L = wantedLayout(this);
    this.posters.removeAll(true);
    this.ids.slice(this.posterPage * this.perPage, (this.posterPage + 1) * this.perPage).forEach((id, i) => {
      const { x, y } = this.posterPos(i);
      this.posters.add(createPoster(this, x, y, id, p, { unseen: p.isDiscovered(id) && !p.isPosterSeen(id) }));
      if (id === this.selected) {
        this.posters.add(this.add.image(x + L.selectX, y + L.selectY, wantedKey('poster_select')).setOrigin(0));
      }
      if (p.isDiscovered(id)) {
        const zone = this.add.zone(x, y, L.width, L.height).setOrigin(0).setInteractive({ useHandCursor: true });
        zone.on('pointerdown', () => this.select(id));
        this.posters.add(zone);
      }
    });
    this.prevButton?.setEnabled(this.posterPage > 0);
    this.nextButton?.setEnabled(this.posterPage < this.pages - 1);
  }

  // Under the posters: what the bounties pay.
  drawLegend() {
    const rows = Math.min(WANTED.rows, Math.ceil(this.ids.length / WANTED.columns));
    const L = wantedLayout(this);
    const top = WANTED.gridY + rows * (L.height + WANTED.gap) + 4;
    const width = WANTED.columns * (L.width + WANTED.gap) - WANTED.gap;
    const left = WANTED.gridX;
    panel(this, left, top, width, 44, 'wood');
    text(this, left + 8, top + 7, 'BOUNTIES: DEFEAT ONE KIND', light({ font: 'small' }));
    WANTED.bounties.forEach((b, i) => {
      const x = left + 8 + i * Math.floor((width - 16) / 3);
      this.add.image(x, top + 20, wantedKey(`stamp_${b.tier}`)).setOrigin(0);
      text(this, x + 17, top + 21, `x${b.defeats}`, light({ font: 'small' }));
      icon(this, x + 23, top + 34, 'pearl');
      text(this, x + 31, top + 31, `+${b.pearls}`, light({ font: 'small' }));
    });
  }

  select(id) {
    sfx.click();
    this.selected = id;
    this.progress.markPosterSeen(id);
    this.drawPosters();
    this.drawPage();
  }

  // The parchment page: a hint until a poster is picked.
  drawPage() {
    const { x: left, y: top, width: w, height: h } = WANTED.page;
    const p = this.progress;
    this.page.removeAll(true);
    this.page.add(panel(this, left, top, w, h, 'parchment'));
    const id = this.selected;
    if (!id) {
      const hint = this.ids.some((e) => p.isDiscovered(e))
        ? 'PICK A POSTER TO READ ITS BOUNTY' : 'NO ENEMIES SIGHTED YET. SET SAIL!';
      this.page.add(text(this, left + w / 2, top + h / 2, hint, subText({ align: 'center', wrap: w - 40 })).setOrigin(0.5));
      return;
    }
    const def = ENEMIES[id];
    const add = (...objs) => this.page.add(objs);
    const divider = (y) => add(this.add.rectangle(left + 8, y, w - 16, 1, hexColor(UI_KIT.dividerColor)).setOrigin(0));

    // Name on a wood plate over the top edge.
    const plateW = 160;
    add(panel(this, left + (w - plateW) / 2, top - 8, plateW, 20, 'wood'),
      text(this, left + w / 2, top + 2, def.name, light()).setOrigin(0.5));

    // Portrait at 2x on a darker card.
    const scale = WANTED.portraitScale;
    const size = 32 * scale;
    const px = left + 10;
    const py = top + 18;
    add(this.add.rectangle(px - 2, py - 2, size + 4, size + 4, hexColor(UI_KIT.dividerColor)).setOrigin(0),
      enemyPortrait(this, px, py, id, scale));

    // Trait chips, wrapping to the page width.
    const right = px + size + 10;
    let chipX = right;
    let chipY = py;
    for (const trait of traitsOf(def)) {
      const label = text(this, 0, 0, trait.label, subText());
      const cw = 10 + 3 + label.inkWidth + 6;
      if (chipX + cw > left + w - 8) {
        chipX = right;
        chipY += 14;
      }
      add(this.add.rectangle(chipX, chipY, cw, 12, hexColor(UI_KIT.dividerColor)).setOrigin(0),
        this.add.image(chipX + 2, chipY + 1, traitIconKey(trait)).setOrigin(0),
        label.setPosition(chipX + 14, chipY + 3));
      chipX += cw + 3;
    }

    // Stats at the current wave (on this island, which may start harder).
    const scaling = waveScaling(p.scalingWave);
    const statsY = traitsOf(def).length ? chipY + 18 : py;
    const dash = (n) => (n > 0 ? fmtNumber(Math.round(n)) : '-');
    const stats = [
      ['HP', fmtNumber(Math.round(def.hp * scaling.hp))],
      ['SPEED', dash(def.speed)],
      ['DAMAGE', def.hullShare ? `${Math.round(def.hullShare.normal * 100)}% HULL` : dash(def.damage * scaling.damage)],
      firstWave(id),
    ];
    add(text(this, right, statsY, `AT WAVE ${p.wave}`, subText()));
    stats.forEach(([label, value], i) => {
      const sx = right + (i % 2) * 70;
      const sy = statsY + 10 + Math.floor(i / 2) * 18;
      add(text(this, sx, sy, label, subText()), text(this, sx, sy + 7, value, dark()));
    });

    // Description.
    const descY = Math.max(py + size, statsY + 46) + 6;
    const description = text(this, left + 10, descY, def.description.toUpperCase(), subText({ wrap: w - 20 }));
    add(description);
    const descBottom = descY + description.inkHeight;
    divider(descBottom + 5);

    // Weak to: crew faces with their short names.
    const weakY = descBottom + 10;
    add(text(this, left + 10, weakY, 'WEAK TO', subText()));
    (def.weakTo ?? []).forEach((hero, i) => {
      const fx = left + 58 + i * 60;
      add(face(this, fx, weakY + 4, hero), text(this, fx + 11, weakY + 1, HEROES[hero].shortName.toUpperCase(), subText()));
    });
    divider(weakY + 16);

    // Bounty: the three stamps (dim until paid) and progress to the next.
    const bountyY = weakY + 22;
    const count = p.defeatCount(id);
    const tier = p.bountyTier(id);
    add(text(this, left + 10, bountyY, 'BOUNTY', dark()),
      text(this, left + w - 10, bountyY + 3, `${fmtNumber(count)} DEFEATED`, subText()).setOrigin(1, 0));
    WANTED.bounties.forEach((b, i) => {
      const bx = left + 10 + i * 78;
      const by = bountyY + 16;
      add(this.add.image(bx, by, wantedKey(`stamp_${b.tier}`)).setOrigin(0).setAlpha(i < tier ? 1 : 0.3),
        text(this, bx + 17, by + 1, `x${b.defeats}`, subText()),
        icon(this, bx + 23, by + 14, 'pearl').setAlpha(i < tier ? 1 : 0.5),
        text(this, bx + 31, by + 11, i < tier ? 'PAID' : `+${b.pearls}`, subText()));
    });
    const next = WANTED.bounties[tier];
    const barY = bountyY + 40;
    const bar = new Bar(this, left + 10, barY, w - 20, 10, UI.colors.progress);
    if (next) bar.setValue(count / next.defeats, `${fmtNumber(count)} / ${next.defeats} FOR ${next.tier.toUpperCase()}`);
    else bar.setValue(1, 'EVERY BOUNTY PAID');
    add(bar);
  }

  close() {
    sfx.click();
    this.scene.stop();
    this.onClose?.();
  }
}
