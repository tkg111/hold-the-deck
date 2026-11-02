import Phaser from 'phaser';
import {
  DISPLAY, HEROES, PACKS, RARITY, UI_KIT,
} from '../config.js';
import { sfx } from '../audio/Sfx.js';
import { fillView } from '../display.js';
import { traitOf } from '../systems/Expeditions.js';
import { awakening } from '../systems/Uncharted.js';
import { unchartedKey } from '../sprites.js';
import { onBack } from './back.js';
import { Button } from './Button.js';
import { cssColor, formatNum } from './format.js';
import { heroPortrait } from './HeroCard.js';
import { abilityTitle, describeAbility } from './crewText.js';
import {
  dark, glyph, glyphWidth, light, panel, starRow, subText, text, traitIcon, UI,
} from './kit.js';

const Q = UI_KIT.quickUpgrade;
const PLATE_W = 150;
const AMOUNTS = [['1', 'x1'], ['10', 'x10'], ['max', 'MAX']];

// What a crewmate on the ship is like now and one tap to make them
// stronger (tapping them on the ship between waves): their portrait at 2x
// (the awakened art once awakened), name and title, level, stars and trait,
// damage now -> after one more level, their ability and its cooldown, and
// x1 / x10 / MAX buy buttons with their costs, which level them up right
// here (Progress.heroBuyPlan / buyHeroLevels, like the Shipwright's). The
// Awaken button shows once the Uncharted Seas are open (gold when they can
// be); Swap opens the crew grid for their slot. Modal like ConfirmDialog;
// Android's back button closes it. Callbacks: onBuy() after levels are
// bought, onAwaken(id), onSwap().
export class QuickUpgrade extends Phaser.GameObjects.Container {
  constructor(scene, progress, id, { onBuy, onAwaken, onSwap }) {
    super(scene, 0, 0);
    this.progress = progress;
    this.id = id;
    this.onBuy = onBuy;
    const backdrop = fillView(scene, 0x000000, 0.65).setDepth(50);
    backdrop.on('pointerdown', () => this.destroy());
    this.setDepth(50);
    const center = (view) => this.setPosition(
      Math.round(view.centerX - DISPLAY.width / 2), Math.round(view.centerY - DISPLAY.height / 2),
    );
    center(scene.view);
    scene.events.on('view-resize', center);
    scene.modalOpen = (scene.modalOpen ?? 0) + 1;
    const offBack = onBack(() => this.destroy());
    this.once('destroy', () => {
      offBack();
      scene.modalOpen--;
      scene.events.off('view-resize', center);
      backdrop.destroy();
    });

    const p = progress;
    const def = HEROES[id];
    const awake = p.isAwakened(id);
    const cx = DISPLAY.width / 2;
    this.top = Math.round(DISPLAY.height / 2 - Q.height / 2);
    this.left = cx - Q.width / 2;
    const { top, left } = this;
    const add = (...objs) => this.add(objs);
    add(
      panel(scene, left, top, Q.width, Q.height, 'parchment'),
      panel(scene, cx - PLATE_W / 2, top - 8, PLATE_W, 20, 'wood'),
      text(scene, cx, top + 2, (awake ? awakening(id).title : def.name).toUpperCase(), light()).setOrigin(0.5),
      new Button(scene, left + Q.width - 4, top - 4, {
        width: 16, height: 16, label: 'X', font: 'small', onClick: () => { sfx.play('ui_back'); this.destroy(); },
      }),
    );
    // Portrait at 2x, trait in its corner.
    add(heroPortrait(scene, id, top + 82, 2, false, awake).setX(left + 38));
    add(traitIcon(scene, left + 12, top + 20, traitOf(id)));
    const tx = left + 76;
    add(text(scene, tx, top + 13, awake ? def.name.toUpperCase() : RARITY[def.rarity].label.toUpperCase(),
      subText({ color: awake ? UI.colors.textOnParchment : cssColor(RARITY[def.rarity].color) })));
    const trait = traitOf(id);
    if (trait) add(text(scene, left + Q.width - 10, top + 13, trait.toUpperCase(), subText()).setOrigin(1, 0));
    // Level and stars (and Bonus Levels), filled in by refresh.
    this.levelText = text(scene, tx, top + 23, '', dark());
    add(this.levelText);
    const bonus = p.heroBonusLevels(id);
    add(starRow(scene, left + Q.width - 26, top + 30, p.heroStarCount(id), PACKS.maxStars));
    if (bonus) add(text(scene, left + Q.width - 8, top + 27, `+${bonus}`, subText({ color: UI_KIT.starColor })).setOrigin(1, 0));
    // Damage now -> next level.
    this.statFrom = text(scene, tx, top + 40, '', subText({ color: UI.colors.textOnParchment }));
    this.statArrow = glyph(scene, 0, top + 42, 'arrow', UI.colors.subText);
    this.statTo = text(scene, 0, top + 40, '', subText({ color: UI_KIT.affordColor }));
    add(this.statFrom, this.statArrow, this.statTo);
    // Ability and cooldown.
    add(text(scene, tx, top + 52, abilityTitle(id), subText({ color: UI.colors.textOnParchment })));
    add(text(scene, tx, top + 61, describeAbility(id, p.abilityScale(id)).toUpperCase(), subText({ wrap: Q.width - 86 })));

    // x1 / x10 / MAX.
    const by = top + Q.height - 34;
    this.buttons = AMOUNTS.map(([amount, label], i) => {
      const b = new Button(scene, left + 12 + Q.buyWidth / 2 + i * (Q.buyWidth + 6), by, {
        width: Q.buyWidth, height: Q.buyHeight, style: 'gold', icon: 'gold', font: 'small', label: '', onClick: () => this.buy(amount),
      });
      b.amount = amount;
      b.prefix = label;
      add(b);
      return b;
    });
    // Awaken (once the seas are open) and Swap.
    const sy = top + Q.height - 12;
    if (p.unchartedUnlocked && !awake) {
      this.awaken = new Button(scene, left + 12 + 40, sy, {
        width: 80, height: 16, font: 'small', icon: unchartedKey('icon_heart'), label: 'AWAKEN',
        onClick: () => { this.destroy(); onAwaken(id); },
      });
      add(this.awaken);
    }
    add(new Button(scene, left + Q.width - 12 - 30, sy, {
      width: 60, height: 16, font: 'small', label: 'SWAP', onClick: () => { this.destroy(); onSwap(); },
    }));
    this.refresh();
    scene.add.existing(this);
  }

  // Each button's plan at the gold held now.
  plan(amount) {
    return this.progress.heroBuyPlan(this.id, amount);
  }

  refresh() {
    const p = this.progress;
    const { id } = this;
    const def = HEROES[id];
    const lv = p.heroLevel(id);
    this.levelText.setText(`LV ${formatNum(lv)}`);
    const [label, now, next] = def.aura
      ? ['BUFF', `+${Math.round(p.heroAuraBonus(id) * 100)}%`, `+${Math.round(p.heroAuraBonus(id, lv + 1) * 100)}%`]
      : ['DMG', formatNum(p.heroDamage(id)), formatNum(p.heroDamage(id, lv + 1))];
    this.statFrom.setText(`${label} ${now}`);
    const ax = this.statFrom.x + this.statFrom.inkWidth + 3;
    this.statArrow.setX(ax);
    this.statTo.setText(next).setX(ax + glyphWidth('arrow') + 3);
    for (const b of this.buttons) {
      const plan = this.plan(b.amount);
      b.setLabel(`${b.prefix} ${formatNum(plan.cost)}`)
        .setLabelColor(plan.affordable ? null : UI.colors.warn).setEnabled(plan.affordable);
    }
    if (this.awaken) this.awaken.setStyle(p.canAwaken(id) ? 'gold' : 'wood');
  }

  // Buy a button's levels.
  buy(amount) {
    if (!this.progress.buyHeroLevels(this.id, amount)) return;
    sfx.play('buy');
    this.refresh();
    this.onBuy();
    this.scene.events.emit('upgrade-bought', { kind: 'crew' });
  }
}
