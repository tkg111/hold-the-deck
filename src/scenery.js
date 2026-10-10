import { SCENERY } from './config.js';
import { DEPTH } from './entities/Ship.js';
import { BACKGROUND_KEY, FOREGROUND_ANIM, FOREGROUND_KEY } from './sprites.js';

// The battle scene's backdrop: bg_tall.png behind everything and the animated
// foreground (near water and island) over the enemies so they wade into the
// sea. bg_tall.png is bg.png's picture with more sky above and more sea below;
// its row SCENERY.originY sits at the battlefield's y = 0, so whatever height
// the view has (270 to 360, see GameScene) is covered with sky and sea.
export class Scenery {
  constructor(scene) {
    this.bg = scene.add.image(0, -SCENERY.originY, BACKGROUND_KEY).setOrigin(0).setDepth(DEPTH.background);
    this.fg = scene.add.sprite(0, 0, FOREGROUND_KEY).setOrigin(0)
      .setDepth(DEPTH.foreground).play(FOREGROUND_ANIM);
  }
}
