import { DISPLAY, SCENERY, WIDE } from './config.js';
import { DEPTH } from './entities/Ship.js';
import { sceneryKeys, wideSceneryKeys } from './sprites.js';

// An island's backdrop for a view: in a view wider than the base, the wide
// background and foreground (WIDE: the base picture at x = WIDE.side, so
// drawn at battlefield x = -WIDE.side, 270 tall like the view); otherwise
// the tall ones (bg_tall.png: bg.png's picture with more sky above and
// more sea below, its row SCENERY.originY at the battlefield's y = 0, so a
// view up to 360 tall is covered). The front layer is the same either way.
// { bg, bgX, bgY, fg, fgX, anim, front }.
export function backdropFor(island, view) {
  const keys = sceneryKeys(island);
  if (view.width > DISPLAY.width) {
    const wide = wideSceneryKeys(island);
    return { ...wide, bgX: -WIDE.side, bgY: 0, fgX: -WIDE.side, front: keys.front };
  }
  return { ...keys, bgX: 0, bgY: -SCENERY.originY, fgX: 0 };
}

// The battle scene's backdrop (see backdropFor) behind everything, and the
// animated foreground (near water and island) over the enemies so they wade
// into the sea. An island with its own scenery (Ember Isle, Frostbite Reef)
// swaps in its background and foreground, laid out the same way, plus its
// still front layer if it has one (Frostbite Reef's pines), over the
// foreground and every enemy but under the ship's railings.
export class Scenery {
  constructor(scene, island) {
    this.scene = scene;
    this.bg = scene.add.image(0, 0, '__DEFAULT').setOrigin(0).setDepth(DEPTH.background);
    this.fg = scene.add.sprite(0, 0, '__DEFAULT').setOrigin(0).setDepth(DEPTH.foreground);
    this.front = scene.add.image(0, 0, '__DEFAULT').setOrigin(0).setDepth(DEPTH.frontScenery);
    this.setIsland(island);
  }

  // Show an island's backdrop (its ISLANDS entry).
  setIsland(island) {
    this.island = island;
    showBackdrop(this, island, this.scene.view);
  }

  // The view changed shape (wide or tall art).
  layout() {
    this.setIsland(this.island);
  }

  // Something pushes through the front layer (the Frost Giant in the
  // pines): it jumps px left or right for ms (game time).
  shakeFront(px, ms) {
    this.front.setX(Math.random() < 0.5 ? -px : px);
    this.scene.time.delayedCall(ms, () => this.front.setX(0));
  }
}

// Set { bg, fg, front } images to an island's backdrop for the view (the
// battle's Scenery, the Galley's scene). The foreground keeps its loop's
// frame when only the view changed.
export function showBackdrop({ bg, fg, front }, island, view) {
  const b = backdropFor(island, view);
  bg.setTexture(b.bg).setPosition(b.bgX, b.bgY);
  fg.setX(b.fgX);
  if (fg.anims.currentAnim?.key !== b.anim) fg.setTexture(b.fg).play(b.anim);
  front.setVisible(!!b.front);
  if (b.front) front.setTexture(b.front);
}
