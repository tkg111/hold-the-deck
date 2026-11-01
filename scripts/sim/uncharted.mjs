// The Uncharted Seas balance check: `npm run sim:uncharted [-- crews tries]`.
//
// 1. Crews: the greedy bot's crew at the end of Fogbound Isle, as
//    `sim:abyss` makes them (seeds 1000 on; set ABYSS_CACHE to the same file
//    to share them, or they're made here).
// 2. Builds, from each crew's save:
//    a: as it is (the bot's crew on entering the Abyss), nobody awakened;
//    b: the same with its 4 best crew (the bot's first four on the ship)
//       awakened;
//    c: every crewmate it owns awakened and 20 levels higher.
// 3. Every stage at every crown, `tries` times per crew (each its own luck),
//    each build mustering like a player would: its best crew the stage's
//    rules allow (someone who hits flyers first when the stage has any).
// Report: the clear rate per stage, crown and build, per sea and crown, and
// the stages' times. Options: build=a|b|c, sea=1..6, crown=1..3, and
// stage=3-6,4-6 (only those).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  AWAKEN, ENEMIES, HEROES, PACKS, SHIP,
} from '../../src/config.js';
import { SEAS } from '../../src/data/uncharted.js';
import { Progress } from '../../src/systems/Progress.js';
import { initExpeditions } from '../../src/systems/Expeditions.js';
import { STAGES, stagePlan } from '../../src/systems/Uncharted.js';
import {
  between, canHitAir, makeBattle, payKills, playWave, seedRandom, worth,
} from './simulate.mjs';

initExpeditions(JSON.parse(readFileSync(new URL('../../public/sprites/ui/expedition/expedition.json', import.meta.url), 'utf8')));

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
const plain = args.filter((a) => !a.includes('='));
const CREWS = Number(plain[0] ?? 5);
const TRIES = Number(plain[1] ?? 1);
const BUILDS = flag('build')?.split(',') ?? ['a', 'b', 'c'];
const SEA = flag('sea') ? Number(flag('sea')) - 1 : null;
const ONLY = flag('stage')?.split(',') ?? null;   // stage=3-6,4-6: only those
const CROWNS = flag('crown')?.split(',').map(Number) ?? [1, 2, 3];
const MAX_TRIES = 30;
const TRACE = !!process.env.TRACE;
const ALL_EARNED = Object.keys(HEROES).filter((id) => HEROES[id].earned);
const EARNED = process.env.EARNED === 'none' ? [] : process.env.EARNED ? process.env.EARNED.split(',') : ALL_EARNED;
const islandIds = ['skull_cove', 'ember_isle', 'frostbite_reef', 'fogbound_isle'];

// --- 1. Crews (as sim:abyss makes them) ---

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
      cached[seed] = voyage(seed);
      if (path) writeFileSync(path, JSON.stringify(cached));
    }
    list.push(cached[seed]);
  }
  return list;
}

// --- 2. Builds ---

// Builds (b) and (c) also have the Uncharted Seas' own crew (HEROES earned),
// at 5 stars (as they join) and the level of the crew's fourth best (EARNED=none leaves them out;
// EARNED=rigger,berserker gives only those).
function build(save, which) {
  const p = Progress.fromSave(save);
  p.abyss.runs = Math.max(1, p.abyss.runs);   // the Uncharted Seas are open
  if (which !== 'a' && EARNED.length) {
    const level = p.activeHeroes.map(({ id }) => p.heroLevel(id)).sort((x, y) => y - x)[3] ?? 1;
    for (const id of EARNED) {
      if (!p.owned.includes(id)) p.owned.push(id);
      p.heroLevels[id] = level;
      p.heroStars[id] = PACKS.maxStars;   // as they join
    }
  }
  if (which === 'b') p.awakened = p.activeHeroes.slice(0, 4).map(({ id }) => id);
  if (which === 'c') {
    p.awakened = [...p.owned];
    for (const id of p.owned) p.heroLevels[id] = p.heroLevel(id) + 20;
  }
  return p.toSave();
}

// The Muster: the best crew the stage's rules allow, up to its limit, with
// someone who hits flyers when the stage has any; The Captain beside the
// strongest.
// A crewmate's sheet DPS: its damage now (level, stars, awakening) x the
// shots of an attack, over its attack interval. Supports (The Captain) 0.
const sheetDps = (p, id) => (HEROES[id].aura ? 0
  : p.heroDamage(id) * (HEROES[id].burst?.count ?? 1) * 1000 / HEROES[id].attackInterval);

function muster(p, flyers) {
  // Skeleton Crew (a crew limit under the ship's slots): the crew with the
  // most sheet DPS, someone anti-air among them when flyers come.
  if (p.stageCrewLimit < p.slotCount) {
    const pool = p.ownedHeroes.filter((id) => p.mayMuster(id) && !p.isAway(id)).sort((a, b) => sheetDps(p, b) - sheetDps(p, a));
    const few = pool.slice(0, p.stageCrewLimit);
    if (flyers && !few.some(canHitAir)) {
      const hunter = pool.find((id) => canHitAir(id) && !few.includes(id));
      if (hunter) few[few.length - 1] = hunter;
    }
    p.slots = Array(SHIP.maxDecks * SHIP.slotsPerDeck).fill(null);
    few.forEach((id, i) => { p.slots[i] = id; });
    return;
  }
  const allowed = p.ownedHeroes.filter((id) => p.mayMuster(id) && !p.isAway(id) && !HEROES[id].earned).sort((a, b) => worth(p, b) - worth(p, a));
  const crew = allowed.slice(0, Math.min(p.slotCount, p.stageCrewLimit));
  // The Uncharted Seas' own crew: each in place of the weakest attacker
  // (by damage) if it hits harder, as a player comparing the numbers would
  // (by rarity first, three new Legendaries would push out the Cannoneer and
  // Ghost Pirate whatever the stage).
  const earned = p.ownedHeroes.filter((id) => p.mayMuster(id) && !p.isAway(id) && HEROES[id].earned).sort((a, b) => p.heroDamage(b) - p.heroDamage(a));
  for (const id of earned) {
    const attackers = crew.filter((c) => !HEROES[c].aura && !HEROES[c].earned);
    const weakest = attackers.reduce((w, c) => (!w || p.heroDamage(c) < p.heroDamage(w) ? c : w), null);
    if (crew.length < Math.min(p.slotCount, p.stageCrewLimit)) crew.push(id);
    else if (weakest && p.heroDamage(id) > p.heroDamage(weakest)) crew[crew.indexOf(weakest)] = id;
  }
  const flyerCheck = [...allowed, ...earned];
  if (flyers && !crew.some(canHitAir)) {
    const hunter = flyerCheck.find((id) => canHitAir(id) && !crew.includes(id));
    if (hunter) crew[crew.length - 1] = hunter;
  }
  const captain = crew.find((id) => HEROES[id].aura);
  const attackers = crew.filter((id) => !HEROES[id].aura);
  const order = captain ? [attackers[0], captain, ...attackers.slice(1)].filter(Boolean) : attackers;
  p.slots = Array(SHIP.maxDecks * SHIP.slotsPerDeck).fill(null);
  order.forEach((id, i) => { p.slots[i] = id; });
}

// The bot and the Uncharted bosses' mechanics (MECH=use, the default, as a
// player told by the Captain's tips; MECH=ignore; MECH=none:
// the crew's own targeting). use: the crew aim first at what the
// mechanic is about: the Angler's lure, the Shellbacks out of the Hermit
// King's wreck,
// Cinderclad's mortar shells, Captain Rime (his plates), the Storm Roc
// perched, the Drowned King with his trident out. ignore: they leave the
// lure, Shellbacks and shells alone while anything else is in range, and
// Rime while he has plates (hypnosis still makes them look at the lure).
const MECH = process.env.MECH === 'none' ? null : process.env.MECH ?? 'use';
const mechanic = (e) => !!(e.def.lure || e.fromWreck || e.def === ENEMIES.cinderShell
  || (e.def.roc && e.perched) || (e.def.king && e.outLeft > 0));
const MECH_HOOKS = {
  use: { botFocus: (e) => mechanic(e) || !!e.def.rime, crewAvoid: null },
  ignore: { botFocus: null, crewAvoid: (e) => mechanic(e) || (!!e.def.rime && e.plates > 0) },
};

// One try of a stage at a crown: { won, time }.
function tryStage(save, stage, crown, seed) {
  seedRandom(seed);
  const p = Progress.fromSave(save);
  for (const s of STAGES) if (s.sea < stage.sea || (s.sea === stage.sea && s.index < stage.index)) p.uncharted.crowns[s.id] = 3;
  for (const s of SEAS[stage.sea].stages) p.uncharted.crowns[s.id] = Math.max(p.uncharted.crowns[s.id] ?? 0, crown - 1);
  p.uncharted.grog = 99;
  p.musterStage(stage, crown);
  muster(p, stagePlan(stage, crown).some((e) => e.def.flies));
  if (p.beginStage() == null) throw new Error(`can't sail ${stage.id} at ${crown}`);
  const scene = makeBattle(p);
  payKills(scene, p);
  if (MECH) Object.assign(scene, MECH_HOOKS[MECH]);
  // TRACE=1: the hull damage each kind of enemy did (BattleStats' hullHit).
  const hull = {};
  if (TRACE) {
    scene.stats = {
      hullHit: (e, n) => { const k = e.key ?? e.boss?.key ?? e.def.name; hull[k] = (hull[k] ?? 0) + n; },
      dealt() {}, add() {}, kill() {}, abilityUsed() {},
    };
  }
  const { won, time } = playWave(scene, p);
  return { won, time, hull };
}

// --- Report ---

// Run as `npm run sim:uncharted` (not when imported by the journey sim).
const main = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (main) report();

function report() {
  const list = crews();
  const stages = STAGES.filter((s) => (SEA == null || s.sea === SEA) && (!ONLY || ONLY.includes(s.id)));
  const results = {};   // `${build}:${stage}:${crown}` -> [{ won, time, hull }]
  const t0 = Date.now();
  for (const which of BUILDS) {
    const saves = list.map((c) => build(c.save, which));
    for (const stage of stages) {
      for (const crown of CROWNS) {
        const key = `${which}:${stage.id}:${crown}`;
        results[key] = [];
        saves.forEach((save, c) => {
          for (let t = 0; t < TRIES; t++) results[key].push(tryStage(save, stage, crown, 7000 + c * 101 + t * 13 + crown));
        });
        const rs = results[key];
        console.error(`${which} ${stage.id} ${crown}: ${rs.filter((r) => r.won).length}/${rs.length} (${Math.round((Date.now() - t0) / 1000)}s)`);
      }
    }
  }

  const pct = (rs) => (rs.length ? `${Math.round(100 * rs.filter((r) => r.won).length / rs.length)}%` : '-');
  const n = list.length * TRIES;
  console.log(`\n### Clear rate per stage (${list.length} crews x ${TRIES} = ${n} tries each; builds: ${BUILDS.join(', ')})\n`);
  console.log(`| Stage | ${BUILDS.flatMap((b) => CROWNS.map((c) => `${b} ${'♛'.repeat(c)}`)).join(' | ')} | ${BUILDS.map((b) => `Time (${b}, ${CROWNS[0]} crown, won)`).join(' | ')} |`);
  console.log(`|---|${BUILDS.flatMap(() => CROWNS.map(() => '---:')).join('|')}|${BUILDS.map(() => '---:').join('|')}|`);
  for (const stage of stages) {
    const cells = BUILDS.flatMap((b) => CROWNS.map((c) => pct(results[`${b}:${stage.id}:${c}`])));
    const times = BUILDS.map((b) => {
      const won = (results[`${b}:${stage.id}:${CROWNS[0]}`] ?? []).filter((r) => r.won);
      return won.length ? `${Math.round(won.reduce((s, r) => s + r.time, 0) / won.length / 1000)}s` : '-';
    });
    console.log(`| ${stage.id} ${stage.name} | ${cells.join(' | ')} | ${times.join(' | ')} |`);
  }

  console.log('\n### Clear rate per sea and crown\n');
  console.log(`| Sea | ${BUILDS.flatMap((b) => CROWNS.map((c) => `${b} ${'♛'.repeat(c)}`)).join(' | ')} |`);
  console.log(`|---|${BUILDS.flatMap(() => CROWNS.map(() => '---:')).join('|')}|`);
  SEAS.forEach((sea, s) => {
    if (SEA != null && s !== SEA) return;
    const cells = BUILDS.flatMap((b) => CROWNS.map((c) => pct(stages.filter((st) => st.sea === s).flatMap((st) => results[`${b}:${st.id}:${c}`]))));
    console.log(`| ${s + 1} ${sea.name} | ${cells.join(' | ')} |`);
  });
  console.log(`\nAWAKEN.level ${AWAKEN.level}; crews: ${list.map((c) => {
    const p = Progress.fromSave(c.save);
    return p.activeHeroes.map(({ id }) => `${HEROES[id].shortName} ${p.heroLevel(id)}`).join(' ');
  }).join(' / ')}`);

  // TRACE=1: who did the hull damage, per stage, build and crown (lost tries
  // only, where it decided something; all tries if none were lost).
  if (TRACE) {
    console.log('\n### Hull damage by enemy (TRACE)\n');
    for (const [key, rs] of Object.entries(results)) {
      const lost = rs.filter((r) => !r.won);
      const sum = {};
      for (const r of lost.length ? lost : rs) for (const [k, n] of Object.entries(r.hull)) sum[k] = (sum[k] ?? 0) + n;
      const total = Object.values(sum).reduce((s, n) => s + n, 0) || 1;
      const top = Object.entries(sum).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([k, n]) => `${k} ${Math.round(100 * n / total)}%`).join(', ');
      console.log(`- ${key} (${lost.length}/${rs.length} lost): ${top || '-'}`);
    }
  }
}

export { muster, MECH_HOOKS, sheetDps };
