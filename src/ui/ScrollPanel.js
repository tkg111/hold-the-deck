import Phaser from 'phaser';
import { UI_KIT } from '../config.js';
import { Button } from './Button.js';
import {
  glyph, glyphWidth, hexColor, panel, subText, text, UI,
} from './kit.js';

// Layout of the panel, in art pixels (from ui_mock_between_waves.png).
const TITLE_W = 122;
const TITLE_H = 20;
const TITLE_OVERLAP = 8;   // the wood title plate sits this far above the parchment
const TOP_PAD = 15;        // parchment top to the header / first row
const BOTTOM_PAD = 4;
const HINT_H = 8;          // extra bottom room for "▼ MORE" when the list scrolls
const ROW_INSET = 9;       // rows' left / right margin inside the parchment
const BAR_RIGHT = 6;       // scrollbar's right edge, in from the parchment's
const BAR_W = 2;

// A parchment panel under a wood title plate, listing rows of a fixed height,
// with an optional header strip (headerHeight tall) above them. When there are
// more rows than fit, it shows `visibleRows` at a time, with a thin scrollbar
// inside its right edge and "▼ MORE" at the bottom while there's more below;
// the list scrolls a row at a time by mouse wheel or by dragging (touch or
// mouse). A drag emits 'drag-start' and sets `dragged` until the next press,
// so rows can tell a tap from a drag. (x, y) is the top left of the parchment
// and width is its width, in layout units.
export class ScrollPanel extends Phaser.GameObjects.Container {
  constructor(scene, x, y, width, {
    title, visibleRows = UI_KIT.shipwrightRows, rowHeight = UI_KIT.rowHeight, onClose = null, headerHeight = 0,
  }) {
    super(scene, x, y);
    this.panelWidth = width;  // not this.w: Phaser's setPosition(x, y, z, w) overwrites it
    this.visibleRows = visibleRows;
    this.rowHeight = rowHeight;
    this.rowsTop = TOP_PAD + headerHeight;
    this.offset = 0;
    this.rows = [];
    this.dragged = false;

    this.parchment = panel(scene, 0, 0, width, 40, 'parchment');
    this.dividers = scene.add.graphics();
    this.rowLayer = scene.add.container(0, 0);
    // Header strip (subclasses add to it), at the rows' left margin.
    this.header = scene.add.container(ROW_INSET, TOP_PAD);
    this.scrollbar = scene.add.graphics();
    const hintLabel = text(scene, 0, 0, 'MORE', subText());
    const arrowW = glyphWidth('down');
    const hintW = arrowW + 3 + hintLabel.inkWidth;
    hintLabel.setPosition(-Math.floor(hintW / 2) + arrowW + 3, 0).setOrigin(0, 0.5);
    this.moreHint = scene.add.container(width / 2, 0, [
      glyph(scene, -Math.floor(hintW / 2) + Math.floor(arrowW / 2), 0, 'down', UI.colors.subText), hintLabel,
    ]);
    const plateX = (width - TITLE_W) / 2;
    this.plate = panel(scene, plateX, -TITLE_OVERLAP, TITLE_W, TITLE_H, 'wood');
    this.titleText = text(scene, width / 2, -TITLE_OVERLAP + TITLE_H / 2, title, { tone: 'light' })
      .setOrigin(0.5);

    this.add([this.parchment, this.dividers, this.rowLayer, this.header, this.scrollbar, this.moreHint,
      this.plate, this.titleText]);

    if (onClose) {
      this.closeButton = new Button(scene, width - 4, -TITLE_OVERLAP + 4, {
        width: 14, height: 14, label: 'X', font: 'small', onClick: onClose,
      });
      this.add(this.closeButton);
    }

    // Wheel over the panel scrolls it; a press on the list and a drag past
    // UI_KIT.dragThreshold scrolls it with the pointer.
    const at = (pointer) => this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const handlers = {
      wheel: (pointer, _over, _dx, dy) => {
        if (this.isActive() && this.overList(at(pointer))) this.scroll(Math.sign(dy));
      },
      pointerdown: (pointer) => {
        this.dragged = false;
        const p = at(pointer);
        this.drag = this.isActive() && this.overList(p) ? { y: p.y, offset: this.offset } : null;
      },
      pointermove: (pointer) => {
        if (!this.drag || !pointer.isDown) return;
        const dy = at(pointer).y - this.drag.y;
        if (!this.dragged && Math.abs(dy) >= UI_KIT.dragThreshold) {
          this.dragged = true;
          this.emit('drag-start');
        }
        if (this.dragged) this.scrollTo(this.drag.offset - Math.round(dy / this.rowHeight));
      },
      pointerup: () => { this.drag = null; },
      pointerupoutside: () => { this.drag = null; },
    };
    for (const [name, fn] of Object.entries(handlers)) scene.input.on(name, fn);
    this.once('destroy', () => {
      for (const [name, fn] of Object.entries(handlers)) scene.input.off(name, fn);
    });

    scene.add.existing(this);
  }

  setTitle(title) {
    this.titleText.setText(title);
    return this;
  }

  isActive() { return this.visible && this.rows.length > 0; }

  // A world point over the parchment's list (the panel is a top-level
  // container, so its position is its world position).
  overList({ x, y }) {
    const lx = x - this.x;
    const ly = y - this.y;
    return lx >= 0 && lx < this.panelWidth && ly >= this.rowsTop - 2 && ly < this.parchment.height;
  }

  // rows: containers (or other objects) laid out from their own (0, 0) at the
  // row's top-left, inside the margins; `innerWidth` gives the usable width.
  setRows(rows) {
    this.rowLayer.removeAll(true);
    this.rows = rows;
    this.rowLayer.add(rows);
    this.resize();
    return this;
  }

  // Show n rows at a time (e.g. to fit the view's height).
  setVisibleRows(n) {
    const rows = Math.max(1, n);
    if (rows === this.visibleRows) return this;
    this.visibleRows = rows;
    this.resize();
    return this;
  }

  resize() {
    this.offset = Phaser.Math.Clamp(this.offset, 0, this.maxOffset);
    const shown = Math.min(this.rows.length, this.visibleRows);
    const height = this.rowsTop + shown * this.rowHeight + BOTTOM_PAD + (this.maxOffset > 0 ? HINT_H : 0);
    this.parchment.setSize(this.panelWidth, height);
    this.layoutRows();
  }

  get innerWidth() { return this.panelWidth - (2 * ROW_INSET); }
  get maxOffset() { return Math.max(0, this.rows.length - this.visibleRows); }
  // Parchment height for n visible rows (and the hint), to fit a space.
  static heightFor(n, headerHeight = 0, rowHeight = UI_KIT.rowHeight) {
    return TOP_PAD + headerHeight + n * rowHeight + BOTTOM_PAD + HINT_H;
  }

  scroll(by) {
    this.scrollTo(this.offset + by);
  }

  scrollTo(offset) {
    const next = Phaser.Math.Clamp(offset, 0, this.maxOffset);
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
      if (visible) row.setPosition(ROW_INSET, this.rowsTop + slot * this.rowHeight);
    });
    g.fillStyle(hexColor(UI_KIT.dividerColor));
    for (let s = 1; s < shown; s++) {
      g.fillRect(ROW_INSET, this.rowsTop + s * this.rowHeight - 2, this.innerWidth, 1);
    }

    // Scrollbar: the track down the list, the thumb its visible share.
    const bar = this.scrollbar.clear();
    const scrolls = this.maxOffset > 0;
    if (scrolls) {
      const x = this.panelWidth - BAR_RIGHT - BAR_W;
      const trackH = shown * this.rowHeight - 3;
      const thumbH = Math.max(6, Math.round(trackH * shown / this.rows.length));
      const thumbY = Math.round((trackH - thumbH) * this.offset / this.maxOffset);
      bar.fillStyle(hexColor(UI_KIT.dividerColor)).fillRect(x, this.rowsTop, BAR_W, trackH);
      bar.fillStyle(hexColor(UI.colors.subText)).fillRect(x, this.rowsTop + thumbY, BAR_W, thumbH);
    }
    this.moreHint.setVisible(scrolls && this.offset < this.maxOffset)
      .setY(this.rowsTop + shown * this.rowHeight + 2);
  }
}
