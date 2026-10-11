// Frostbite Reef balance check: `npm run sim:frost [-- seeds replays]`.
//
// 1. For each seed, the greedy bot from simulate.mjs sails the voyage from a
//    fresh save through Skull Cove and Ember Isle (finales included), with
//    up to MAX_TRIES tries a wave, and stops as it reaches Frostbite Reef:
//    the crew, decks and hull it has then are "a crew like Ember Isle wave
//    50 would have". Set FROST_CACHE to a file to keep these between runs
//    (they don't depend on Frostbite Reef's numbers).
// 2. Two profiles play Frostbite Reef from there, `replays` times per seed
//    with different luck. Both tap frozen crew free like a player (see TAP
//    in simulate.mjs).
//    - none:     that crew, with no further upgrades or chests, plays each
//                wave in WAVES on its own.
//    - upgraded: that crew sails on through waves 1-50 in order, spending
//                after every attempt like the greedy bot (chests with its
//                Pearls; with its gold, a deck if one's left, then always the
//                cheapest of hull and crew levels). A wave lost
//                UPGRADED_TRIES times in a row is skipped. Each wave in
//                WAVES reports its first attempt.
//    Per wave: wins, clear time, ship HP left, boss time-to-kill (from when
//    it can first be hit to its death, or the HP it had left), freezes
//    (blizzard / Wyrm / Giant), what hurt the hull most, and for lost waves
//    how long the ship lasted and how much of the wave it beat.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ENEMIES, HEROES, RARITY } from '../../src/config.js';
import { Hero } from '../../src/entities/Hero.js';
import { Progress } from '../../src/systems/Progress.js';
import { isBlizzardWave } from '../../src/systems/Blizzard.js';
import { isBossWave } from '../../src/systems/WaveManager.js';
import {
  between, makeBattle, playWave, run, seedRandom,
} from './simulate.mjs';

const SEEDS = Number(process.argv[2] ?? 5);
const REPLAYS = Number(process.argv[3] ?? 3);
const MAX_TRIES = 100;
const UPGRADED_TRIES = 5;
const ISLAND = 'frostbite_reef';
const WAVES = range(1, 50);
// Bands for the summary: [first, last].
const BANDS = [[1, 9], [10, 10], [11, 15], [16, 19], [20, 20], [21, 29], [30, 30], [31, 39], [40, 40], [41, 49], [50, 50]];
// The Frost Giant's waves, also played without the Ghost Pirate (upgraded).
const GIANT_WAVES = [20, 40];

function range(a, b) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }

// Freezes by cause, counted as they happen (tapped ones too).
const freezes = { blizzard: 0, wyrm: 0, giant: 0 };
const freeze = Hero.prototype.freeze;
Hero.prototype.freeze = function countedFreeze(ms, cause) {
  if (!this.isFrozen && cause in freezes) freezes[cause]++;
  return freeze.call(this, ms, cause);
};

// --- 1. Crews at the end of Ember Isle ---

function endOfEmber(seed) {
  const res = run(seed, 'greedy', {
    maxWave: 50, voyage: true, maxTries: MAX_TRIES, stopAt: (p) => p.islandId === ISLAND,
  });
  const p = res.progress;
  return {
    seed,
    save: p.toSave(),
    reached: p.islandId === ISLAND,
    losses: res.log.filter((l) => !l.won && l.island === 'ember_isle').length,
  };
}

const cachePath = process.env.FROST_CACHE;
const cached = cachePath && existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
const crews = [];
for (let s = 0; s < SEEDS; s++) {
  const seed = 1000 + s;
  const crew = cached[seed] ?? endOfEmber(seed);
  cached[seed] = crew;
  crew.p = Progress.fromSave(crew.save);
  crews.push(crew);
}
if (cachePath) writeFileSync(cachePath, JSON.stringify(cached, (k, v) => (k === 'p' ? undefined : v)));

// --- 2. One measured attempt at the current wave ---

function attempt(p) {
  const wave = p.wave;
  const scene = makeBattle(p);
  // Hull damage by enemy type.
  const hurt = {};
  const takeDamage = scene.ship.takeDamage.bind(scene.ship);
  scene.ship.takeDamage = (amount, enemy) => {
    const key = enemy?.key ?? enemy?.def?.name ?? '?';
    hurt[key] = (hurt[key] ?? 0) + Math.min(amount, scene.ship.hp);
    takeDamage(amount, enemy);
  };
  // Bosses: when each can first be hit, when it dies, and the HP it has left.
  // The Frost Giant also: ms it could be hit, and of those, afraid
  // (Haunt), pushed (Tidal Wave), stunned and slowed; px it was driven back;
  // whether it reached the ship, and its smashes.
  const bosses = new Map();
  let last = 0;
  const onStep = (time) => {
    const dt = time - last;
    last = time;
    for (const e of scene.waves.spawned) {
      if (!e?.def.boss) continue;
      if (!bosses.has(e)) {
        bosses.set(e, {
          key: e.key, from: null, to: null, x: e.x,
          giant: e.def.giant ? { up: 0, afraid: 0, pushed: 0, stunned: 0, slowed: 0, back: 0, reached: false, smashes: 0 } : null,
        });
      }
      const b = bosses.get(e);
      if (b.from == null && e.targetable) b.from = time;
      if (b.to == null && !e.alive) b.to = time;
      b.hpLeft = Math.max(0, e.hp) / e.maxHp;
      const g = b.giant;
      if (g && e.alive && e.targetable) {
        g.up += dt;
        if (e.isAfraid) g.afraid += dt;
        if (e.pushLeft > 0) g.pushed += dt;
        if (e.isStunned) g.stunned += dt;
        if (e.isSlowed) g.slowed += dt;
        if (e.x > b.x) g.back += e.x - b.x;
        if (e.phase === 'smash') g.reached = true;
        g.smashes = e.smashes;
      }
      b.x = e.x;
    }
  };
  for (const k of Object.keys(freezes)) freezes[k] = 0;
  const finale = p.isFinaleWave;
  const out = playWave(scene, p, onStep);
  // Share of the wave beaten: enemies dealt with (rams count) out of all it had.
  const left = scene.waves.queue.length + scene.enemies.filter((e) => e.alive && !e.def.hazard).length;
  const total = scene.waves.total;
  return {
    ...out,
    wave,
    beaten: total ? (total - left) / total : 1,
    freezes: { ...freezes },
    blizzard: finale || isBlizzardWave(wave, p.island),
    bosses: [...bosses.values()].map((b) => ({ ...b, ttk: b.from != null && b.to != null ? b.to - b.from : null })),
    hurt,
  };
}

// --- 3. The profiles ---

// A copy of the progress with the Ghost Pirate's slot given to the best
// crewmate not on the ship (rarity, then damage), brought up to the Ghost
// Pirate's level, stars and Bonus Levels so only the kit differs.
const RANK = Object.keys(RARITY);
function withoutGhost(p) {
  const q = Progress.fromSave(p.toSave());
  const slot = q.slots.indexOf('ghostPirate');
  if (slot === -1) return q;
  const bench = q.ownedHeroes.filter((id) => !q.slots.includes(id) && !HEROES[id].aura)
    .sort((a, b) => RANK.indexOf(HEROES[b].rarity) - RANK.indexOf(HEROES[a].rarity) || q.heroDamage(b) - q.heroDamage(a));
  const sub = bench[0];
  if (!sub) return q;
  q.slots[slot] = sub;
  q.heroLevels[sub] = q.heroLevel('ghostPirate');
  q.heroStars[sub] = q.heroStarCount('ghostPirate');
  q.heroBonus[sub] = q.heroBonusLevels('ghostPirate');
  q.subFor = sub;
  return q;
}

const results = { none: new Map(), upgraded: new Map(), noGhost: new Map() };   // wave -> [attempt]
const record = (profile, a) => {
  if (!WAVES.includes(a.wave)) return;
  results[profile] ??= new Map();
  const list = results[profile].get(a.wave) ?? [];
  list.push(a);
  results[profile].set(a.wave, list);
};
const upgradedEnd = [];

for (const crew of crews) {
  if (!crew.reached) continue;
  for (let r = 0; r < REPLAYS; r++) {
    // No upgrades: each wave on its own.
    for (const wave of WAVES) {
      seedRandom(crew.seed * 1000 + wave * 10 + r);
      const p = Progress.fromSave(crew.save);
      p.sailTo(ISLAND);
      p.wave = wave;
      record('none', attempt(p));
    }
    // Upgraded: on through the island, spending after every attempt. Each
    // attempt has its own seed, so a change to one wave doesn't reshuffle
    // the luck of the waves after it.
    const p = Progress.fromSave(crew.save);
    p.sailTo(ISLAND);
    let skipped = 0;
    while (p.wave <= 50) {
      const wave = p.wave;
      let won = false;
      for (let t = 0; t < UPGRADED_TRIES && !won; t++) {
        const seed = crew.seed * 100000 + r * 1000 + wave * 10 + t + 7;
        if (t === 0 && GIANT_WAVES.includes(wave)) {
          // The same attempt (same luck) without the Ghost Pirate.
          seedRandom(seed);
          const q = withoutGhost(p);
          record('noGhost', { ...attempt(q), sub: q.subFor });
        }
        seedRandom(seed);
        const a = attempt(p);
        if (t === 0) record('upgraded', a);   // retries aren't reported
        won = a.won;
        between(p, true);
      }
      if (won) continue;   // winning moved it on
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
const name = (key) => ENEMIES[key]?.name ?? key;
const crewLine = (p) => p.activeHeroes
  .map(({ id }) => `${HEROES[id].shortName} ${p.heroLevel(id)} ${p.heroStarCount(id)}★`).join(', ');

console.log('### Crews used (greedy bot, end of Ember Isle)\n');
console.log('| Seed | Reached Frostbite Reef | Ember losses | Hull LV (max HP) | Decks | Crew (level, stars) |');
console.log('|---:|---|---:|---|---:|---|');
for (const c of crews) {
  console.log(`| ${c.seed} | ${c.reached ? 'yes' : 'no'} | ${c.losses} | ${c.p.hullHpLevel} (${c.p.hullMaxHp}) | ${c.p.decks} | ${crewLine(c.p)} |`);
}

function waveTable(profile) {
  console.log('| Wave | Won | Clear time s (avg, range) | Ship HP left (avg, range) | Lost: sunk after s / wave beaten | Freezes: blizzard / Wyrm / Giant | Boss time-to-kill s (avg, range) | Most hull damage from |');
  console.log('|---:|---|---|---|---|---|---|---|');
  for (const wave of WAVES) {
    const list = results[profile].get(wave) ?? [];
    if (!list.length) continue;
    const won = list.filter((a) => a.won);
    const clear = won.map((a) => a.time);
    const hp = list.map((a) => a.hullLeft);
    const lost = list.filter((a) => !a.won);
    const lostCell = lost.length ? `${sec(avg(lost.map((a) => a.time)))} / ${pct(avg(lost.map((a) => a.beaten)))}` : '-';
    const fz = (k) => avg(list.map((a) => a.freezes[k])).toFixed(1);
    const bossKeys = [...new Set(list.flatMap((a) => a.bosses.map((b) => b.key)))];
    const bossCell = bossKeys.map((k) => {
      const ttks = list.flatMap((a) => a.bosses.filter((b) => b.key === k && b.ttk != null).map((b) => b.ttk));
      const survived = list.flatMap((a) => a.bosses.filter((b) => b.key === k && b.ttk == null).map((b) => b.hpLeft));
      const killed = ttks.length ? `${sec(avg(ttks))} (${span(ttks, sec)})` : 'never killed';
      return `${name(k)}: ${killed}${survived.length ? `; alive ${survived.length}x with ${pct(avg(survived))} HP left` : ''}`;
    }).join('; ') || '-';
    const hurt = {};
    for (const a of list) for (const [k, v] of Object.entries(a.hurt)) hurt[k] = (hurt[k] ?? 0) + v;
    const total = Object.values(hurt).reduce((a, b) => a + b, 0);
    const top = Object.entries(hurt).sort((a, b) => b[1] - a[1]).slice(0, 2)
      .map(([k, v]) => `${name(k)} ${Math.round(100 * v / total)}%`).join(', ') || '-';
    const blizzard = list[0]?.blizzard ? ' ❄' : '';
    console.log(`| ${wave}${blizzard} | ${won.length}/${list.length} | ${sec(avg(clear))} (${span(clear, sec)}) | `
      + `${pct(avg(hp))} (${span(hp, pct)}) | ${lostCell} | ${fz('blizzard')} / ${fz('wyrm')} / ${fz('giant')} | ${bossCell} | ${top} |`);
  }
}

for (const profile of ['none', 'upgraded', 'noGhost']) {
  const runs = [...results[profile].values()][0]?.length ?? 0;
  console.log(`\n### Waves, profile "${profile}" (${runs} attempts per wave)\n`);
  waveTable(profile);
}

// Side by side against the target bands.
console.log('\n### Summary by band (wins out of attempts)\n');
console.log('| Waves | No upgrades | Upgraded | Upgraded hull lost (avg) |');
console.log('|---|---|---|---|');
for (const [a, b] of BANDS) {
  const cell = (profile) => range(a, b).map((w) => {
    const list = results[profile].get(w) ?? [];
    return `${w}: ${list.filter((x) => x.won).length}`;
  }).join(', ');
  const lost = range(a, b).map((w) => pct(1 - avg((results.upgraded.get(w) ?? []).map((x) => x.hullLeft)))).join(', ');
  console.log(`| ${a === b ? a : `${a}–${b}`} | ${cell('none')} | ${cell('upgraded')} | ${lost} |`);
}

// The Frost Giant's fights.
console.log('\n### Frost Giant fights\n');
console.log('| Wave | Profile | Won | Reached the ship | Smashes | In reach s | Afraid (Haunt) | Pushed (Tidal Wave) | Stunned | Slowed | Driven back px |');
console.log('|---:|---|---|---|---:|---:|---|---|---|---|---:|');
const subs = {};
for (const a of [...results.noGhost.values()].flat()) subs[a.sub] = (subs[a.sub] ?? 0) + 1;
for (const w of GIANT_WAVES) {
  for (const profile of ['none', 'upgraded', 'noGhost']) {
    const list = results[profile].get(w) ?? [];
    const gs = list.flatMap((a) => a.bosses.filter((b) => b.giant).map((b) => b.giant));
    if (!gs.length) continue;
    const share = (k) => pct(avg(gs.map((g) => (g.up ? g[k] / g.up : 0))));
    console.log(`| ${w} | ${profile} | ${list.filter((x) => x.won).length}/${list.length} | ${gs.filter((g) => g.reached).length}/${gs.length} | `
      + `${avg(gs.map((g) => g.smashes)).toFixed(1)} | ${sec(avg(gs.map((g) => g.up)))} | ${share('afraid')} | ${share('pushed')} | `
      + `${share('stunned')} | ${share('slowed')} | ${Math.round(avg(gs.map((g) => g.back)))} |`);
  }
}

console.log('\nnoGhost: the upgraded crew with the Ghost Pirate swapped for', Object.entries(subs).map(([k, n]) => `${HEROES[k]?.name ?? k} (${n}x)`).join(', '), 'at his level and stars, same luck.');

// Freezes per wave: blizzard waves (not the finale) and the Wyrm's waves.
console.log('\n### Freezes per wave (all causes, tapped ones included)\n');
console.log('| | No upgrades | Upgraded |');
console.log('|---|---|---|');
const freezeAvg = (profile, pick) => {
  const list = [...results[profile].values()].flat().filter(pick);
  return avg(list.map((a) => a.freezes.blizzard + a.freezes.wyrm + a.freezes.giant)).toFixed(1);
};
const blizzardWave = (a) => a.blizzard && a.wave !== 50;
const wyrmWave = (a) => isBossWave(a.wave) && a.bosses.some((b) => b.key === 'frostWyrm') && a.wave !== 50;
console.log(`| Blizzard waves | ${freezeAvg('none', blizzardWave)} | ${freezeAvg('upgraded', blizzardWave)} |`);
console.log(`| Wyrm waves (10, 30) | ${freezeAvg('none', wyrmWave)} | ${freezeAvg('upgraded', wyrmWave)} |`);

// The finale: did both bosses take damage?
console.log('\n### Finale bosses\n');
for (const profile of ['none', 'upgraded']) {
  const list = results[profile].get(50) ?? [];
  const both = list.filter((a) => a.bosses.length === 2 && a.bosses.every((b) => b.ttk != null || b.hpLeft < 1)).length;
  const hp = (k) => pct(avg(list.flatMap((a) => a.bosses.filter((b) => b.key === k).map((b) => (b.ttk != null ? 0 : b.hpLeft)))));
  console.log(`- ${profile}: both bosses hurt in ${both}/${list.length}; HP left on average: Wyrm ${hp('frostWyrm')}, Giant ${hp('frostGiant')}`);
}

console.log('\n### Upgraded runs at the end of Frostbite Reef\n');
console.log('| Seed | Run | Waves skipped (lost 5x) | Hull LV (max HP) | Crew (level, stars) |');
console.log('|---:|---:|---:|---|---|');
for (const u of upgradedEnd) {
  console.log(`| ${u.seed} | ${u.r + 1} | ${u.skipped} | ${u.p.hullHpLevel} (${u.p.hullMaxHp}) | ${crewLine(u.p)} |`);
}
