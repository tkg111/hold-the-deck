// Each Uncharted crewmate on a stage: `npm run sim:crew [-- stage=4-4 crown=1 seeds=5]`.
//
// Build (c)'s crew (sim:uncharted's), with one crewmate swapped in for the
// crew's weakest attacker in turn (or none, the baseline), every stage of
// the list at the crown, one try per crew (`seeds` crews): the clear rate
// each one gives. Shows whether any one of them carries
// stages alone. Needs ABYSS_CACHE (sim:uncharted's crews file).
import { readFileSync, existsSync } from 'node:fs';
import { HEROES, PACKS, SHIP } from '../../src/config.js';
import { Progress } from '../../src/systems/Progress.js';
import { initExpeditions } from '../../src/systems/Expeditions.js';
import { stageOf } from '../../src/systems/Uncharted.js';
import { makeBattle, payKills, playWave, seedRandom, worth } from './simulate.mjs';

initExpeditions(JSON.parse(readFileSync(new URL('../../public/sprites/ui/expedition/expedition.json', import.meta.url), 'utf8')));

const args = process.argv.slice(2);
const flag = (name, d) => args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1) ?? d;
const STAGES = flag('stage', '1-3,2-2,3-3,4-4,5-2,6-2').split(',');
const CROWN = Number(flag('crown', 1));
const SEEDS = Number(flag('seeds', 5));
const ONLY = flag('crew', null)?.split(',') ?? null;
const path = process.env.ABYSS_CACHE;
if (!path || !existsSync(path)) throw new Error('set ABYSS_CACHE to sim:uncharted\'s crews');
const crews = Object.values(JSON.parse(readFileSync(path, 'utf8'))).slice(0, SEEDS);
const EARNED = Object.keys(HEROES).filter((id) => HEROES[id].earned && (!ONLY || ONLY.includes(id)));

function tryOne(save, stage, swap, seed) {
  seedRandom(seed);
  const p = Progress.fromSave(save);
  p.abyss.runs = Math.max(1, p.abyss.runs);
  const level = p.activeHeroes.map(({ id }) => p.heroLevel(id)).sort((a, b) => b - a)[3];
  p.awakened = [...p.owned];
  for (const id of p.owned) p.heroLevels[id] = p.heroLevel(id) + 20;
  for (const s of Object.keys(p.uncharted.crowns)) p.uncharted.crowns[s] = 3;
  for (const id of EARNED) {
    p.owned.push(id);
    p.heroLevels[id] = level + 20;
    p.heroStars[id] = PACKS.maxStars;
    p.awakened.push(id);
  }
  const st = stageOf(stage);
  p.uncharted.grog = 99;
  // Everything before it cleared.
  for (let sea = 0; sea <= st.sea; sea++) for (let i = 0; i < 6; i++) p.uncharted.crowns[`${sea + 1}-${i + 1}`] = sea < st.sea || i < st.index ? 3 : CROWN - 1;
  p.musterStage(st, CROWN);
  const crew = p.ownedHeroes.filter((id) => !HEROES[id].earned && p.mayMuster(id)).sort((a, b) => worth(p, b) - worth(p, a)).slice(0, p.slotCount);
  if (swap) {
    const weakest = [...crew].reverse().find((id) => !HEROES[id].aura);
    crew[crew.indexOf(weakest)] = swap;
  }
  p.slots = Array(SHIP.maxDecks * SHIP.slotsPerDeck).fill(null);
  crew.forEach((id, i) => { p.slots[i] = id; });
  if (p.beginStage() == null) throw new Error(`can't sail ${stage}`);
  const scene = makeBattle(p);
  payKills(scene, p);
  const { won, time } = playWave(scene, p);
  return { won, time };
}

console.log(`| Crewmate | ${STAGES.join(' | ')} | all |`);
console.log(`|---|${STAGES.map(() => '---:').join('|')}|---:|`);
for (const swap of [null, ...EARNED]) {
  const cells = [];
  let wins = 0;
  for (const stage of STAGES) {
    let w = 0;
    crews.forEach((c, i) => { if (tryOne(c.save, stage, swap, 9000 + i * 31).won) w++; });
    wins += w;
    cells.push(`${Math.round(100 * w / crews.length)}%`);
  }
  console.log(`| ${swap ? HEROES[swap].name : '(baseline)'} | ${cells.join(' | ')} | ${Math.round(100 * wins / (crews.length * STAGES.length))}% |`);
}
