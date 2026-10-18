// The Abyss balance check: `npm run sim:abyss [-- crews dives] [options]`.
//
// 1. Crews: for each of `crews` seeds, the greedy bot from simulate.mjs
//    sails all four islands from a fresh save, spending after every attempt;
//    a wave lost MAX_TRIES times in a row is skipped (a skipped finale counts
//    as cleared, so the ship sails on). No ship parts are made on the way.
//    Its save at the end of Fogbound Isle is the crew that dives. Set
//    ABYSS_CACHE to a file to keep these crews between runs.
// 2. Dives: each crew dives `dives` times (each dive its own seed, so its own
//    line-ups and currents), in each profile:
//    - none:     that crew, spending nothing between depths;
//    - upgraded: spending all its gold between depths like the greedy bot;
//    - parted:   upgraded, with `parts` (default: the Kraken Figurehead,
//                Frostwing Sails and Heartwood Cannons at max level) on the ship.
//    Frozen and charmed crew are tapped free like a player would (TAP in
//    simulate.mjs). A dive ends when the ship sinks (or at MAX_DEPTH).
// Report: the depth reached per profile (average, range), where dives end
// (boss depths, and which boss), the currents active when they end, and how
// often each current is there at the end against how often it's met.
//
// Options:
//   profile=none|upgraded|parted   only that profile
//   from=20                        start at that depth (as from a checkpoint:
//                                  its gold is paid first)
//   parts=id:level,...             the parted profile's parts
//   seed=123                       one dive with this seed (per crew and
//                                  profile), with a line per depth
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ABYSS, ENEMIES, HEROES } from '../../src/config.js';
import { Progress } from '../../src/systems/Progress.js';
import {
  depthBosses, depthCurrents, depthTypes, isBossDepth,
} from '../../src/systems/Abyss.js';
import {
  between, makeBattle, parseParts, payKills, playWave, seedRandom,
} from './simulate.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
const plain = args.filter((a) => !a.includes('='));
const CREWS = Number(plain[0] ?? 5);
const DIVES = Number(plain[1] ?? 3);
const PROFILES = flag('profile') ? [flag('profile')] : ['none', 'upgraded', 'parted'];
const FROM = Number(flag('from') ?? 1);
const ONE_SEED = flag('seed') != null ? Number(flag('seed')) : null;
const PARTED = parseParts(flag('parts') ?? 'kraken_figurehead:5,frostwing_sails:5,heartwood_cannons:5');
const MAX_TRIES = 30;
const MAX_DEPTH = 200;
const islandIds = ['skull_cove', 'ember_isle', 'frostbite_reef', 'fogbound_isle'];

// --- 1. Crews at the end of Fogbound Isle ---

function voyage(seed) {
  seedRandom(seed);
  const p = new Progress();
  const scene = makeBattle(p);
  payKills(scene, p);
  between(p, true);
  let skipped = 0;
  for (const id of islandIds) {
    if (p.islandId !== id) p.sailTo(id);
    while (p.wave <= p.island.waves) {
      let won = false;
      for (let tries = 0; !won && tries < MAX_TRIES; tries++) {
        ({ won } = playWave(scene, p));
        between(p, true);
      }
      if (won) continue;
      skipped++;
      if (p.isFinaleWave) p.record.cleared = true;
      p.advanceWave();
    }
  }
  return { seed, skipped, save: p.toSave() };
}

function crews() {
  const path = process.env.ABYSS_CACHE;
  const cached = path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  const list = [];
  for (let c = 0; c < CREWS; c++) {
    const seed = 1000 + c;
    if (!cached[seed]) {
      const t = Date.now();
      cached[seed] = voyage(seed);
      console.error(`crew ${seed}: ${Math.round((Date.now() - t) / 1000)}s, ${cached[seed].skipped} waves skipped`);
      if (path) writeFileSync(path, JSON.stringify(cached));
    }
    list.push(cached[seed]);
  }
  return list;
}

// "Keg Runner 52%, Sled Penguin 20%": the biggest shares of hull damage.
const sourceName = (key) => ENEMIES[key]?.name ?? key;
function shares(hurt, n = Infinity) {
  const total = Object.values(hurt).reduce((a, b) => a + b, 0);
  return Object.entries(hurt).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => `${sourceName(k)} ${Math.round(100 * v / total)}%`).join(', ') || '-';
}

// --- 2. Dives ---

// One dive from a crew's save: { reached, best: depths cleared, end: { boss,
// currents } , depths: [{ depth, won, time, hullLeft }] }.
function dive(save, profile, diveSeed, log = false) {
  seedRandom(diveSeed);
  const p = Progress.fromSave(save);
  if (profile === 'parted') {
    for (const [id, level] of Object.entries(PARTED)) {
      p.parts[id] = level;
      p.equipPart(id);
    }
  }
  const spend = profile !== 'none';
  // From a checkpoint (its gold paid first) as if the best depth opened it.
  if (FROM > 1) p.abyss.best = Math.max(p.abyss.best, FROM / ABYSS.checkpoints.share);
  if (p.startDive(FROM, diveSeed) == null) throw new Error(`can't start at depth ${FROM}`);
  if (spend) between(p, true);
  const scene = makeBattle(p);
  payKills(scene, p);
  // Hull damage by source this depth (charmed crew apart).
  let hurt = {};
  const takeDamage = scene.ship.takeDamage.bind(scene.ship);
  scene.ship.takeDamage = (amount, enemy, crewmate) => {
    const key = crewmate ? 'charmed crew' : enemy?.key ?? enemy?.def?.name ?? '?';
    hurt[key] = (hurt[key] ?? 0) + Math.min(amount, scene.ship.hp);
    takeDamage(amount, enemy, crewmate);
  };
  const depths = [];
  for (;;) {
    const depth = p.depth;
    hurt = {};
    const { won, time, hullLeft } = playWave(scene, p);
    depths.push({
      depth, won, time, hullLeft, hurt,
    });
    if (log) {
      const cur = depthCurrents(diveSeed, depth).active.join('+') || '-';
      const boss = depthBosses(diveSeed, depth).join('+');
      console.log(`  depth ${depth}: ${won ? 'won' : 'LOST'} in ${Math.round(time / 1000)}s, hull ${Math.round(hullLeft * 100)}%, `
        + `types ${depthTypes(diveSeed, depth).join('+')}, currents ${cur}${boss ? `, boss ${boss}` : ''}; hull hit by ${shares(hurt, 3)}`);
    }
    if (!won || p.depth > MAX_DEPTH) break;
    if (spend) between(p, true);
  }
  const reached = p.depth;
  p.endDive();
  return {
    reached,
    killers: hurt,
    boss: depthBosses(diveSeed, reached),
    currents: depthCurrents(diveSeed, reached).active,
    depths,
    crew: p.activeHeroes.map(({ id }) => `${HEROES[id].shortName} ${p.heroLevel(id)}`).join(', '),
    hull: p.hullHpLevel,
  };
}

// --- Report ---

const list = crews();
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const names = Object.fromEntries((JSON.parse(readFileSync(new URL('../../public/sprites/abyss/abyss.json', import.meta.url), 'utf8'))
  .currents.order).map((c) => [c.id, c.name]));
const currentName = (id) => names[id] ?? id;

if (ONE_SEED != null) {
  for (const crew of list) {
    for (const profile of PROFILES) {
      console.log(`crew ${crew.seed}, ${profile}, dive seed ${ONE_SEED}${FROM > 1 ? `, from ${FROM}` : ''}:`);
      const r = dive(crew.save, profile, ONE_SEED, true);
      console.log(`  reached depth ${r.reached}; hull LV ${r.hull}; crew ${r.crew}`);
    }
  }
  process.exit(0);
}

console.log(`### Crews (end of Fogbound Isle, greedy bot, no parts)\n`);
console.log('| Seed | Waves skipped | Hull LV (max HP) | Crew (level, stars) |');
console.log('|---:|---:|---|---|');
for (const c of list) {
  const p = Progress.fromSave(c.save);
  const crew = p.activeHeroes.map(({ id }) => `${HEROES[id].shortName} ${p.heroLevel(id)} ${p.heroStarCount(id)}★`).join(', ');
  console.log(`| ${c.seed} | ${c.skipped} | ${p.hullHpLevel} (${p.hullMaxHp.toLocaleString('en-US')}) | ${crew} |`);
}

const results = {};
for (const profile of PROFILES) {
  results[profile] = [];
  for (const crew of list) {
    for (let d = 0; d < DIVES; d++) {
      const seed = crew.seed * 1000 + d * 7 + 1;
      const t = Date.now();
      const r = dive(crew.save, profile, seed);
      results[profile].push({ crew: crew.seed, seed, ...r });
      console.error(`${profile} crew ${crew.seed} dive ${d + 1}: depth ${r.reached} (${Math.round((Date.now() - t) / 1000)}s)`);
    }
  }
}

const partsNote = Object.entries(PARTED).map(([id, l]) => `${id} ${l}`).join(', ');
console.log(`\n### Depth reached (${list.length} crews x ${DIVES} dives = ${list.length * DIVES} seeds each${FROM > 1 ? `, from depth ${FROM}` : ''})\n`);
console.log(`Parted: ${partsNote}.\n`);
console.log('| Profile | Average | Median | Range | Ended on a boss depth | Reached 100 | Dive time (avg, at x1) |');
console.log('|---|---:|---:|---|---:|---:|---:|');
for (const profile of PROFILES) {
  const rs = results[profile];
  const depths = rs.map((r) => r.reached).sort((a, b) => a - b);
  const onBoss = rs.filter((r) => isBossDepth(r.reached)).length;
  console.log(`| ${profile} | ${avg(depths).toFixed(1)} | ${depths[Math.floor(depths.length / 2)]} | ${depths[0]}–${depths[depths.length - 1]} | `
    + `${onBoss}/${rs.length} | ${rs.filter((r) => r.reached > 100).length} | `
    + `${Math.round(avg(rs.map((r) => r.depths.reduce((t, d) => t + d.time, 0))) / 60000)} min |`);
}

console.log('\n### Where dives end\n');
console.log('| Profile | Depths reached (sorted) | Bosses that ended dives | Currents at the end (most common combos) |');
console.log('|---|---|---|---|');
for (const profile of PROFILES) {
  const rs = results[profile];
  const bosses = {};
  const combos = {};
  for (const r of rs) {
    for (const b of r.boss) bosses[b] = (bosses[b] ?? 0) + 1;
    const combo = [...r.currents].sort().map(currentName).join(' + ') || 'none';
    combos[combo] = (combos[combo] ?? 0) + 1;
  }
  const top = (obj, n = 4, name = (k) => k) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => `${name(k)} ${v}`).join(', ') || '-';
  console.log(`| ${profile} | ${rs.map((r) => r.reached).sort((a, b) => a - b).join(' ')} | ${top(bosses, 7, (k) => ENEMIES[k].name)} | ${top(combos)} |`);
}

console.log('\n### What sinks the ship (hull damage in the depths that ended dives)\n');
for (const profile of PROFILES) {
  const all = {};
  for (const r of results[profile]) for (const [k, v] of Object.entries(r.killers)) all[k] = (all[k] ?? 0) + v / Math.max(1, Object.values(r.killers).reduce((a, b) => a + b, 0));
  console.log(`- ${profile}: ${shares(all, 6)}`);
}

// Each current: how many dives it was active at the end of, against how
// many depths it was active in (deaths per 100 depths met).
console.log('\n### Currents that end dives\n');
console.log('| Current | ' + PROFILES.map((p) => `${p}: at the end / depths met (per 100)`).join(' | ') + ' |');
console.log('|---|' + PROFILES.map(() => '---').join('|') + '|');
for (const id of ABYSS.currents.ids) {
  const cells = PROFILES.map((profile) => {
    const rs = results[profile];
    const ends = rs.filter((r) => r.currents.includes(id)).length;
    const met = rs.reduce((s, r) => s + r.depths.filter((d) => depthCurrents(r.seed, d.depth).active.includes(id)).length, 0);
    return `${ends} / ${met} (${met ? (100 * ends / met).toFixed(1) : '-'})`;
  });
  console.log(`| ${currentName(id)} | ${cells.join(' | ')} |`);
}

console.log('\n### Depth time and hull\n');
console.log('| Profile | Depths 1-10 avg s | 11-20 | 21-30 | 31-40 | 41-60 | Hull left on won depths (avg) |');
console.log('|---|---:|---:|---:|---:|---:|---:|');
for (const profile of PROFILES) {
  const ds = results[profile].flatMap((r) => r.depths);
  const band = (a, b) => {
    const xs = ds.filter((d) => d.won && d.depth >= a && d.depth <= b).map((d) => d.time / 1000);
    return xs.length ? avg(xs).toFixed(0) : '-';
  };
  const hull = avg(ds.filter((d) => d.won).map((d) => d.hullLeft));
  console.log(`| ${profile} | ${band(1, 10)} | ${band(11, 20)} | ${band(21, 30)} | ${band(31, 40)} | ${band(41, 60)} | ${Math.round(hull * 100)}% |`);
}
