// Ship parts and Boss Hunts balance check: `npm run sim:parts [-- seeds trials]`.
//
// 1. Crews: for each seed, the greedy bot from simulate.mjs sails all four
//    islands from a fresh save, spending after every attempt; a wave lost
//    MAX_TRIES times in a row is skipped (a skipped finale counts as
//    cleared, so the ship sails on). Before the first attempt of every boss
//    wave (10, 20, 30, 40 and the finale, 50) and of each island's wave 1 it
//    keeps a copy of the save. No parts are ever made on the way. Set
//    PARTS_CACHE to a file to keep these crews between runs.
// 2. Parts: each boss wave is replayed `trials` times per seed with no part,
//    then with each of its island's parts (the parts made from its bosses'
//    materials) at level 1 and level 5, for two crews:
//    - on pace: the crew as it was at that wave;
//    - behind:  the crew from 10 waves earlier (wave 1's for wave 10)
//               fighting that wave, so wins aren't a given.
//    Per config: wins, boss time-to-kill (from when the first boss can be
//    hit to the last one's death, over the wins) and hull lost (a loss is
//    100%).
// 3. Hunts: with the crew that sails on from each island (its state when it
//    reaches the next island's wave 1; the last island's at the end), each
//    of that island's bosses is hunted from level 1 until it's lost
//    HUNT_TRIES times in a row at one level. Reports the highest level won
//    and how many hunts it took to gather the material to max a part (all on
//    one day: the first HUNTS.dailyDoubles wins doubled).
// 4. Costs: each part's gold per level against the gold the bot made per
//    wave on its boss's island.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  ENEMIES, HUNTS, ISLANDS, PARTS,
} from '../../src/config.js';
import { Progress } from '../../src/systems/Progress.js';
import { materialOf, partCost, PART_DATA } from '../../src/systems/Parts.js';
import { islandContent } from '../../src/systems/WaveManager.js';
import {
  between, equipParts, makeBattle, payKills, playWave, seedRandom,
} from './simulate.mjs';

const SEEDS = Number(process.argv[2] ?? 3);
const TRIALS = Number(process.argv[3] ?? 3);
// only=kraken_figurehead,frostwing_sails: test just those parts (no hunts);
// hunts: just the Boss Hunts (no part trials).
const ONLY = process.argv.slice(4).find((a) => a.startsWith('only='))?.slice(5).split(',') ?? null;
const HUNTS_ONLY = process.argv.slice(4).includes('hunts');
const MAX_TRIES = 30;
const HUNT_TRIES = 3;
const MAX_HUNT_LEVEL = 60;
const BOSS_WAVES = [10, 20, 30, 40, 50];
const islands = ISLANDS.filter((i) => i.available);

// --- 1. Crews ---

function voyage(seed) {
  seedRandom(seed);
  const p = new Progress();
  const scene = makeBattle(p);
  payKills(scene, p);
  // Gold per wave won, per island (for the cost table).
  let earned = 0;
  const earnGold = p.earnGold.bind(p);
  p.earnGold = (n) => { earned += n; return earnGold(n); };
  const gold = {};
  const snaps = {};
  const materialsAtEnd = {};
  between(p, true);
  for (const island of islands) {
    if (p.islandId !== island.id) p.sailTo(island.id);
    snaps[`${island.id}:sail`] = p.toSave();
    while (p.wave <= island.waves) {
      const wave = p.wave;
      if (wave === 1 || BOSS_WAVES.includes(wave)) snaps[`${island.id}:${wave}`] ??= p.toSave();
      let won = false;
      for (let tries = 0; !won && tries < MAX_TRIES; tries++) {
        earned = 0;
        ({ won } = playWave(scene, p));
        if (won) (gold[island.id] ??= []).push(earned);
        between(p, true);
      }
      if (!won) {
        if (p.isFinaleWave) p.record.cleared = true;
        p.advanceWave();
      }
    }
    materialsAtEnd[island.id] = { ...p.materials };
  }
  snaps.end = p.toSave();
  const avg = (list) => list.reduce((s, n) => s + n, 0) / Math.max(1, list.length);
  return {
    seed, snaps, materialsAtEnd, goldPerWave: Object.fromEntries(Object.entries(gold).map(([id, list]) => [id, avg(list)])),
  };
}

function crews() {
  const cache = process.env.PARTS_CACHE;
  if (cache && existsSync(cache)) return JSON.parse(readFileSync(cache, 'utf8'));
  const list = [];
  for (let s = 0; s < SEEDS; s++) {
    const t = Date.now();
    list.push(voyage(1000 + s));
    console.error(`crew ${1000 + s}: ${Math.round((Date.now() - t) / 1000)}s`);
  }
  if (cache) writeFileSync(cache, JSON.stringify(list));
  return list;
}

// --- 2. Parts on boss waves ---

// The parts made from an island's bosses' materials.
const islandParts = (islandId) => PART_DATA.parts.filter((part) => materialOf(part.material)?.island === islandId);

// One attempt at `wave` of `islandId` from a save, with these parts.
function attempt(save, islandId, wave, parts, seed) {
  seedRandom(seed);
  const p = Progress.fromSave(save);
  p.sailTo(islandId);
  p.wave = wave;
  equipParts(p, parts);
  const scene = makeBattle(p);
  payKills(scene, p);
  let now = 0;
  let firstHit = null;
  let lastDeath = 0;
  let bosses = 0;
  let downed = 0;
  const seen = new Set();
  scene.events.on('enemy-killed', (e) => {
    if (!e.def.boss) return;
    downed++;
    lastDeath = now;
  });
  const result = playWave(scene, p, (t) => {
    now = t;
    for (const e of scene.enemies) {
      if (!e.def.boss || seen.has(e)) continue;
      if (!e.targetable) continue;
      seen.add(e);
      bosses++;
      firstHit ??= t;
    }
  });
  const ttk = result.won && bosses && downed >= bosses ? lastDeath - firstHit : null;
  return { won: result.won, ttk, hullLost: result.won ? 1 - result.hullLeft : 1 };
}

function summarize(results) {
  const wins = results.filter((r) => r.won).length;
  const ttks = results.map((r) => r.ttk).filter((t) => t != null);
  return {
    n: results.length,
    wins,
    ttk: ttks.length ? ttks.reduce((s, t) => s + t, 0) / ttks.length : null,
    hull: results.reduce((s, r) => s + r.hullLost, 0) / results.length,
  };
}

function partTrials(list) {
  const rows = [];
  for (const island of islands) {
    const parts = islandParts(island.id).filter((p) => !ONLY || ONLY.includes(p.id));
    if (!parts.length) continue;
    const configs = [{ label: 'none', parts: {} }];
    for (const part of parts) {
      for (const level of [1, PARTS.maxLevel]) configs.push({ label: `${part.id} ${level}`, part: part.id, level, parts: { [part.id]: level } });
    }
    for (const wave of BOSS_WAVES) {
      for (const profile of ['on pace', 'behind']) {
        const from = profile === 'on pace' ? wave : Math.max(1, wave - 10);
        for (const config of configs) {
          const results = [];
          list.forEach((crew) => {
            const save = crew.snaps[`${island.id}:${from}`];
            if (!save) return;
            for (let t = 0; t < TRIALS; t++) {
              results.push(attempt(save, island.id, wave, config.parts, crew.seed * 100 + wave * 7 + t));
            }
          });
          rows.push({
            island: island.id, wave, profile, config: config.label, part: config.part ?? null, level: config.level ?? 0, ...summarize(results),
          });
        }
      }
      console.error(`parts: ${island.id} wave ${wave} done`);
    }
  }
  return rows;
}

// --- 3. Hunts ---

function hunts(list) {
  const rows = [];
  islands.forEach((island, i) => {
    const next = islands[i + 1];
    for (const boss of islandContent(island).bosses) {
      for (const crew of list) {
        const save = next ? crew.snaps[`${next.id}:sail`] : crew.snaps.end;
        if (!save) continue;
        const p = Progress.fromSave(save);
        p.sailTo(island.id);
        p.huntWins = {};
        p.huntDay = '';
        const scene = makeBattle(p);
        payKills(scene, p);
        const material = materialOf(PART_DATA.materials.find((m) => m.bossKey === boss)?.id)?.id;
        const start = p.materialCount(material);
        let played = 0;
        let lost = 0;
        let toMax = null;
        let seed = crew.seed * 1000;
        while (lost < HUNT_TRIES && p.huntLevel(boss) <= MAX_HUNT_LEVEL) {
          seedRandom(seed++);
          const { won } = playWave(scene, p, null, { hunt: boss });
          played++;
          lost = won ? 0 : lost + 1;
          if (toMax == null && p.materialCount(material) - start >= totalMaterial()) toMax = played;
        }
        rows.push({
          island: island.id, boss, seed: crew.seed, best: p.huntLevel(boss) - 1, played, toMax, fromWaves: start,
        });
      }
    }
  });
  return rows;
}

const totalMaterial = () => PARTS.material.reduce((s, n) => s + n, 0);

// Hunts to gather a part's worth of material from nothing, all won: with no
// doubles, and with the day's doubles first.
function huntsToMax(doubles) {
  let level = 1;
  let got = 0;
  let n = 0;
  while (got < totalMaterial()) {
    const count = HUNTS.dropBase + Math.floor(level / HUNTS.dropEvery);
    got += count * (n < doubles ? 2 : 1);
    level++;
    n++;
  }
  return n;
}

// --- Report ---

const list = crews();
const pct = (v) => `${Math.round(v * 100)}%`;
const secs = (ms) => (ms == null ? '-' : `${(ms / 1000).toFixed(1)}s`);
const name = (id) => PART_DATA.parts.find((p) => p.id === id)?.name ?? id;

if (!HUNTS_ONLY) {
console.log('## Parts on their own island\'s boss waves');
console.log(`(${list.length} crews x ${TRIALS} replays per wave and config)\n`);
const partRows = partTrials(list);
for (const island of islands) {
  console.log(`### ${island.name}\n`);
  console.log('| Wave | Crew | Config | Wins | Boss TTK | Hull lost |');
  console.log('|---:|---|---|---:|---:|---:|');
  for (const r of partRows.filter((x) => x.island === island.id)) {
    const config = r.part ? `${name(r.part)} ${r.level}` : 'no part';
    console.log(`| ${r.wave} | ${r.profile} | ${config} | ${r.wins}/${r.n} | ${secs(r.ttk)} | ${pct(r.hull)} |`);
  }
  console.log('');
}

// Each part against no part, over its island's five boss waves.
console.log('### Each part against no part (all five boss waves, both crews)\n');
console.log('| Part | Level | Wins (none -> part) | Boss TTK change | Hull lost (none -> part) |');
console.log('|---|---:|---|---:|---|');
for (const part of PART_DATA.parts) {
  if (ONLY && !ONLY.includes(part.id)) continue;
  const island = materialOf(part.material).island;
  for (const level of [1, PARTS.maxLevel]) {
    const mine = partRows.filter((r) => r.part === part.id && r.level === level);
    const base = partRows.filter((r) => r.island === island && !r.part);
    const sum = (rows, k) => rows.reduce((s, r) => s + r[k], 0);
    const pairs = mine.map((r) => [base.find((b) => b.wave === r.wave && b.profile === r.profile), r]).filter(([b]) => b);
    const ttkPairs = pairs.filter(([b, r]) => b.ttk != null && r.ttk != null);
    const ttkChange = ttkPairs.length
      ? ttkPairs.reduce((s, [b, r]) => s + r.ttk / b.ttk, 0) / ttkPairs.length - 1 : null;
    const n = sum(mine, 'n');
    console.log(`| ${part.name} | ${level} | ${sum(base, 'wins')}/${sum(base, 'n')} -> ${sum(mine, 'wins')}/${n} | `
      + `${ttkChange == null ? '-' : `${ttkChange > 0 ? '+' : ''}${Math.round(ttkChange * 100)}%`} | `
      + `${pct(sum(base, 'hull') / base.length)} -> ${pct(sum(mine, 'hull') / mine.length)} |`);
  }
}

}

if (!ONLY) {
console.log('\n## Boss Hunts\n');
console.log(`Material to max a part: ${totalMaterial()} (${PARTS.material.join(' + ')}).`);
console.log(`Hunts to gather it from nothing, all won: ${huntsToMax(0)} with no doubles, `
  + `${huntsToMax(HUNTS.dailyDoubles)} with the day's ${HUNTS.dailyDoubles} doubles first, ${huntsToMax(Infinity)} if every one were doubled.\n`);
const huntRows = hunts(list);
console.log('| Island | Boss | Material from its waves | Best hunt level won | Hunts played | Hunts to max a part |');
console.log('|---|---|---|---|---|---|');
for (const island of islands) {
  for (const boss of islandContent(island).bosses) {
    const rows = huntRows.filter((r) => r.boss === boss && r.island === island.id);
    const f = (k) => rows.map((r) => (r[k] == null ? '-' : r[k])).join(' / ');
    console.log(`| ${island.name} | ${ENEMIES[boss].name} | ${f('fromWaves')} | ${f('best')} | ${f('played')} | ${f('toMax')} |`);
  }
}

}

if (!ONLY && !HUNTS_ONLY) {
console.log('\n## Gold costs\n');
console.log('| Part | L1 | L2 | L3 | L4 | L5 | Bot gold per wave on its island | All 5 levels in waves of gold |');
console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
for (const part of PART_DATA.parts) {
  const island = materialOf(part.material).island;
  const costs = [1, 2, 3, 4, 5].map((l) => partCost(part.id, l).gold);
  const perWave = list.reduce((s, c) => s + (c.goldPerWave[island] ?? 0), 0) / list.length;
  const total = costs.reduce((s, n) => s + n, 0);
  const f = (n) => Math.round(n).toLocaleString('en-US');
  console.log(`| ${part.name} | ${costs.map(f).join(' | ')} | ${f(perWave)} | ${perWave ? (total / perWave).toFixed(1) : '-'} |`);
}
}
