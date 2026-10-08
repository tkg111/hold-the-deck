import { SPRITES } from './config.js';

// The battle scene's layout from public/sprites/layout.json, converted from
// art pixels to layout units. Filled by initLayout() once the file has loaded.
export const LAYOUT = {};

const u = (px) => px * SPRITES.scale;

export function initLayout(json) {
  const { rise, advance } = json.kraken;
  Object.assign(LAYOUT, {
    shipX: u(json.shipPos.x),           // top-left of ship_stageN.png
    shipY: u(json.shipPos.y),
    waterY: u(json.waterY),
    enemySpawnX: u(json.enemySpawnX),
    shipContactX: u(json.shipContactX),
    // [x, feetY] pairs, right to left as walkers travel.
    lane: json.lane.points.map(([x, y]) => [u(x), u(y)]).sort((a, b) => b[0] - a[0]),
    // The Kraken's x / y are the top-left of its frame.
    kraken: {
      x: u(rise.x),
      fromY: u(rise.fromY),
      toY: u(rise.toY),
      riseMs: rise.seconds * 1000,
      toX: u(advance.toX),
    },
    foreground: { frames: json.foreground.frames, fps: json.foreground.fps },
  });
}

// Feet y of a walker at x, interpolated between the lane points (held level
// past either end).
export function laneFeetY(x) {
  const { lane } = LAYOUT;
  if (x >= lane[0][0]) return lane[0][1];
  for (let i = 1; i < lane.length; i++) {
    const [x1, y1] = lane[i];
    if (x >= x1) {
      const [x0, y0] = lane[i - 1];
      return y1 + ((x - x1) / (x0 - x1)) * (y0 - y1);
    }
  }
  return lane[lane.length - 1][1];
}
