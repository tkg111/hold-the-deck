// How long the first awakening takes a player farming Shipwreck Shallows
// (Sea 1): `npm run sim:awaken-pace [-- trials] [rates=a1,a2,a3]`.
//
// No battles: each stage try is won at the clear rate `sim:uncharted`
// measured for build (a) (the crew on entering the Abyss) at that crown
// (`rates`: Sea 1's average per crown, or per stage below), and pays the
// real drops and Grog rules (Uncharted.rollDrops, first clears, refunds).
// The player, aiming at one crewmate's awakening (`hero`, default the Storm
// Caller: a Legendary Mystic, 25 purple, 8 gold, 3 Hearts):
//   1. sweeps the sea: each stage at the highest crown open, in order,
//      until every stage is cleared at every crown it can win (a crown it
//      wins under 15% of the time is skipped);
//   2. then farms what's missing: the boss stage (1-6) at its best crown
//      for Hearts, else the stage with the most of the colour still needed
//      per Grog.
// Grog: starts full (30), one back every 5 minutes, spent as it comes; the
// player tops up `sessions` times a day (default 4: the bar is full after
// 2.5 h, so 4 visits miss little of a day's 288). Reported: Grog spent, stage
// tries, and the days it takes (regen-limited) per trial: median and range.
import { HEROES, UNCHARTED } from '../../src/config.js';
import { SEAS } from '../../src/data/uncharted.js';
import { initExpeditions } from '../../src/systems/Expeditions.js';
import { readFileSync } from 'node:fs';
import {
  awakenCost, bestCrown, isStageOpen, newRecord, rollDrops, stageCost,
} from '../../src/systems/Uncharted.js';

initExpeditions(JSON.parse(readFileSync(new URL('../../public/sprites/ui/expedition/expedition.json', import.meta.url), 'utf8')));

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1);
const TRIALS = Number(args.find((a) => !a.includes('=')) ?? 2000);
const HERO = flag('hero') ?? 'stormCaller';
const SESSIONS = Number(flag('sessions') ?? 4);
// Clear rates of build (a) on Sea 1: per crown, or `stage:crown=rate,...`.
const CROWN_RATES = (flag('rates') ?? '0.97,0.5,0.37').split(',').map(Number);
const STAGE_RATES = Object.fromEntries((flag('stages') ?? '').split(',').filter(Boolean)
  .map((s) => s.split('=')).map(([k, v]) => [k, Number(v)]));
const rateOf = (stage, crown) => STAGE_RATES[`${stage.id}:${crown}`] ?? CROWN_RATES[crown - 1];
const sea = SEAS[0].stages;

function trial() {
  const rec = newRecord(0);
  const need = awakenCost(HERO);
  const missing = () => Object.entries(need).filter(([c, n]) => (rec.items[c] ?? 0) < n);
  let grogSpent = 0;
  let tries = 0;
  const play = (stage, crown) => {
    const cost = stageCost(stage, crown);
    grogSpent += cost;
    tries++;
    if (Math.random() >= rateOf(stage, crown)) {
      grogSpent -= Math.floor(cost * UNCHARTED.retreatRefund);
      return false;
    }
    const key = `${stage.id}:${crown}`;
    const first = !rec.firstClears.includes(key);
    const drops = rollDrops(stage, crown, { first, firstHeart: first && crown >= 2 });
    for (const [c, n] of Object.entries(drops.glass)) rec.items[c] += n;
    rec.items.heart += drops.heart;
    if (first) {
      rec.firstClears.push(key);
      grogSpent -= cost;
    }
    rec.crowns[stage.id] = Math.max(bestCrown(rec, stage), crown);
    return true;
  };
  // 1. The sweep.
  for (let crown = 1; crown <= 3; crown++) {
    for (const stage of sea) {
      if (rateOf(stage, crown) < 0.15) continue;
      for (let k = 0; k < 20 && isStageOpen(rec, stage, crown) && bestCrown(rec, stage) < crown; k++) play(stage, crown);
    }
  }
  // 2. Farming what's missing.
  const winnable = (stage) => [3, 2, 1].find((c) => bestCrown(rec, stage) >= c && rateOf(stage, c) >= 0.15) ?? null;
  while (missing().length && tries < 5000) {
    const short = missing().map(([c]) => c);
    let pick = null;
    if (short.includes('heart')) {
      const boss = sea[sea.length - 1];
      pick = { stage: boss, crown: winnable(boss) };
    } else {
      let best = -1;
      for (const stage of sea) {
        const crown = winnable(stage);
        if (!crown || !stage.drops) continue;
        const per = stage.drops.filter((c) => short.includes(c)).length
          * UNCHARTED.drops.crownMult[crown - 1] * (crown >= 3 ? 1 : UNCHARTED.drops.chance) * rateOf(stage, crown) / stageCost(stage, crown);
        if (per > best) {
          best = per;
          pick = { stage, crown };
        }
      }
      if (best <= 0) {
        const boss = sea[sea.length - 1];
        pick = { stage: boss, crown: winnable(boss) };   // random glass
      }
    }
    if (!pick?.crown) break;
    play(pick.stage, pick.crown);
  }
  // Days: the first 30 are on hand; then 12 an hour, capped at 30 between
  // visits (sessions a day).
  const { cap, regenMs } = UNCHARTED.grog;
  const perDay = Math.min(24 * 3600e3 / regenMs, SESSIONS * cap);
  const days = Math.max(0, grogSpent - cap) / perDay;
  return { grogSpent, tries, days, done: !missing().length };
}

const results = Array.from({ length: TRIALS }, trial).sort((a, b) => a.days - b.days);
const at = (q) => results[Math.min(results.length - 1, Math.floor(q * results.length))];
const avg = (k) => results.reduce((s, r) => s + r[k], 0) / results.length;
console.log(`First awakening of the ${HERO_NAME()} (${JSON.stringify(awakenCost(HERO))}), farming Sea 1, ${TRIALS} trials`);
console.log(`clear rates per crown ${CROWN_RATES.join(' / ')}; ${SESSIONS} visits a day`);
console.log(`Grog spent (net of refunds): avg ${avg('grogSpent').toFixed(0)}; stage tries: avg ${avg('tries').toFixed(0)}`);
console.log(`days: median ${at(0.5).days.toFixed(2)}, 10% ${at(0.1).days.toFixed(2)}, 90% ${at(0.9).days.toFixed(2)}; finished ${results.filter((r) => r.done).length}/${TRIALS}`);

function HERO_NAME() { return HEROES[HERO].name; }
