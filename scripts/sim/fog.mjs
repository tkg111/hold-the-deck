// Fogbound Isle balance check: `npm run sim:fog [-- seeds replays]`.
//
// 1. For each seed, a crew like Frostbite Reef wave 50 would have: the
//    greedy bot from simulate.mjs sails Skull Cove and Ember Isle from a
//    fresh save (up to MAX_TRIES tries a wave, as in frost.mjs; set
//    FROST_CACHE to reuse frost.mjs's end-of-Ember crews), then plays
//    Frostbite Reef waves 1-50 like frost.mjs's upgraded profile (its first
//    replay, with the same seeds): spending after every attempt, a wave lost
//    UPGRADED_TRIES times in a row skipped. If it loses the finale it's
//    marked cleared anyway, and the ship sails on. Set FOG_CACHE to a file to
//    keep these crews between runs (they don't depend on Fogbound Isle).
// 2. Two profiles play Fogbound Isle from there, `replays` times per seed
//    with different luck, both tapping frozen and charmed crew free like a
//    player (TAP in simulate.mjs):
//    - none:     that crew, with no further upgrades or chests, plays each
//                wave on its own.
//    - upgraded: that crew sails on through waves 1-50 in order, spending
//                after every attempt like the greedy bot; a wave lost
//                UPGRADED_TRIES times in a row is skipped. Each wave reports
//                its first attempt; each attempt has its own seed.
//    Per wave: wins, clear time, ship HP left, boss time-to-kill (from when
//    it can first be hit to its death, or the HP it had left), charms, and
//    hull damage by source (charmed crew apart from the Siren Queen's waves,
//    Blackbones' slashes apart from his flintlock), and for lost waves how
//    long the ship lasted and how much of the wave it beat.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ENEMIES, HEROES } from '../../src/config.js';
import { Enemy } from '../../src/entities/Enemy.js';
import { Hero } from '../../src/entities/Hero.js';
import { Progress } from '../../src/systems/Progress.js';
import { isFogBankWave } from '../../src/systems/Mists.js';
import {
  between, makeBattle, playWave, run, seedRandom,
} from './simulate.mjs';

const SEEDS = Number(process.argv[2] ?? 5);
const REPLAYS = Number(process.argv[3] ?? 3);
const MAX_TRIES = 100;
const UPGRADED_TRIES = 5;
const FROST = 'frostbite_reef';
const ISLAND = 'fogbound_isle';
const WAVES = range(1, 50);
const BOSS_WAVES = [10, 20, 30, 40, 50];
// Bands for the summary: [first, last].
const BANDS = [[1, 9], [10, 10], [11, 19], [20, 20], [21, 27], [28, 42], [43, 49], [50, 50]];

function range(a, b) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }

// Charms as they land (tapped ones too).
let charms = 0;
const charm = Hero.prototype.charm;
Hero.prototype.charm = function countedCharm(ms, charmer) {
  const fresh = !this.isCharmed;
  const r = charm.call(this, ms, charmer);
  if (fresh && this.isCharmed) charms++;
  return r;
};
// Blackbones' slash and flintlock, told apart in the hull damage.
let via = null;
for (const [method, label] of [['slash', 'slash'], ['fireFlintlock', 'flintlock']]) {
  const original = Enemy.prototype[method];
  Enemy.prototype[method] = function tagged(...args) {
    via = label;
    try { return original.apply(this, args); } finally { via = null; }
  };
}

// --- 1. Crews at the end of Frostbite Reef ---

function endOfEmber(seed) {
  const res = run(seed, 'greedy', {
    maxWave: 50, voyage: true, maxTries: MAX_TRIES, stopAt: (p) => p.islandId === FROST,
  });
  const p = res.progress;
  return { seed, save: p.toSave(), reached: p.islandId === FROST };
}

// frost.mjs's upgraded profile, first replay: the same seeds per attempt.
function throughFrostbite(seed, save) {
  const p = Progress.fromSave(save);
  p.sailTo(FROST);
  let skipped = 0;
  while (p.wave <= 50) {
    const wave = p.wave;
    let won = false;
    for (let t = 0; t < UPGRADED_TRIES && !won; t++) {
      seedRandom(seed * 100000 + wave * 10 + t + 7);
      won = playWave(makeBattle(p), p).won;
      between(p, true);
    }
    if (won) continue;
    if (wave === 50) break;
    skipped++;
    p.advanceWave();
  }
  const clearedFrost = p.isIslandCleared(FROST);
  p.islands[FROST].cleared = true;
  p.sailTo(ISLAND);
  return { save: p.toSave(), skipped, clearedFrost };
}

const frostCache = process.env.FROST_CACHE && existsSync(process.env.FROST_CACHE)
  ? JSON.parse(readFileSync(process.env.FROST_CACHE, 'utf8')) : {};
const cachePath = process.env.FOG_CACHE;
const cached = cachePath && existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
const crews = [];
for (let s = 0; s < SEEDS; s++) {
  const seed = 1000 + s;
  let crew = cached[seed];
  if (!crew) {
    const ember = frostCache[seed] ?? endOfEmber(seed);
    crew = ember.reached ? { seed, ...throughFrostbite(seed, ember.save) } : { seed, save: ember.save, reached: false };
    crew.reached ??= true;
  }
  cached[seed] = crew;
  crew.p = Progress.fromSave(crew.save);
  crews.push(crew);
}
if (cachePath) writeFileSync(cachePath, JSON.stringify(cached, (k, v) => (k === 'p' ? undefined : v)));

// --- 2. One measured attempt at the current wave ---

function attempt(p) {
  const wave = p.wave;
  const scene = makeBattle(p);
  // Hull damage by source.
  const hurt = {};
  const takeDamage = scene.ship.takeDamage.bind(scene.ship);
  scene.ship.takeDamage = (amount, enemy, crewmate) => {
    let key = enemy?.key ?? enemy?.def?.name ?? '?';
    if (crewmate) key = 'charmed crew';
    else if (via) key = `${key}:${via}`;
    hurt[key] = (hurt[key] ?? 0) + Math.min(amount, scene.ship.hp);
    takeDamage(amount, enemy, crewmate);
  };
  // Bosses: when each can first be hit, when it dies, and the HP it has left.
  const bosses = new Map();
  const onStep = (time) => {
    for (const e of scene.waves.spawned) {
      if (!e?.def.boss) continue;
      if (!bosses.has(e)) bosses.set(e, { key: e.key, from: null, to: null });
      const b = bosses.get(e);
      if (b.from == null && e.targetable) b.from = time;
      if (b.to == null && !e.alive) b.to = time;
      b.hpLeft = Math.max(0, e.hp) / e.maxHp;
    }
  };
  charms = 0;
  const finale = p.isFinaleWave;
  const out = playWave(scene, p, onStep);
  const left = scene.waves.queue.length + scene.enemies.filter((e) => e.alive && !e.def.hazard).length;
  const total = scene.waves.total;
  return {
    ...out,
    wave,
    beaten: total ? (total - left) / total : 1,
    charms,
    fogBank: finale || isFogBankWave(wave, p.island),
    bosses: [...bosses.values()].map((b) => ({ ...b, ttk: b.from != null && b.to != null ? b.to - b.from : null })),
    hurt,
  };
}

// --- 3. The profiles ---

const results = { none: new Map(), upgraded: new Map() };   // wave -> [attempt]
const record = (profile, a) => {
  const list = results[profile].get(a.wave) ?? [];
  list.push(a);
  results[profile].set(a.wave, list);
};
const upgradedEnd = [];

for (const crew of crews) {
  if (!crew.reached) continue;
  for (let r = 0; r < REPLAYS; r++) {
    for (const wave of WAVES) {
      seedRandom(crew.seed * 1000 + wave * 10 + r);
      const p = Progress.fromSave(crew.save);
      p.sailTo(ISLAND);
      p.wave = wave;
      record('none', attempt(p));
    }
    const p = Progress.fromSave(crew.save);
    p.sailTo(ISLAND);
    let skipped = 0;
    while (p.wave <= 50) {
      const wave = p.wave;
      let won = false;
      for (let t = 0; t < UPGRADED_TRIES && !won; t++) {
        seedRandom(crew.seed * 100000 + r * 1000 + wave * 10 + t + 7);
        const a = attempt(p);
        if (t === 0) record('upgraded', a);
        won = a.won;
        between(p, true);
      }
      if (won) continue;
      if (wave === 50) break;
      skipped++;
      p.advanceWave();
    }
    upgradedEnd.push({ seed: crew.seed, r, p, skipped });
  }
}

// --- Report (markdown) ---

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sec = (ms) => (Number.isFinite(ms) ? `${Math.round(ms / 1000)}` : '-');
const pct = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '-');
const span = (xs, f) => (xs.length ? `${f(Math.min(...xs))}–${f(Math.max(...xs))}` : '-');
const SOURCE_NAMES = {
  'charmed crew': 'charmed crew',
  'sirenQueen': 'Siren Queen (waves)',
  'captainBlackbones:slash': 'Blackbones (slash)',
  'captainBlackbones:flintlock': 'Blackbones (flintlock)',
};
const name = (key) => SOURCE_NAMES[key] ?? ENEMIES[key]?.name ?? key;
const crewLine = (p) => p.activeHeroes
  .map(({ id }) => `${HEROES[id].shortName} ${p.heroLevel(id)} ${p.heroStarCount(id)}★`).join(', ');
const sumHurt = (list) => {
  const hurt = {};
  for (const a of list) for (const [k, v] of Object.entries(a.hurt)) hurt[k] = (hurt[k] ?? 0) + v;
  return hurt;
};
const shares = (hurt, n = Infinity) => {
  const total = Object.values(hurt).reduce((a, b) => a + b, 0);
  return Object.entries(hurt).sort((a, b) => b[1] - a[1]).slice(0, n)
    .map(([k, v]) => `${name(k)} ${Math.round(100 * v / total)}%`).join(', ') || '-';
};
const bossCell = (list) => [...new Set(list.flatMap((a) => a.bosses.map((b) => b.key)))].map((k) => {
  const ttks = list.flatMap((a) => a.bosses.filter((b) => b.key === k && b.ttk != null).map((b) => b.ttk));
  const survived = list.flatMap((a) => a.bosses.filter((b) => b.key === k && b.ttk == null).map((b) => b.hpLeft));
  const killed = ttks.length ? `${sec(avg(ttks))} (${span(ttks, sec)})` : 'never killed';
  return `${name(k)}: ${killed}${survived.length ? `; alive ${survived.length}x with ${pct(avg(survived))} HP left` : ''}`;
}).join('; ') || '-';

console.log('### Crews used (end of Frostbite Reef)\n');
console.log('| Seed | Frostbite waves skipped | Frostbite finale won | Hull LV (max HP) | Decks | Crew (level, stars) |');
console.log('|---:|---:|---|---|---:|---|');
for (const c of crews) {
  console.log(`| ${c.seed} | ${c.skipped ?? '-'} | ${c.clearedFrost ? 'yes' : 'no'} | ${c.p.hullHpLevel} (${c.p.hullMaxHp}) | ${c.p.decks} | ${crewLine(c.p)} |`);
}

function waveTable(profile) {
  console.log('| Wave | Won | Clear time s (avg, range) | Ship HP left (avg, range) | Lost: sunk after s / wave beaten | Charms | Boss time-to-kill s (avg, range) | Most hull damage from |');
  console.log('|---:|---|---|---|---|---:|---|---|');
  for (const wave of WAVES) {
    const list = results[profile].get(wave) ?? [];
    if (!list.length) continue;
    const won = list.filter((a) => a.won);
    const clear = won.map((a) => a.time);
    const hp = list.map((a) => a.hullLeft);
    const lost = list.filter((a) => !a.won);
    const lostCell = lost.length ? `${sec(avg(lost.map((a) => a.time)))} / ${pct(avg(lost.map((a) => a.beaten)))}` : '-';
    const fog = list[0]?.fogBank ? ' ☁' : '';
    console.log(`| ${wave}${fog} | ${won.length}/${list.length} | ${sec(avg(clear))} (${span(clear, sec)}) | `
      + `${pct(avg(hp))} (${span(hp, pct)}) | ${lostCell} | ${avg(list.map((a) => a.charms)).toFixed(1)} | `
      + `${bossCell(list)} | ${shares(sumHurt(list), 2)} |`);
  }
}

for (const profile of ['none', 'upgraded']) {
  const runs = [...results[profile].values()][0]?.length ?? 0;
  console.log(`\n### Waves, profile "${profile}" (${runs} attempts per wave)\n`);
  waveTable(profile);
}

console.log('\n### Summary by band (wins out of attempts)\n');
console.log('| Waves | No upgrades | Upgraded | No upgrades hull lost (avg) | Upgraded hull lost (avg) |');
console.log('|---|---|---|---|---|');
for (const [a, b] of BANDS) {
  const cell = (profile) => range(a, b).map((w) => `${w}: ${(results[profile].get(w) ?? []).filter((x) => x.won).length}`).join(', ');
  const lost = (profile) => range(a, b).map((w) => pct(1 - avg((results[profile].get(w) ?? []).map((x) => x.hullLeft)))).join(', ');
  console.log(`| ${a === b ? a : `${a}–${b}`} | ${cell('none')} | ${cell('upgraded')} | ${lost('none')} | ${lost('upgraded')} |`);
}

console.log('\n### Boss fights\n');
console.log('| Wave | Profile | Won | Time-to-kill s (avg, range) | Charms | Hull damage by source |');
console.log('|---:|---|---|---|---:|---|');
for (const w of BOSS_WAVES) {
  for (const profile of ['none', 'upgraded']) {
    const list = results[profile].get(w) ?? [];
    if (!list.length) continue;
    console.log(`| ${w} | ${profile} | ${list.filter((x) => x.won).length}/${list.length} | ${bossCell(list)} | `
      + `${avg(list.map((a) => a.charms)).toFixed(1)} | ${shares(sumHurt(list))} |`);
  }
}

console.log('\n### Charms per wave\n');
console.log('| | No upgrades | Upgraded |');
console.log('|---|---|---|');
const charmAvg = (profile, waves) => avg(waves.flatMap((w) => (results[profile].get(w) ?? []).map((a) => a.charms))).toFixed(1);
for (const [label, waves] of [['Siren Queen waves (10, 30)', [10, 30]], ['Finale (50)', [50]]]) {
  console.log(`| ${label} | ${charmAvg('none', waves)} | ${charmAvg('upgraded', waves)} |`);
}

console.log('\n### Hull damage by source, whole island\n');
for (const profile of ['none', 'upgraded']) {
  console.log(`- ${profile}: ${shares(sumHurt([...results[profile].values()].flat()))}`);
}

console.log('\n### Finale bosses\n');
for (const profile of ['none', 'upgraded']) {
  const list = results[profile].get(50) ?? [];
  const hurtBoss = (b) => b.ttk != null || b.hpLeft < 1;
  const both = list.filter((a) => a.bosses.length === 2 && a.bosses.every(hurtBoss)).length;
  const hp = (k) => pct(avg(list.flatMap((a) => a.bosses.filter((b) => b.key === k).map((b) => (b.ttk != null ? 0 : b.hpLeft)))));
  console.log(`- ${profile}: both bosses hurt in ${both}/${list.length}; HP left on average: Siren Queen ${hp('sirenQueen')}, Blackbones ${hp('captainBlackbones')}`);
}

console.log('\n### Upgraded runs at the end of Fogbound Isle\n');
console.log('| Seed | Run | Waves skipped (lost 5x) | Hull LV (max HP) | Crew (level, stars) |');
console.log('|---:|---:|---:|---|---|');
for (const u of upgradedEnd) {
  console.log(`| ${u.seed} | ${u.r + 1} | ${u.skipped} | ${u.p.hullHpLevel} (${u.p.hullMaxHp}) | ${crewLine(u.p)} |`);
}
