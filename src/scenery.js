import Phaser from 'phaser';
import { SCENERY } from './config.js';
import { DEPTH } from './entities/Ship.js';
import { BACKGROUND_KEY, FOREGROUND_ANIM, FOREGROUND_KEY } from './sprites.js';

const STRIP = 'strip';  // frame name of the mirrored strip (per sheet frame for the foreground)

// The battle scene's backdrop: bg.png behind everything and the animated
// foreground (near water and island) over the enemies so they wade into the
// sea. Both sit at the battlefield's fixed spot (top-left at 0, 0). When the
// view is wider than bg.png, the sea and sky left of it (behind the ship) are
// bg.png's / fg_sheet.png's left strip, mirrored back and forth; when it's
// taller, sky bands continue upward.
export class Scenery {
  constructor(scene) {
    this.scene = scene;
    addStripFrames(scene);
    this.bg = scene.add.image(0, 0, BACKGROUND_KEY).setOrigin(0).setDepth(DEPTH.background);
    this.fg = scene.add.sprite(0, 0, FOREGROUND_KEY).setOrigin(0)
      .setDepth(DEPTH.foreground).play(FOREGROUND_ANIM);
    this.sky = scene.add.graphics().setDepth(DEPTH.background);
    this.bgStrips = [];
    this.fgStrips = [];
    this.bands = skyBands(scene);
  }

  // Lay out for the scene's view (right and bottom edges at the base
  // layout's; see GameScene).
  layout(view) {
    for (const s of [...this.bgStrips, ...this.fgStrips]) s.destroy();
    this.bgStrips = [];
    this.fgStrips = [];
    const w = SCENERY.mirrorWidth;
    // Strip i ends where strip i - 1 (or bg.png) starts; even ones are flipped
    // so each seam joins matching columns.
    for (let i = 0; i * w < -view.left; i++) {
      const x = -(i + 1) * w;
      const flip = i % 2 === 0;
      this.bgStrips.push(this.scene.add.image(x, 0, BACKGROUND_KEY, STRIP)
        .setOrigin(0).setFlipX(flip).setDepth(DEPTH.background));
      this.fgStrips.push(this.scene.add.image(x, 0, FOREGROUND_KEY, `${STRIP}0`)
        .setOrigin(0).setFlipX(flip).setDepth(DEPTH.foreground));
    }
    this.shownFrame = null;
    this.syncForeground();

    // Sky bands from the top of bg.png up to the top of the view.
    const g = this.sky.clear();
    const { top, step, height } = this.bands;
    for (let k = 1, y = 0; y > view.top; k++, y -= height) {
      const n = Math.min(k, SCENERY.maxExtraSkyBands);
      const c = top.map((v, i) => Phaser.Math.Clamp(Math.round(v + n * step[i]), 0, 255));
      // The last band runs to the top of the view.
      const bandTop = k >= SCENERY.maxExtraSkyBands ? view.top : Math.max(view.top, y - height);
      g.fillStyle(Phaser.Display.Color.GetColor(...c)).fillRect(view.left, bandTop, view.width, y - bandTop);
      if (bandTop === view.top) break;
    }
  }

  // Show the foreground's current animation frame on the mirrored strips too.
  syncForeground() {
    const frame = this.fg.anims.currentFrame?.textureFrame ?? 0;
    if (frame === this.shownFrame) return;
    this.shownFrame = frame;
    for (const s of this.fgStrips) s.setFrame(`${STRIP}${frame}`);
  }
}

// The left SCENERY.mirrorWidth columns of bg.png ('strip') and of each
// foreground frame ('strip0', 'strip1', ...), as extra texture frames.
function addStripFrames(scene) {
  const bg = scene.textures.get(BACKGROUND_KEY);
  if (bg.has(STRIP)) return;
  const w = SCENERY.mirrorWidth;
  const base = bg.get();
  bg.add(STRIP, base.sourceIndex, base.cutX, base.cutY, w, base.cutHeight);
  // Adding the first extra frame makes it the default; keep the whole image.
  bg.firstFrame = '__BASE';
  const fg = scene.textures.get(FOREGROUND_KEY);
  for (const name of fg.getFrameNames()) {
    if (Number.isNaN(Number(name))) continue;
    const f = fg.get(name);
    fg.add(`${STRIP}${name}`, f.sourceIndex, f.cutX, f.cutY, w, f.cutHeight);
  }
}

// bg.png's top sky band colour, the step (per RGB channel) from the second
// band to it, and the second band's height: each band's colour is the most
// common one in its rows (across the mirrored strip, so the sun is skipped).
let bandsCache = null;
function skyBands(scene) {
  if (bandsCache) return bandsCache;
  const img = scene.textures.get(BACKGROUND_KEY).getSourceImage();
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const rowColor = (y) => {
    const data = ctx.getImageData(0, y, SCENERY.mirrorWidth, 1).data;
    const counts = new Map();
    let best = 0;
    let bestCount = 0;
    for (let i = 0; i < data.length; i += 4) {
      const c = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      const n = (counts.get(c) ?? 0) + 1;
      counts.set(c, n);
      if (n > bestCount) { best = c; bestCount = n; }
    }
    return best;
  };
  // Rows where the colour changes: the ends of the first two bands.
  let y = 0;
  const first = rowColor(0);
  while (y < img.height && rowColor(y) === first) y++;
  const second = rowColor(y);
  const secondStart = y;
  while (y < img.height && rowColor(y) === second) y++;
  const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  const top = rgb(first);
  bandsCache = {
    top,
    step: top.map((v, i) => v - rgb(second)[i]),
    height: Math.max(1, y - secondStart),
  };
  return bandsCache;
}
