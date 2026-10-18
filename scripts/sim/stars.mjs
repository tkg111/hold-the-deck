// Star pacing: `npm run sim:stars [-- trials]`.
//
// Chests only, no battles: from a fresh save with every pack open, chests
// are opened one at a time (from the pack the greedy bot in simulate.mjs
// would pick: the most crew still to find or star up) until the main six
// (the six the bot puts on the ship with every crewmate found: rarity
// first, then damage) are all at 3 stars, and then at max stars. Prints the
// median and the 10th-90th percentile of chests over `trials` saves. Also
// runs on a checkout from before packs (one chest for everyone).
// `-- trials id,id,...` times those crewmates instead of the main six.
import { HEROES, ISLANDS, PACKS, RARITY } from '../../src/config.js';
import { Progress } from '../../src/systems/Progress.js';
import { seedRandom } from './simulate.mjs';

const TRIALS = Number(process.argv[2] ?? 2000);
const packs = await import('../../src/systems/Packs.js').catch(() => null);
const sim = await import('./simulate.mjs');

const rank = Object.keys(RARITY);
const worth = (id) => rank.indexOf(HEROES[id].rarity) * 1000 + (HEROES[id].aura ? 500 : HEROES[id].damage);
const SIX = process.argv[3]?.split(',') ?? Object.keys(HEROES).sort((a, b) => worth(b) - worth(a)).slice(0, 6);

function trial(seed) {
  seedRandom(seed);
  const p = new Progress();
  for (const d of ISLANDS) p.devSailTo(d.id);   // every island (and pack) open
  p.pearls = Infinity;
  let to3 = null;
  for (let n = 1; n <= 5000; n++) {
    if (packs && sim.bestPack) p.openPack(sim.bestPack(p));
    else p.openPack();
    const at = (s) => SIX.every((id) => p.isOwned(id) && p.heroStarCount(id) >= s);
    if (to3 == null && at(3)) to3 = n;
    if (at(PACKS.maxStars)) return { to3, to5: n };
  }
  return { to3, to5: null };
}

const pct = (xs, q) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))];
const results = Array.from({ length: TRIALS }, (_, i) => trial(7000 + i));
console.log(`--- chests to ${process.argv[3] ? '' : 'the main six '}(${SIX.map((id) => HEROES[id].shortName).join(', ')}): ${TRIALS} saves${packs && sim.bestPack ? ', every pack open' : ', one chest'} ---`);
for (const [label, key] of [['3 stars', 'to3'], [`${PACKS.maxStars} stars`, 'to5']]) {
  const xs = results.map((r) => r[key]).filter((x) => x != null).sort((a, b) => a - b);
  console.log(`${label}: median ${pct(xs, 0.5)} chests (10%-90%: ${pct(xs, 0.1)}-${pct(xs, 0.9)})`);
}
