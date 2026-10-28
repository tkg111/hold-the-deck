import Phaser from 'phaser';
import {
  AWAKEN, DISPLAY, HEROES, SPRITES,
} from '../config.js';
import { fillView } from '../display.js';
import { awakenCost, awakening } from '../systems/Uncharted.js';
import { awakenedKey } from '../sprites.js';
import { onBack } from './back.js';
import { Button } from './Button.js';
import { formatNum } from './format.js';
import {
  dark, light, panel, subText, text, UI,
} from './kit.js';
import { itemIcon } from './uncharted.js';

const WIDTH = 236;
const HEIGHT = 126;
const PLATE_W = 170;

// Crew Awakening for one crewmate (from the Shipwright's Crew tab): a
// parchment like ConfirmDialog's with the awakened card art at 2x, the
// awakened title and upgrade, what it needs (the level, each Sea Glass and
// the Hearts: held / needed, red where short) and Awaken. Awaken calls
// onAwaken (the caller awakens and plays the moment). Android's back button
// cancels it.
export class AwakenDialog extends Phaser.GameObjects.Container {
  constructor(scene, progress, id, { onAwaken }) {
    super(scene, 0, 0);
    const backdrop = fillView(scene, 0x000000, 0.65).setDepth(50);
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

    const def = HEROES[id];
    const awake = awakening(id);
    const cx = DISPLAY.width / 2;
    const top = Math.round(DISPLAY.height / 2 - HEIGHT / 2);
    const left = cx - WIDTH / 2;
    const block = progress.awakenBlock(id);
    const add = (...objs) => this.add(objs);
    add(
      panel(scene, left, top, WIDTH, HEIGHT, 'parchment'),
      panel(scene, cx - PLATE_W / 2, top - 8, PLATE_W, 20, 'wood'),
      text(scene, cx, top + 2, `AWAKEN ${def.shortName.toUpperCase()}`, light()).setOrigin(0.5),
    );
    // The awakened look at 2x.
    const key = awakenedKey(SPRITES.heroes[id].key);
    if (scene.textures.exists(key)) add(scene.add.image(left + 40, top + 50, key).setScale(2));
    add(text(scene, left + 76, top + 16, awake.title, dark({ color: UI.colors.textOnParchment })));
    add(text(scene, left + 76, top + 30, `+${Math.round((AWAKEN.damage - 1) * 100)}% DAMAGE`, subText()));
    add(text(scene, left + 76, top + 40, awake.text.toUpperCase(), subText({ wrap: WIDTH - 86 })));

    // What it needs.
    const ny = top + 80;
    const short = UI.colors.warn;
    const lv = progress.heroLevel(id);
    add(text(scene, left + 12, ny, `LV ${formatNum(lv)}/${AWAKEN.level}`, subText({ color: lv >= AWAKEN.level ? UI.colors.textOnParchment : short })));
    Object.entries(awakenCost(id)).forEach(([item, n], i) => {
      const x = left + 76 + i * 50;
      const have = progress.itemCount(item);
      add(itemIcon(scene, x + 6, ny + 3, item), text(scene, x + 14, ny, `${have}/${n}`, subText({ color: have >= n ? UI.colors.textOnParchment : short })));
    });

    add(
      new Button(scene, cx - 56, top + HEIGHT - 16, { width: 96, height: 20, label: 'Cancel', onClick: () => this.destroy() }),
      new Button(scene, cx + 56, top + HEIGHT - 16, {
        width: 96, height: 20, style: 'gold', label: block === 'level' ? `NEED LV ${AWAKEN.level}` : 'Awaken',
        onClick: () => {
          this.destroy();
          onAwaken();
        },
      }).setEnabled(block == null),
    );
    scene.add.existing(this);
  }
}

