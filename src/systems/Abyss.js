import { ABYSS, ENEMIES, ISLANDS, WAVES } from '../config.js';
import {
  clearBonus, enemyCount, seededRandom, spawnInterval, waveScaling,
} from './WaveManager.js';

// The Abyss (ABYSS in config): what each depth of a dive is made of. Pure
// rules on (seed, depth), so a run can be replayed (the sim) or resumed at
// the start of a depth (a save) and meet the same thing.

const islandOf = (id) => ISLANDS.find((d) => d.id === id);
const startIsland = () => islandOf(ABYSS.start.island);

// The island wave a depth plays like (enemy count, spawn rate), and the wave
// whose scaling it uses (that island's offset included).
export const depthWave = (depth) => ABYSS.start.wave + depth - 1;
export const depthScalingWave = (depth) => depthWave(depth) + startIsland().waveOffset;

// A generator for one thing (salt) about a run's depth.
function rng(seed, depth, salt) {
  let h = Math.imul(seed >>> 0, 2654435761) ^ Math.imul(depth + 1, 40503) ^ Math.imul(salt + 1, 97);
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  return seededRandom(h ^ (h >>> 13));
}

// A new run's seed.
export const newSeed = (random = Math.random) => Math.floor(random() * 2 ** 31);

export const isBossDepth = (depth) => depth % ABYSS.bosses.every === 0;

// The boss(es) of a depth (ENEMIES keys), or [].
export function depthBosses(seed, depth) {
  if (!isBossDepth(depth)) return [];
  const { every, order, pairsFrom, pairs } = ABYSS.bosses;
  if (depth < pairsFrom) return [order[(depth / every - 1) % order.length]];
  const pair = pairs[((depth - pairsFrom) / every) % pairs.length];
  const random = rng(seed, depth, 3);
  return pair.map((key) => {
    if (key) return key;
    const others = order.filter((k) => !pair.includes(k));
    return others[Math.floor(random() * others.length)];
  });
}

// The enemy types (ABYSS.enemies keys) a depth draws from.
export function depthTypes(seed, depth) {
  const { start, every, max } = ABYSS.types;
  const count = Math.min(max, start + Math.floor((depth - 1) / every));
  const pool = Object.keys(ABYSS.enemies);
  const random = rng(seed, depth, 1);
  const picked = [];
  while (picked.length < count && pool.length) picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return picked;
}

// Chance for each (non-boss) enemy of a depth to be an Elite.
export function depthEliteChance(depth) {
  const e = ABYSS.elites;
  if (depth < e.fromDepth) return 0;
  const t = Math.min(1, (depth - e.fromDepth) / (e.maxDepth - e.fromDepth));
  return e.chance + (e.maxChance - e.chance) * t;
}

// How many currents are active at a depth.
function currentCount(depth) {
  return ABYSS.currents.counts.reduce((n, [from, count]) => (depth >= from ? count : n), 0);
}

// The currents of a run at a depth: { active (oldest first), fresh (those
// that joined or were swapped in at this depth) }.
export function depthCurrents(seed, depth) {
  const { counts, swapEvery, ids } = ABYSS.currents;
  const active = [];
  let fresh = [];
  for (let d = counts[0][0]; d <= depth; d += swapEvery) {
    const random = rng(seed, d, 2);
    const added = [];
    const pick = (not = null) => {
      const pool = ids.filter((id) => !active.includes(id) && id !== not);
      const id = pool[Math.floor(random() * pool.length)];
      active.push(id);
      added.push(id);
    };
    if (active.length < currentCount(d)) {
      while (active.length < currentCount(d)) pick();
    } else {
      pick(active.shift());
    }
    fresh = added;
  }
  return { active, fresh: depth % swapEvery === 0 ? fresh : [] };
}

// Enemy HP, damage and kill gold multipliers at a depth (`currents`: the
// active ones; Armoured adds HP). Damage: depth 1's (the start wave's, capped
// as on its island) growing ABYSS.damageGrowth per depth with no cap.
export function depthScaling(depth, currents = []) {
  const island = startIsland();
  const s = waveScaling(depthScalingWave(depth), island);
  const first = waveScaling(depthScalingWave(1), island).damage;
  const armoured = currents.includes('armoured') ? ABYSS.currents.armoured.hp : 1;
  return { hp: s.hp * armoured, damage: first * (1 + ABYSS.damageGrowth) ** (depth - 1), gold: s.gold };
}

// A depth's spawn plan (WaveManager's composeWave shape): groups of its
// types, picked by weight until they hold the wave's count (each group
// counting as its type's size) (cut down on a
// boss depth, as on the islands), with its boss(es) entering at
// ABYSS.bosses.spawnAt of the groups.
export function depthPlan(seed, depth) {
  const random = rng(seed, depth, 4);
  const wave = depthWave(depth);
  const bosses = depthBosses(seed, depth);
  let count = enemyCount(wave);
  if (bosses.length) count = Math.round(count * WAVES.bossEscortFactor);
  const types = depthTypes(seed, depth).map((key) => ABYSS.enemies[key]);
  const totalWeight = types.reduce((s, t) => s + t.weight, 0);
  const groups = [];
  let size = 0;
  while (size < count) {
    let roll = random() * totalWeight;
    const t = types.find((g) => (roll -= g.weight) < 0) ?? types[types.length - 1];
    const members = t.pack
      ? Array(t.pack[0] + Math.floor(random() * (t.pack[1] - t.pack[0] + 1))).fill(t.members[0])
      : t.members;
    groups.push({ members, escort: !!t.escort });
    size += t.pack ? members.length : t.size ?? members.length;
  }
  const spawnAt = ABYSS.bosses.spawnAt;
  bosses.forEach((key, i) => {
    groups.splice(Math.round(groups.length * spawnAt[Math.min(i, spawnAt.length - 1)]), 0, { members: [key] });
  });

  const elites = depthEliteChance(depth);
  const interval = spawnInterval(wave);
  const plan = [];
  for (const g of groups) {
    const leader = plan.length;
    g.members.forEach((key, i) => {
      const def = ENEMIES[key];
      plan.push({
        key,
        def,
        elite: !def.boss && random() < elites,
        delay: plan.length === 0 ? 0 : i === 0 ? interval : WAVES.formationSpacing,
        follow: g.escort && i > 0 ? leader : null,
        hpFactor: 1,
        damageFactor: 1,
      });
    });
  }
  return plan;
}

// The gold a clear of a depth pays: every enemy's kill gold (Elites' x
// ABYSS.elites.gold) and the clear bonus. A checkpoint start pays it.
export function depthGold(seed, depth) {
  const { gold } = depthScaling(depth);
  const kills = depthPlan(seed, depth)
    .reduce((s, { def, elite }) => s + (def.gold ?? 0) * (elite ? ABYSS.elites.gold : 1), 0);
  return Math.round(kills * gold) + clearBonus(depthScalingWave(depth));
}

// The battlefield of a depth, island-shaped for the scenery, weather and
// hazards (Volcano, Blizzard, Mists): the Abyss's own backdrop and motes,
// plus each active current's island hazard (and that island's weather).
export function abyssIsland(currents = []) {
  const c = ABYSS.currents;
  const island = {
    id: ABYSS.id,
    name: ABYSS.name,
    shortName: ABYSS.shortName,
    scenery: ABYSS.scenery,
    motes: true,
    waveOffset: startIsland().waveOffset,
    damageCap: Infinity,
  };
  const always = { from: 1, every: 1, skipBossWaves: false, ms: Infinity };
  if (currents.includes('volcanic')) {
    island.lavaBombs = islandOf(c.volcanic.island).lavaBombs;
    island.ash = true;
  }
  if (currents.includes('blizzard')) {
    const { island: from, ...spec } = c.blizzard;
    island.blizzard = { ...islandOf(from).blizzard, ...always, ...spec };
    island.snow = true;
  }
  if (currents.includes('fogbound')) {
    const { island: from, ...spec } = c.fogbound;
    island.fogBank = { ...islandOf(from).fogBank, ...always, ...spec };
    island.mist = true;
  }
  return island;
}

// What a depth is fought with: Progress.waveOptions' shape, plus wave (the
// island wave it plays like) and abyss { seed, depth, currents, fresh }.
export function depthOptions(seed, depth) {
  const { active, fresh } = depthCurrents(seed, depth);
  const island = abyssIsland(active);
  return {
    wave: depthWave(depth),
    island,
    offset: island.waveOffset,
    finale: null,
    countFactor: 1,
    abyss: {
      seed, depth, currents: active, fresh,
    },
  };
}

// The depths a dive can start at, given the best depth reached: 1, then
// every multiple of ABYSS.checkpoints.every up to share x best.
export function checkpoints(best) {
  const { every, share } = ABYSS.checkpoints;
  const list = [1];
  for (let d = every; d <= Math.floor(best * share); d += every) list.push(d);
  return list;
}

// The first-clear reward of a depth: { chests: { tier: n }, pearls } or null.
export function milestoneOf(depth) {
  const m = ABYSS.milestones;
  if (m[depth]) return { chests: {}, pearls: 0, ...m[depth] };
  const listed = Object.keys(m).map(Number).filter(Number.isFinite);
  const last = Math.max(...listed);
  if (depth > last && depth % m.every === 0) return { chests: {}, pearls: 0, ...m.after };
  return null;
}
