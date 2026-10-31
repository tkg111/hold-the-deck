// Headless tests of the Uncharted Seas' new crew, enemies and bosses, run
// on the balance sim's stand-in battle (the real Enemy, Hero and ability
// code): each enemy's trick, each boss's mechanics, and crew rewards
// being granted exactly once.
// Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ABYSS, ENEMIES, HEROES, MIMIC, PACKS, SHIP, UNCHARTED,
} from '../../src/config.js';
import { LAYOUT } from '../../src/layout.js';
import { Enemy } from '../../src/entities/Enemy.js';
import { depthPlan, depthTypes } from '../../src/systems/Abyss.js';
import { initExpeditions } from '../../src/systems/Expeditions.js';
import { Progress } from '../../src/systems/Progress.js';
import {
  crewEarned, stageCrewReward, stageOf, stagePlan, STAGES,
} from '../../src/systems/Uncharted.js';
import { makeBattle, rebuildHeroes } from '../sim/simulate.mjs';

initExpeditions(JSON.parse(readFileSync(new URL('../../public/sprites/ui/expedition/expedition.json', import.meta.url), 'utf8')));

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const DT = 50;

// A battle with this crew on deck (slot order), nobody else.
function battle(crew = []) {
  const p = new Progress();
  p.abyss.runs = 1;
  for (const id of crew) if (!p.owned.includes(id)) p.owned.push(id);
  p.decks = SHIP.maxDecks;
  p.slots = Array(SHIP.maxDecks * SHIP.slotsPerDeck).fill(null);
  crew.forEach((id, i) => { p.slots[i] = id; });
  const scene = makeBattle(p);
  scene.ship.sync(p);
  rebuildHeroes(scene, p);
  scene.enemies = [];
  scene.projectiles = [];
  return { p, scene };
}

// An enemy of this kind at x (HP and damage x1).
function spawn(scene, key, x = 300, opts = {}) {
  const e = new Enemy(scene, ENEMIES[key], {
    x, hpMultiplier: 1, damageMultiplier: 1, gold: ENEMIES[key].gold, key, ...opts,
  });
  scene.enemies.push(e);
  return e;
}

// Step the battle ms (enemies, crew, abilities, shots).
function step(scene, ms, { crew = true } = {}) {
  for (let t = 0; t < ms; t += DT) {
    for (const e of scene.enemies) e.update(DT, scene.ship);
    scene.abilities.update(DT, false);
    if (crew) {
      for (const h of scene.heroes) {
        const shot = h.update(DT, scene.enemies);
        if (shot) scene.projectiles.push(...[shot].flat());
      }
    }
    for (const pr of scene.projectiles) pr.update(DT);
    scene.enemies = scene.enemies.filter((e) => e.alive);
    scene.projectiles = scene.projectiles.filter((pr) => !pr.done);
  }
}

// --- Enemies ---

test('shellback: hides at each 25% lost, immune and out of reach for 2s', () => {
  const { scene } = battle();
  const e = spawn(scene, 'shellback');
  e.takeDamage(e.maxHp * 0.3, { ignoreArmor: true });
  assert.ok(e.shellTime > 0, 'hiding');
  assert.equal(e.targetable, false);
  const hp = e.hp;
  e.takeDamage(1000, { ignoreArmor: true });
  assert.equal(e.hp, hp, 'no damage in its shell');
  const x = e.x;
  step(scene, 1000, { crew: false });
  assert.equal(e.x, x, 'still in its shell');
  step(scene, 1100, { crew: false });
  assert.equal(e.shellTime, 0);
  assert.ok(e.targetable);
  e.takeDamage(1, { ignoreArmor: true });
  assert.equal(e.shellTime, 0, 'not again until the next 25%');
  e.takeDamage(e.maxHp * 0.25, { ignoreArmor: true });
  assert.ok(e.shellTime > 0, 'hides again past 50%');
});

test('puffer mine: inflates at the ship for 1s, then bursts on the hull', () => {
  const { scene } = battle();
  const e = spawn(scene, 'pufferMine', LAYOUT.shipContactX + ENEMIES.pufferMine.width / 2 + 1);
  const hull = scene.ship.hp;
  step(scene, 600, { crew: false });
  assert.ok(e.alive, 'still inflating');
  assert.equal(scene.ship.hp, hull);
  step(scene, 600, { crew: false });
  assert.equal(e.alive, false);
  assert.ok(Math.abs(hull - scene.ship.hp - scene.ship.maxHp * ENEMIES.pufferMine.hullShare.normal) < 1e-6);
});

test('reef golem: regenerates after 2s without a hit; a hit resets the wait', () => {
  const { scene } = battle();
  const e = spawn(scene, 'reefGolem');
  e.takeDamage(40, { ignoreArmor: true });
  const hurt = e.hp;
  step(scene, 1500, { crew: false });
  assert.equal(e.hp, hurt, 'not yet');
  e.takeDamage(1);
  step(scene, 1500, { crew: false });
  assert.equal(e.hp, hurt - 1, 'the hit reset the clock');
  step(scene, 1500, { crew: false });
  assert.ok(e.hp > hurt - 1, 'healing');
  const perSec = e.maxHp * ENEMIES.reefGolem.regen.perSecond;
  assert.ok(Math.abs(e.hp - (hurt - 1) - perSec) < perSec * 0.1, '3% a second');
});

test('eel rider: dodges the first projectile only', () => {
  const { scene } = battle(['cabinBoy']);
  const e = spawn(scene, 'eelRider', 250);
  e.speed = 0;
  const [hero] = scene.heroes;
  hero.onHit(e, e.x, e.y, null, null, { shot: true });
  assert.equal(e.hp, e.maxHp, 'dodged');
  hero.onHit(e, e.x, e.y, null, null, { shot: true });
  assert.ok(e.hp < e.maxHp, 'the second lands');
});

test('zap jelly: killed, it stuns the crewmate nearest it for 1s', () => {
  const { scene } = battle(['cabinBoy', 'parrotKeeper', 'shipsCook']);
  const e = spawn(scene, 'zapJelly', 300);
  const nearest = scene.heroes.reduce((a, h) => (Math.hypot(h.x - e.x, h.y - e.y) < Math.hypot(a.x - e.x, a.y - e.y) ? h : a));
  e.takeDamage(1e6);
  assert.ok(nearest.isStunned);
  assert.equal(nearest.stunTime, ENEMIES.zapJelly.zap.stun);
  assert.equal(scene.heroes.filter((h) => h.isStunned).length, 1);
});

test('lurker: out of reach until within 160px, or seen by a Lookout or a Flare', () => {
  const { reveal } = { reveal: ENEMIES.lurker.lurks.revealAt };
  let { scene } = battle(['cabinBoy']);
  const far = spawn(scene, 'lurker', LAYOUT.shipContactX + reveal + 40);
  step(scene, DT, { crew: false });
  assert.equal(far.targetable, false);
  const near = spawn(scene, 'lurker', LAYOUT.shipContactX + reveal - 10);
  assert.ok(near.targetable, 'in range of the ship');
  far.applyFlare(0.25, 1000);
  assert.ok(far.targetable, 'flared');
  ({ scene } = battle(['lookout']));
  const seen = spawn(scene, 'lurker', LAYOUT.shipContactX + reveal + 40);
  step(scene, DT, { crew: false });
  assert.ok(seen.targetable, 'a Lookout aboard');
  scene.heroes[0].stun(5000);
  step(scene, DT, { crew: false });
  assert.equal(seen.targetable, false, 'not while the Lookout is stunned');
});

test('drowned drummer: its beat hurries enemies within 80px, not further; the crew aim at it first', () => {
  const { scene } = battle(['cabinBoy']);
  const drummer = spawn(scene, 'drownedDrummer', 360);
  const near = spawn(scene, 'frozenCorsair', 360 - 70);
  const far = spawn(scene, 'frozenCorsair', 360 + 90);
  step(scene, ENEMIES.drownedDrummer.drum.every + DT, { crew: false });
  assert.ok(near.boostTime > 0 && near.boostMult === ENEMIES.drownedDrummer.drum.speed);
  assert.equal(far.boostTime, 0);
  assert.equal(scene.heroes[0].pickTarget(scene.enemies), drummer);
});

test('mimic: x5 gold and a random Sea Glass; replaces basic enemies at 5%', () => {
  assert.equal(ENEMIES.mimic.gold, ENEMIES.frozenCorsair.gold * 5);
  const p = new Progress();
  assert.equal(p.findTreasure(), null, 'nothing before the Uncharted Seas');
  p.abyss.runs = 1;
  const colour = p.findTreasure(() => 0.5);
  assert.ok(UNCHARTED.colours.includes(colour));
  assert.equal(p.itemCount(colour), 1);
  // Over many plans, about 5% of basic enemies come as Mimics.
  let basic = 0;
  let mimics = 0;
  for (let seed = 1; seed <= 60; seed++) {
    for (const entry of depthPlan(seed, 30)) {
      if (MIMIC.replaces.includes(entry.key)) basic++;
      if (entry.key === 'mimic') mimics++;
    }
  }
  const share = mimics / (basic + mimics);
  assert.ok(share > 0.02 && share < 0.12, `${share}`);
});

test('abyss: the new enemies join the mix from depth 20 only', () => {
  const fresh = Object.keys(ABYSS.enemies).filter((k) => ABYSS.enemies[k].fromDepth);
  assert.equal(fresh.length, 8);
  for (let seed = 1; seed <= 40; seed++) {
    assert.ok(!depthTypes(seed, 19).some((k) => fresh.includes(k)));
    assert.ok(!depthPlan(seed, 19).some((e) => e.key === 'mimic'));
  }
  assert.ok(Array.from({ length: 40 }, (_, s) => depthTypes(s + 1, 25)).flat().some((k) => fresh.includes(k)));
});

// --- Bosses ---

// A source of damage from this crewmate (as Hero hits carry).
const from = (hero) => ({ hero, kind: 'attack' });

test('hermit king: hides in the wreck at 66% and 33%, immune, until the 3 Shellbacks that crawl out are dead', () => {
  const { scene } = battle();
  const boss = spawn(scene, 'hermitKing');
  boss.takeDamage(boss.maxHp * 0.36);
  assert.ok(boss.wreckTime > 0, 'hiding');
  assert.equal(boss.targetable, false);
  assert.equal(scene.enemies.filter((e) => e.key === 'shellback').length, 3);
  const hp = boss.hp;
  boss.takeDamage(1000);
  assert.equal(boss.hp, hp, 'immune in the wreck');
  step(scene, 4000, { crew: false });
  assert.ok(boss.wreckTime > 0, 'still hiding while its crabs live');
  for (const e of scene.enemies) if (e.key === 'shellback') e.destroy();
  step(scene, 2 * DT, { crew: false });
  assert.ok(boss.targetable, 'out once they are dead');
  boss.takeDamage(boss.maxHp * 0.34);
  assert.ok(boss.wreckTime > 0, 'again at 33%');
  assert.equal(scene.enemies.filter((e) => e.alive && e.key === 'shellback').length, 3);
  step(scene, ENEMIES.hermitKing.hermit.hideMs + DT, { crew: false });
  assert.ok(boss.targetable, 'out after hideMs at most');
});

test('cinderclad: smoke cuts crew range to 60% while it lasts; mortar shells can be shot down', () => {
  const { scene } = battle(['cabinBoy']);
  const boss = spawn(scene, 'cinderclad');
  const [hero] = scene.heroes;
  const range = hero.range;
  const c = ENEMIES.cinderclad.clad;
  step(scene, 7500, { crew: false });
  assert.equal(boss.phase, 'fight', 'stopped');
  step(scene, c.firstMortarAt + DT, { crew: false });
  const shells = scene.enemies.filter((e) => e.def === ENEMIES.cinderShell);
  assert.ok(shells.length >= 1, 'mortars fell');
  step(scene, c.firstSmokeAt - c.firstMortarAt, { crew: false });
  assert.ok(scene.smoke, 'smoke over the deck');
  assert.ok(Math.abs(hero.range - range * c.range) < 1e-9);
  step(scene, c.smokeMs + DT, { crew: false });
  assert.equal(scene.smoke, null);
  assert.equal(hero.range, range);
  // Shells shot down do nothing to the hull.
  boss.mortarTimer = 0;
  step(scene, DT, { crew: false });
  const shell = scene.enemies.find((e) => e.def === ENEMIES.cinderShell);
  assert.ok(shell.canBeHit(true) && !shell.canBeHit(false), 'anti-air only');
  const hull = scene.ship.hp;
  for (const e of scene.enemies) if (e.def === ENEMIES.cinderShell) e.takeDamage(1);
  step(scene, c.warnMs + 200, { crew: false });
  assert.equal(scene.ship.hp, hull);
});

test('captain rime: plates take hits at half (fire x2), never his HP; one comes back after 20s calm', () => {
  const { scene } = battle();
  const boss = spawn(scene, 'captainRime');
  const r = ENEMIES.captainRime.rime;
  const hp = boss.hp;
  boss.takeDamage(10);
  assert.equal(boss.hp, hp);
  assert.equal(boss.plateHp, boss.plateMax - 10 * r.reduce);
  boss.takeDamage(10, { source: from('fireBreather') });
  assert.equal(boss.plateHp, boss.plateMax - 5 - 10 * r.reduce * r.fire);
  boss.takeDamage(boss.plateMax * 10);
  assert.equal(boss.plates, 2, 'a plate broke');
  boss.takeDamage(boss.plateMax * 10);
  boss.takeDamage(boss.plateMax * 10);
  assert.equal(boss.plates, 0);
  boss.takeDamage(10);
  assert.equal(boss.hp, hp - 10, 'no plates: his HP');
  // Hit within the last 4s: no plate comes back.
  boss.rebuildTimer = 1000;
  step(scene, 900, { crew: false });
  boss.takeDamage(1);
  step(scene, 300, { crew: false });
  assert.equal(boss.plates, 0);
  step(scene, r.rebuildEvery, { crew: false });
  assert.equal(boss.plates, 1, 'calm long enough: one plate back');
  assert.equal(boss.plateHp, boss.plateMax);
});

test('abyssal angler: hypnosis makes the crew aim at the lure; the lure down stuns it 5s at x2, and regrows', () => {
  const { scene } = battle(['cabinBoy']);
  const boss = spawn(scene, 'abyssalAngler');
  const a = ENEMIES.abyssalAngler.angler;
  step(scene, a.lurkMs - 500, { crew: false });
  assert.equal(boss.targetable, false, 'lurking');
  assert.ok(boss.lure?.targetable, 'its lure shows');
  step(scene, 2000, { crew: false });
  assert.ok(boss.targetable, 'risen');
  const near = spawn(scene, 'frozenCorsair', LAYOUT.shipContactX + 20);
  near.speed = 0;
  assert.equal(scene.heroes[0].pickTarget(scene.enemies), near);
  boss.hypnosisTimer = 0;
  step(scene, DT, { crew: false });
  assert.equal(scene.heroes[0].pickTarget(scene.enemies), boss.lure, 'hypnotised');
  step(scene, a.hypnosisMs + DT, { crew: false });
  assert.equal(scene.heroes[0].pickTarget(scene.enemies), near, 'over');
  assert.equal(boss.lure.maxHp, Math.round(boss.maxHp * a.lureShare));
  boss.lure.takeDamage(1e6);
  assert.ok(boss.dazedLeft > 0);
  const hp = boss.hp;
  boss.takeDamage(10);
  assert.equal(boss.hp, hp - 10 * a.stunnedTaken);
  step(scene, a.stunMs + DT, { crew: false });
  boss.takeDamage(10);
  assert.equal(boss.hp, hp - 10 * a.stunnedTaken - 10, 'x1 again');
  assert.equal(boss.lure, null);
  step(scene, a.regrowMs - a.stunMs, { crew: false });
  assert.ok(boss.lure?.alive, 'regrown');
});

test('storm roc: x0.5 in the air but x2 from crew strong against flyers; x1.25 perched', () => {
  const { scene } = battle();
  const boss = spawn(scene, 'stormRoc');
  const r = ENEMIES.stormRoc.roc;
  step(scene, r.enterMs + DT, { crew: false });
  let hp = boss.hp;
  boss.takeDamage(10, { source: from('cabinBoy') });
  assert.equal(boss.hp, hp - 10 * r.flying);
  hp = boss.hp;
  boss.takeDamage(10, { source: from('rigger') });
  assert.equal(boss.hp, hp - 10 * r.antiAir);
  boss.landTimer = 0;
  step(scene, r.landMs + 2 * DT, { crew: false });
  assert.ok(boss.perched);
  hp = boss.hp;
  boss.takeDamage(10, { source: from('cabinBoy') });
  assert.equal(boss.hp, hp - 10 * r.perched);
  step(scene, r.perchMs + r.landMs + DT, { crew: false });
  assert.equal(boss.perched, false, 'took off again');
});

test('drowned king: rises at 50% (out of reach, immune), then phase 2: x2 for 3s after a trident throw', () => {
  const { scene } = battle();
  const boss = spawn(scene, 'drownedKing');
  const k = ENEMIES.drownedKing.king;
  boss.takeDamage(boss.maxHp * 0.51);
  assert.ok(boss.kingRise > 0);
  assert.equal(boss.targetable, false);
  const hp = boss.hp;
  boss.takeDamage(100);
  assert.equal(boss.hp, hp, 'immune while rising');
  step(scene, k.riseMs + DT, { crew: false });
  assert.equal(boss.kingPhase, 2);
  assert.ok(boss.current && scene.currents.has(boss.current), 'a current joined');
  boss.throwTimer = 0;
  step(scene, DT, { crew: false });
  assert.ok(boss.outLeft > 0);
  boss.takeDamage(10);
  assert.equal(boss.hp, hp - 10 * k.outTaken);
  step(scene, k.windowMs + DT, { crew: false });
  boss.takeDamage(10);
  assert.equal(boss.hp, hp - 10 * k.outTaken - 10);
  boss.takeDamage(1e6);
  assert.equal(scene.currents.has(boss.current), false, 'its current leaves with him');
});

test("boss factors: the Drowned King has 6-6's own factor, the pairs before him the stage's", () => {
  const plan = stagePlan(stageOf('6-6'), 1);
  const f = UNCHARTED.bosses['6-6'];
  const king = plan.find((e) => e.key === 'drownedKing');
  assert.equal(king.hpFactor, f.only.drownedKing.hp);
  assert.equal(king.damageFactor, f.only.drownedKing.damage);
  for (const e of plan.filter((p) => p.def.boss && p.key !== 'drownedKing')) assert.equal(e.hpFactor, f.hp);
});

// --- Rewards ---

test('rewards: each boss stage and 3-crown sea gives its crewmate exactly once, at 5 stars', () => {
  const p = new Progress();
  p.abyss.runs = 1;
  const win = (id, crown = 1) => {
    p.uncharted.grog = 99;
    p.musterStage(stageOf(id), crown);
    p.slots[0] = 'cabinBoy';
    for (const s of STAGES) if (s.sea < stageOf(id).sea) p.uncharted.crowns[s.id] = 3;
    assert.notEqual(p.beginStage(), null, `sail ${id}`);
    const r = p.winStage(() => 0.5);
    p.endStage();
    return r.crew;
  };
  for (let i = 1; i <= 5; i++) win(`1-${i}`);
  assert.deepEqual(win('1-6'), ['rigger']);
  assert.deepEqual(win('1-6'), [], 'not twice');
  assert.equal(p.owned.filter((id) => id === 'rigger').length, 1);
  assert.equal(p.heroStarCount('rigger'), PACKS.maxStars, 'joins at 5 stars');
  assert.equal(stageCrewReward(stageOf('1-6')).hero, 'rigger');
  for (let c = 2; c <= 3; c++) for (let i = 1; i <= 6; i++) win(`1-${i}`, c);
  assert.ok(p.isOwned('coralDruid'), 'all of Sea 1 at 3 crowns');
  assert.deepEqual(crewEarned(p.uncharted), ['rigger', 'coralDruid']);
  assert.ok(!Object.keys(HEROES).some((id) => HEROES[id].earned && !Object.values(UNCHARTED.crewRewards.stages).includes(id)
    && !(id in UNCHARTED.crewRewards.seas)), 'every earned crewmate has a reward');
});

// --- Run ---

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}\n     ${err.stack.split('\n').slice(0, 3).join('\n     ')}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
if (failed) process.exitCode = 1;
