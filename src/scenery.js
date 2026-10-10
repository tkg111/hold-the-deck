import { SCENERY } from './config.js';
import { DEPTH } from './entities/Ship.js';
import { sceneryKeys } from './sprites.js';

// The battle scene's backdrop: bg_tall.png behind everything and the animated
// foreground (near water and island) over the enemies so they wade into the
// sea. bg_tall.png is bg.png's picture with more sky above and more sea below;
// its row SCENERY.originY sits at the battlefield's y = 0, so whatever height
// the view has (270 to 360, see GameScene) is covered with sky and sea. An
// island with its own scenery (Ember Isle) swaps in its background and
// foreground, laid out the same way.
export class Scenery {
  constructor(scene, island) {
    this.bg = scene.add.image(0, -SCENERY.originY, sceneryKeys(island).bg).setOrigin(0).setDepth(DEPTH.background);
    this.fg = scene.add.sprite(0, 0, sceneryKeys(island).fg).setOrigin(0).setDepth(DEPTH.foreground);
    this.setIsland(island);
  }

  // Show an island's backdrop (its ISLANDS entry).
  setIsland(island) {
    const { bg, fg, anim } = sceneryKeys(island);
    this.bg.setTexture(bg);
    this.fg.setTexture(fg).play(anim);
  }
}
