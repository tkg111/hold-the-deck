// Pack crew balance check: `npm run sim:packs [-- seeds]`.
//
// Each new pack crewmate against an existing one of the same rarity and
// role, on its pack's island: the same crew (The Captain, The Duelist, the
// Storm Caller, the Sharpshooter, the Cannoneer and the Ghost Pirate, at 3
// stars) with the crewmate under test in slot 1 (beside The Captain), in
// place of the one it's compared with (or of the Ghost Pirate when that one
// isn't in the crew). Crew and hull levels follow the wave roughly as the
// greedy bot's do in `npm run sim -- 10 50 voyage` (LEVELS). Every sample
// wave is played once per seed, the boss waves included, from a fresh
// state each time. Per pair: wins, the crewmate's share of the crew's
// damage, and boss time-to-kill (from when it can first be hit to its
// death; a boss still alive counts the wave's time).
import { HEROES, PACKS } from '../../src/config.js';
import { BattleStats, totalDamage } from '../../src/systems/BattleStats.js';
import { Progress } from '../../src/systems/Progress.js';
import {
  makeBattle, payKills, playWave, seedRandom,
} from './simulate.mjs';

const SEEDS = Number(process.argv[2] ?? 3);
const BASE = ['captain', 'duelist', 'stormCaller', 'sharpshooter', 'cannoneer', 'ghostPirate'];
// Crew level by wave on each island (hull level = crew level x hullPerLevel).
const LEVELS = {
  skull_cove: (w) => Math.round(4 + 0.65 * w),
  ember_isle: (w) => Math.round(35 + 0.4 * w),
  fogbound_isle: (w) => Math.round(70 + 0.3 * w),
};
const HULL_PER_LEVEL = 1.3;
const WAVES = [5, 10, 15, 20, 25, 30, 35, 40, 45];
const PAIRS = [
  ['powderMonkey', 'shipsCook', 'skull_cove'],
  ['anchorBosun', 'harpooner', 'skull_cove'],
  ['fireBreather', 'grogBrewer', 'ember_isle'],
  ['whaler', 'harpooner', 'ember_isle'],
  ['blacksmith', 'sharpshooter', 'ember_isle'],
  ['auroraSeer', 'stormCaller', 'ember_isle'],
  ['banshee', 'harpooner', 'fogbound_isle'],
  ['boneCaller', 'duelist', 'fogbound_isle'],
];

function crewWith(subject, rival) {
  const rest = BASE.filter((id) => id !== subject && id !== rival);
  if (rest.length > 5) rest.splice(rest.indexOf('ghostPirate'), 1);
  // Slot 1 shares deck 1 with The Captain (slot 2).
  return [subject, 'captain', ...rest.filter((id) => id !== 'captain')].slice(0, 6);
}

function play(subject, crew, island, wave, seed) {
  seedRandom(seed);
  const p = new Progress();
  p.devSailTo(island);
  p.wave = wave;
  p.decks = 3;
  p.owned = [...new Set(['cabinBoy', ...crew])];
  const level = LEVELS[island](wave);
  p.slots = Array(6).fill(null);
  crew.forEach((id, i) => {
    p.slots[i] = id;
    p.heroLevels[id] = level;
    p.heroStars[id] = 3;
  });
  p.hullHpLevel = Math.round(level * HULL_PER_LEVEL);
  const scene = makeBattle(p);
  payKills(scene, p);
  scene.stats = new BattleStats();
  let started = false;
  const boss = { seen: null, dead: null };
  let now = 0;
  scene.events.on('enemy-killed', (e) => { if (e.def.boss) boss.dead ??= now; });
  const result = playWave(scene, p, (t) => {
    now = t;
    if (!started) {
      scene.stats.start(wave, island, scene.heroes);
      started = true;
    }
    for (const e of scene.enemies) {
      if (!e.def.boss) continue;
      if (boss.seen == null && e.targetable) boss.seen = t;
    }
  });
  const record = scene.stats.finish(result.won);
  const all = record.crew.reduce((s, c) => s + totalDamage(c), 0);
  const mine = record.crew.find((c) => c.id === subject);
  return {
    won: result.won,
    share: all ? totalDamage(mine) / all : 0,
    ttk: boss.seen != null ? (boss.dead ?? result.time) - boss.seen : null,
  };
}

const fmt = (n) => `${Math.round(n * 100)}%`;
console.log(`--- pack crew vs existing crew: ${SEEDS} seeds x waves ${WAVES.join(', ')} (stars 3, max ${PACKS.maxStars}) ---`);
for (const [fresh, rival, island] of PAIRS) {
  const rows = [];
  for (const subject of [fresh, rival]) {
    const crew = crewWith(subject, subject === fresh ? rival : fresh);
    const runs = [];
    for (let s = 0; s < SEEDS; s++) for (const w of WAVES) runs.push({ w, ...play(subject, crew, island, w, 5000 + s * 97 + w) });
    const wins = runs.filter((r) => r.won).length;
    const share = runs.reduce((a, r) => a + r.share, 0) / runs.length;
    const bossRuns = runs.filter((r) => r.ttk != null);
    const ttk = bossRuns.length ? bossRuns.reduce((a, r) => a + r.ttk, 0) / bossRuns.length / 1000 : null;
    const bossWins = bossRuns.filter((r) => r.won).length;
    rows.push(`  ${HEROES[subject].name.padEnd(16)} wins ${wins}/${runs.length}, damage share ${fmt(share)}, `
      + `boss waves ${bossWins}/${bossRuns.length} won, boss TTK ${ttk == null ? '-' : `${ttk.toFixed(1)}s`}`);
  }
  console.log(`${HEROES[fresh].name} vs ${HEROES[rival].name} (${island}):\n${rows.join('\n')}`);
}
