import { SCENERY } from './config.js';
import { DEPTH } from './entities/Ship.js';
import { sceneryKeys } from './sprites.js';

// The battle scene's backdrop: bg_tall.png behind everything and the animated
// foreground (near water and island) over the enemies so they wade into the
// sea. bg_tall.png is bg.png's picture with more sky above and more sea below;
// its row SCENERY.originY sits at the battlefield's y = 0, so whatever height
// the view has (270 to 360, see GameScene) is covered with sky and sea. An
// island with its own scenery (Ember Isle, Frostbite Reef) swaps in its
// background and foreground, laid out the same way, plus its still front
// layer if it has one (Frostbite Reef's pines), over the foreground and every
// enemy but under the ship's railings.
export class Scenery {
  constructor(scene, island) {
    this.scene = scene;
    this.bg = scene.add.image(0, -SCENERY.originY, sceneryKeys(island).bg).setOrigin(0).setDepth(DEPTH.background);
    this.fg = scene.add.sprite(0, 0, sceneryKeys(island).fg).setOrigin(0).setDepth(DEPTH.foreground);
    this.front = scene.add.image(0, 0, '__DEFAULT').setOrigin(0).setDepth(DEPTH.frontScenery);
    this.setIsland(island);
  }

  // Show an island's backdrop (its ISLANDS entry).
  setIsland(island) {
    const { bg, fg, anim, front } = sceneryKeys(island);
    this.bg.setTexture(bg);
    this.fg.setTexture(fg).play(anim);
    this.front.setVisible(!!front);
    if (front) this.front.setTexture(front);
  }

  // Something pushes through the front layer (the Frost Giant in the
  // pines): it jumps px left or right for ms (game time).
  shakeFront(px, ms) {
    this.front.setX(Math.random() < 0.5 ? -px : px);
    this.scene.time.delayedCall(ms, () => this.front.setX(0));
  }
}
