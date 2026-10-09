// The battle scene's layout from public/sprites/layout.json (in base pixels).
// Filled by initLayout() once the file has loaded.
//
// When the view is wider than the base 480 pixels, the island (with its beach,
// the enemy lane and the Kraken's rising spot) is anchored to the right edge
// and the ship stays at the left, with more sea in between: shiftIsland(dx)
// moves everything island-side right by dx. Ship-side points (the ship, where
// enemies stop, where the Kraken glides to, the Siren's rock, so she stays in
// the crew's range) never move.
export const LAYOUT = {};

let base = null;

export function initLayout(json) {
  const { rise, advance } = json.kraken;
  base = {
    shipX: json.shipPos.x,           // top-left of ship_stageN.png
    shipY: json.shipPos.y,
    waterY: json.waterY,
    enemySpawnX: json.enemySpawnX,
    shipContactX: json.shipContactX,
    // [x, feetY] pairs, right to left as walkers travel.
    lane: json.lane.points.map(([x, y]) => [x, y]).sort((a, b) => b[0] - a[0]),
    // The Kraken's x / y are the top-left of its frame.
    kraken: {
      x: rise.x,
      fromY: rise.fromY,
      toY: rise.toY,
      riseMs: rise.seconds * 1000,
      toX: advance.toX,
    },
    foreground: { frames: json.foreground.frames, fps: json.foreground.fps },
    // Top-left of the Siren's 48x48 frame.
    siren: { x: json.siren.x, y: json.siren.y },
    // Storm Harpies cruise with their body centre between these heights.
    flightY: { min: json.harpyFlightY.min, max: json.harpyFlightY.max },
  };
  shiftIsland(LAYOUT.islandShift ?? 0);
}

export function shiftIsland(dx) {
  Object.assign(LAYOUT, base, {
    islandShift: dx,
    enemySpawnX: base.enemySpawnX + dx,
    // The lane's ship end stays put; the rest moves with the island.
    lane: base.lane.map(([x, y]) => [x > base.shipContactX ? x + dx : x, y]),
    kraken: { ...base.kraken, x: base.kraken.x + dx },
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
