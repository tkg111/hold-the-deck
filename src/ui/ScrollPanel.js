import Phaser from 'phaser';
import { UI_KIT } from '../config.js';
import { Button } from './Button.js';
import { hexColor, icon, light, panel, text } from './kit.js';

// Layout of the panel, in art pixels (from ui_mock_between_waves.png).
const TITLE_W = 122;
const TITLE_H = 20;
const TITLE_OVERLAP = 8;   // the wood title plate sits this far above the parchment
const TOP_PAD = 15;        // parchment top to the first row
const BOTTOM_PAD = 4;
const ROW_INSET = 9;       // rows' left / right margin inside the parchment

// A parchment panel under a wood title plate, listing rows of a fixed height.
// When there are more rows than fit, it shows `visibleRows` at a time and
// scrolls a whole row per mouse-wheel notch or arrow click. (x, y) is the top
// left of the parchment and width is its width, in layout units.
export class ScrollPanel extends Phaser.GameObjects.Container {
  constructor(scene, x, y, width, {
    title, visibleRows = UI_KIT.shipwrightRows, rowHeight = UI_KIT.rowHeight, onClose = null,
  }) {
    super(scene, x, y);
    this.panelWidth = width;  // not this.w: Phaser's setPosition(x, y, z, w) overwrites it
    this.visibleRows = visibleRows;
    this.rowHeight = rowHeight;
    this.offset = 0;
    this.rows = [];

    this.parchment = panel(scene, 0, 0, width, 40, 'parchment');
    this.dividers = scene.add.graphics();
    this.rowLayer = scene.add.container(0, 0);
    const plateX = (width - TITLE_W) / 2;
    this.plate = panel(scene, plateX, -TITLE_OVERLAP, TITLE_W, TITLE_H, 'wood');
    this.titleText = text(scene, width / 2, -TITLE_OVERLAP + TITLE_H / 2, title, light())
      .setOrigin(0.5);

    // Scroll arrows to the right of the title plate.
    const ay = -TITLE_OVERLAP + TITLE_H / 2;
    this.upArrow = icon(scene, plateX + TITLE_W + 10, ay, 'arrow_up').setInteractive({ useHandCursor: true });
    this.downArrow = icon(scene, plateX + TITLE_W + 24, ay, 'arrow_up').setFlipY(true)
      .setInteractive({ useHandCursor: true });
    this.upArrow.on('pointerdown', () => this.scroll(-1));
    this.downArrow.on('pointerdown', () => this.scroll(1));

    this.add([this.parchment, this.dividers, this.rowLayer, this.plate, this.titleText, this.upArrow, this.downArrow]);

    if (onClose) {
      this.closeButton = new Button(scene, width - 4, -TITLE_OVERLAP + 4, {
        width: 14, height: 14, label: 'X', font: 'small', onClick: onClose,
      });
      this.add(this.closeButton);
    }

    // Wheel over the panel scrolls it.
    this.onWheel = (pointer, _over, _dx, dy) => {
      if (!this.visible || !this.getBounds().contains(pointer.worldX, pointer.worldY)) return;
      this.scroll(Math.sign(dy));
    };
    scene.input.on('wheel', this.onWheel);
    this.once('destroy', () => scene.input.off('wheel', this.onWheel));

    scene.add.existing(this);
  }

  setTitle(title) {
    this.titleText.setText(title);
    return this;
  }

  // rows: containers (or other objects) laid out from their own (0, 0) at the
  // row's top-left, inside the margins; `innerWidth` gives the usable width.
  setRows(rows) {
    this.rowLayer.removeAll(true);
    this.rows = rows;
    this.rowLayer.add(rows);
    this.offset = Phaser.Math.Clamp(this.offset, 0, this.maxOffset);
    const shown = Math.min(rows.length, this.visibleRows);
    const height = (TOP_PAD + BOTTOM_PAD) + shown * this.rowHeight;
    this.parchment.setSize(this.panelWidth, height);
    this.layoutRows();
    return this;
  }

  get innerWidth() { return this.panelWidth - (2 * ROW_INSET); }
  get maxOffset() { return Math.max(0, this.rows.length - this.visibleRows); }

  scroll(by) {
    const next = Phaser.Math.Clamp(this.offset + by, 0, this.maxOffset);
    if (next === this.offset) return;
    this.offset = next;
    this.layoutRows();
  }

  layoutRows() {
    const g = this.dividers.clear();
    const shown = Math.min(this.rows.length, this.visibleRows);
    this.rows.forEach((row, i) => {
      const slot = i - this.offset;
      const visible = slot >= 0 && slot < shown;
      row.setVisible(visible);
      if (visible) row.setPosition(ROW_INSET, TOP_PAD + slot * this.rowHeight);
    });
    g.fillStyle(hexColor(UI_KIT.dividerColor));
    for (let s = 1; s < shown; s++) {
      g.fillRect(ROW_INSET, TOP_PAD + s * this.rowHeight - 2, this.innerWidth, 1);
    }
    const scrolls = this.maxOffset > 0;
    this.upArrow.setVisible(scrolls).setAlpha(this.offset > 0 ? 1 : 0.35);
    this.downArrow.setVisible(scrolls).setAlpha(this.offset < this.maxOffset ? 1 : 0.35);
  }
}
