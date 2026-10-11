// Frostbite Reef balance check: `npm run sim:frost [-- seeds replays]`.
//
// 1. For each seed, the greedy bot from simulate.mjs sails the voyage from a
//    fresh save through Skull Cove and Ember Isle (finales included), with
//    up to MAX_TRIES tries a wave, and stops as it reaches Frostbite Reef:
//    the crew, decks and hull it has then are "a crew like Ember Isle wave
//    50 would have".
// 2. That crew (no further upgrades or chests) plays each wave in WAVES,
//    `replays` times per seed with different luck. Per wave it reports wins,
//    clear time, ship HP left, boss time-to-kill (from when it can first be
//    hit to its death, or the HP it had left), freezes (blizzard / Wyrm /
//    Giant) and blizzards, what hurt the hull most, and for lost waves how
//    long the ship lasted and how much of the wave it beat.
// 3. For context, the greedy bot also carries on into Frostbite Reef as
//    usual (spending gold after every wave, up to 15 tries a wave).
import { ENEMIES, HEROES } from '../../src/config.js';
import { Hero } from '../../src/entities/Hero.js';
import { Progress } from '../../src/systems/Progress.js';
import { isBlizzardWave } from '../../src/systems/Blizzard.js';
import {
  makeBattle, playWave, run, seedRandom,
} from './simulate.mjs';

const SEEDS = Number(process.argv[2] ?? 5);
const REPLAYS = Number(process.argv[3] ?? 3);
const MAX_TRIES = 100;
const ISLAND = 'frostbite_reef';
const WAVES = [
  ...range(1, 10), ...range(18, 22), ...range(28, 32), ...range(38, 42), ...range(48, 50),
];

function range(a, b) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }

// Freezes by cause, counted as they happen.
const freezes = { blizzard: 0, wyrm: 0, giant: 0 };
const freeze = Hero.prototype.freeze;
Hero.prototype.freeze = function countedFreeze(ms, cause) {
  if (cause in freezes) freezes[cause]++;
  return freeze.call(this, ms, cause);
};

// --- 1. Crews at the end of Ember Isle ---

const crews = [];
for (let s = 0; s < SEEDS; s++) {
  const seed = 1000 + s;
  const res = run(seed, 'greedy', {
    maxWave: 50, voyage: true, maxTries: MAX_TRIES, stopAt: (p) => p.islandId === ISLAND,
  });
  const p = res.progress;
  const reached = p.islandId === ISLAND;
  const losses = res.log.filter((l) => !l.won && l.island === 'ember_isle').length;
  crews.push({ seed, save: p.toSave(), reached, losses, crew: res.crew, p });
  console.error(`seed ${seed}: ${reached ? 'reached Frostbite Reef' : `stuck at ${p.islandId} ${p.wave}`}, `
    + `${losses} Ember losses; hull LV ${p.hullHpLevel} (${p.hullMaxHp} HP), crew: ${res.crew}`);
}

// --- 2. Each wave with each crew ---

const results = new Map();   // wave -> [attempt]
for (const { seed, save, reached } of crews) {
  if (!reached) continue;
  for (const wave of WAVES) {
    for (let r = 0; r < REPLAYS; r++) {
      seedRandom(seed * 1000 + wave * 10 + r);
      const p = Progress.fromSave(save);
      p.sailTo(ISLAND);
      p.wave = wave;
      const scene = makeBattle(p);
      // Hull damage by enemy type.
      const hurt = {};
      const takeDamage = scene.ship.takeDamage.bind(scene.ship);
      scene.ship.takeDamage = (amount, enemy) => {
        const key = enemy?.key ?? enemy?.def?.name ?? '?';
        hurt[key] = (hurt[key] ?? 0) + Math.min(amount, scene.ship.hp);
        takeDamage(amount, enemy);
      };
      // Bosses: when each can first be hit, and when it dies.
      const bosses = new Map();   // enemy -> { key, from, to, hpLeft }
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
      for (const k of Object.keys(freezes)) freezes[k] = 0;
      const out = playWave(scene, p, onStep);
      // Share of the wave beaten: enemies that came in and were dealt with,
      // out of all it had (rams and kegs on the hull count as dealt with).
      const left = scene.waves.queue.length + scene.enemies.filter((e) => e.alive && !e.def.hazard).length;
      const total = scene.waves.total;
      const list = results.get(wave) ?? [];
      list.push({
        ...out,
        beaten: total ? (total - left) / total : 1,
        freezes: { ...freezes },
        blizzard: isBlizzardWave(wave, p.island) || !!p.island.finale && wave === p.island.finale.wave,
        bosses: [...bosses.values()].map((b) => ({ ...b, ttk: b.from != null && b.to != null ? b.to - b.from : null })),
        hurt,
      });
      results.set(wave, list);
    }
  }
}

// --- Report (markdown) ---

const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const sec = (ms) => (Number.isFinite(ms) ? `${Math.round(ms / 1000)}` : '-');
const pct = (x) => (Number.isFinite(x) ? `${Math.round(x * 100)}%` : '-');
const span = (xs, f) => (xs.length ? `${f(Math.min(...xs))}–${f(Math.max(...xs))}` : '-');
const name = (key) => ENEMIES[key]?.name ?? key;

console.log('### Crews used (greedy bot, end of Ember Isle)\n');
// A crew line: short name, level and stars.
const crewLine = (p) => p.activeHeroes
  .map(({ id }) => `${HEROES[id].shortName} ${p.heroLevel(id)} ${p.heroStarCount(id)}★`).join(', ');
console.log('| Seed | Reached Frostbite Reef | Ember losses | Hull LV (max HP) | Decks | Crew (level, stars) |');
console.log('|---:|---|---:|---|---:|---|');
for (const c of crews) {
  console.log(`| ${c.seed} | ${c.reached ? 'yes' : 'no'} | ${c.losses} | ${c.p.hullHpLevel} (${c.p.hullMaxHp}) | ${c.p.decks} | ${crewLine(c.p)} |`);
}

console.log(`\n### Waves (${crews.filter((c) => c.reached).length} crews x ${REPLAYS} replays each)\n`);
console.log('| Wave | Won | Clear time s (avg, range) | Ship HP left (avg, range) | Lost: sunk after s / wave beaten | Freezes per wave: blizzard / Wyrm / Giant | Boss time-to-kill s (avg, range) | Most hull damage from |');
console.log('|---:|---|---|---|---|---|---|---|');
for (const wave of WAVES) {
  const list = results.get(wave) ?? [];
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

// --- 3. For context: the greedy bot carrying on into Frostbite Reef ---

console.log('\n### For context: the greedy bot carrying on (upgrading between waves)\n');
console.log('| Seed | Stopped at | Losses on Frostbite Reef | Hull LV | Crew (level) |');
console.log('|---:|---|---:|---:|---|');
for (let s = 0; s < SEEDS; s++) {
  const seed = 1000 + s;
  const res = run(seed, 'greedy', { maxWave: 50, voyage: true, maxTries: 15 });
  const p = res.progress;
  const frost = p.islandId === ISLAND;
  const losses = res.log.filter((l) => !l.won && l.island === ISLAND).length;
  const at = frost ? `Frostbite ${p.wave}${res.wall ? ' (wall)' : ''}` : `${p.island.name} ${p.wave} (wall before Frostbite Reef)`;
  console.log(`| ${seed} | ${at} | ${losses} | ${p.hullHpLevel} | ${res.crew} |`);
}
