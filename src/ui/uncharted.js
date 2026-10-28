import Phaser from 'phaser';
import { UNCHARTED } from '../config.js';
import { UNCHARTED_JSON_KEY, unchartedKey } from '../sprites.js';
import { fmtClock } from './format.js';
import {
  light, panel, subText, text, UI,
} from './kit.js';

// The Uncharted Seas' small art (legend.json's orders): items (Grog, the
// five Sea Glass, the Heart of the Deep) at 16px or 12px, crowns, chart
// nodes and rule icons, and the Grog plaque.

const legend = (scene) => scene.cache.json.get(UNCHARTED_JSON_KEY);
const ITEM_ORDER = ['grog', 'red', 'blue', 'green', 'purple', 'gold', 'heart'];
const NODE_ORDER = ['locked', 'open', 'cleared', 'boss_locked', 'boss_open', 'boss_cleared', 'selected'];

// An item's icon ('grog', a colour or 'heart'), 12px (HUD) or 16px.
export function itemIcon(scene, x, y, id, size = 12) {
  const order = legend(scene)?.items.order ?? ITEM_ORDER;
  return scene.add.image(Math.round(x), Math.round(y), unchartedKey(size === 16 ? 'items16' : 'icons12'), Math.max(0, order.indexOf(id)));
}

// Item names, for the Treasure Hold and the drops.
export const ITEM_NAMES = {
  grog: 'Grog', red: 'Red Sea Glass', blue: 'Blue Sea Glass', green: 'Green Sea Glass',
  purple: 'Purple Sea Glass', gold: 'Gold Sea Glass', heart: 'Heart of the Deep',
};

// n crowns (bronze, silver, gold) in a row from (x, y) (their centres,
// `gap` px apart).
export function crownRow(scene, x, y, n, gap = 11) {
  return Array.from({ length: n }, (_, i) => scene.add.image(Math.round(x + i * gap), Math.round(y), unchartedKey('crowns'), i));
}

// A chart node ('open', 'boss_cleared', ...).
export function nodeImage(scene, x, y, name) {
  return scene.add.image(Math.round(x), Math.round(y), unchartedKey('nodes'), Math.max(0, NODE_ORDER.indexOf(name)));
}

// A stage rule's icon and its legend.json entry ({ id, name, text }).
export function ruleOf(scene, id) {
  return legend(scene)?.rules.order.find((r) => r.id === id) ?? { id, name: id, text: '' };
}
export function ruleIcon(scene, x, y, id) {
  const order = legend(scene)?.rules.order.map((r) => r.id) ?? [];
  return scene.add.image(Math.round(x), Math.round(y), unchartedKey('rules'), Math.max(0, order.indexOf(id)));
}

// The Grog plaque: "26/30  4:12" (or FULL) with the Grog icon, a wood plaque
// whose top-right corner is at (x, y). It ticks every second.
export class GrogPlaque extends Phaser.GameObjects.Container {
  constructor(scene, x, y, progress) {
    super(scene, x, y);
    this.progress = progress;
    const w = 90;
    const h = 20;
    this.add(panel(scene, -w, 0, w, h, 'wood'));
    this.add(itemIcon(scene, -w + 11, h / 2, 'grog'));
    this.count = text(scene, -w + 20, h / 2, '', light({ font: 'small' })).setOrigin(0, 0.5);
    this.time = text(scene, -6, h / 2, '', light({ font: 'small' })).setOrigin(1, 0.5);
    this.add([this.count, this.time]);
    scene.add.existing(this);
    this.refresh();
    this.timer = scene.time.addEvent({ delay: 1000, loop: true, callback: () => this.refresh() });
    this.once('destroy', () => this.timer.remove());
  }

  refresh() {
    const p = this.progress;
    const left = p.grogTimeLeft();
    this.count.setText(`${p.uncharted.grog}/${UNCHARTED.grog.cap}`);
    this.time.setText(left == null ? 'FULL' : fmtClock(left)).setColor(left == null ? UI.colors.text : UI.colors.text);
  }
}

// A row of item icons with counts ("[red] 12  [blue] 3 ..."), from (x, y),
// `gap` px per item, on parchment.
export function itemCounts(scene, x, y, counts, gap = 34) {
  const objs = [];
  counts.forEach(([id, n], i) => {
    objs.push(itemIcon(scene, x + i * gap + 6, y, id));
    objs.push(text(scene, x + i * gap + 14, y, `${n}`, subText({ color: UI.colors.textOnParchment })).setOrigin(0, 0.5));
  });
  return objs;
}
