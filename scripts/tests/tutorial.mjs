// Headless tests of the Captain's tutorial (src/tutorial/): the manager
// driven by simulated game events, with a fake game (host) and view, and
// the save migration. Run: npm test
import assert from 'node:assert/strict';
import { MEALS, TUTORIAL } from '../../src/config.js';
import { Progress } from '../../src/systems/Progress.js';
import { loadProgress, SAVE_KEY } from '../../src/systems/Save.js';
import { DONE, TutorialManager } from '../../src/tutorial/TutorialManager.js';

// --- Fakes ---

// The game as the steps see it: the battle's state, an overlay scene open
// (its key) or none, which targets are on screen, and a log of what the
// tutorial did to it.
class FakeHost {
  constructor(manager, progress = new Progress()) {
    this.manager = manager;
    this.progress = progress;
    this.state = 'idle';
    this.overlay = null;
    this.shipwrightTab = 'crew';
    this.hidden = new Set();   // target keys not on screen
    this.paused = new Set();
    this.slow = false;
    this.forced = null;
    this.rigged = false;
  }

  get shipwrightOpen() { return this.progress.shipwrightOpen; }
  get canAffordDeck() { return this.progress.canBuildDeck && this.progress.gold >= this.progress.deckCost(); }
  get anyRecipeKnown() { return Object.keys(MEALS.list).some((id) => this.progress.isRecipeKnown(id)); }
  get huntsUnlocked() { return this.progress.mapUnlocked; }
  get expeditionsUnlocked() { return (this.progress.islandRecord('skull_cove')?.best ?? 0) >= 10; }

  isReady(needs) {
    if (needs === 'any') return true;
    if (needs === 'idle') return this.state === 'idle' && !this.overlay;
    if (needs === 'wave') return this.state === 'running' && !this.overlay;
    return this.overlay === needs;
  }

  targetShown(target) { return !!target && !this.hidden.has(target.key); }
  save() {}
  pause(key) { this.paused.add(key); }
  resume(key) { this.paused.delete(key); }
  setSlow(on) { this.slow = on; }
  holdAutoContinue() {}
  forceMerchant(type) { this.forced = type; }
  rigCatch() { this.rigged = true; }
  topUpForCrewBuy() {
    const cost = this.progress.heroLevelCost('cabinBoy');
    if (this.progress.gold < cost) this.progress.gold = cost;
  }

  startWave() {
    this.state = 'running';
    this.manager.emit('wave-started', {
      wave: this.progress.wave, boss: false, finale: false, hunt: false, dive: false,
    });
  }

  endWave(won) {
    this.state = 'idle';
    if (won) this.progress.winWave();
    this.manager.emit('wave-ended', { won, hunt: false, dive: false });
    if (won) this.manager.emit('wave-won', {});
  }
}

// The view: what's showing, and a tap through its lines.
class FakeView {
  constructor() {
    this.step = null;
    this.banners = [];
  }

  show(step) { this.step = step; }
  hide() { this.step = null; }
  banner(line) { this.banners.push(line.text); }

  // Read every line (dialog and look steps then finish).
  tapThrough() {
    assert.ok(this.step, 'a step is showing');
    if (this.step.mode !== 'guided') this.step.onLinesDone();
  }
}

const TARGETS = ['hull', 'crew', 'shipwright', 'shipwrightHandle', 'shipwrightTab:crew', 'shipwrightTab:ship',
  'buyAmount', 'crewBuy', 'deckBuy', 'setSail', 'chests', 'voyage', 'merchant',
  'expeditionSlot', 'expeditionCrew', 'expeditionSend', 'galleyCast', 'galleyBobber', 'galleyReel'];

function setup(progress) {
  const manager = new TutorialManager();
  const host = new FakeHost(manager, progress);
  const view = new FakeView();
  manager.install(host, view);
  for (const key of TARGETS) manager.registerTarget(key, { key });
  manager.emit('battle-ready');
  return { manager, host, view };
}

// The step showing: its mode, target and first line.
const showing = (view) => view.step && `${view.step.mode}:${view.step.target ?? '-'}`;

// Long enough for a step after a wave (its banner shows first).
const AFTER_WAVE = TUTORIAL.waveDelayMs + 100;

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// --- Onboarding ---

test('a new save walks the onboarding to done', () => {
  const { manager, host, view } = setup();
  const p = host.progress;
  assert.equal(p.tutorial.onboarding, 'O1');
  manager.tick(16);   // the battle is idle: O1
  assert.equal(showing(view), 'dialog:-');
  assert.equal(view.step.lines.length, 3);
  assert.ok(host.paused.has('GameScene'), 'a dialog pauses the battle');
  view.tapThrough();
  assert.equal(showing(view), 'look:hull');
  view.tapThrough();
  assert.equal(showing(view), 'look:crew');
  view.tapThrough();   // ...and wave 1 sets off
  assert.equal(host.state, 'running');
  assert.equal(view.step, null);
  assert.equal(host.paused.size, 0);
  assert.equal(p.tutorial.onboarding, 'O4');

  manager.emit('enemy-killed', {});
  assert.deepEqual(view.banners, ['Gold! Every foe drops some.']);
  p.gold = 0;   // spent nothing yet, earned little: O6 tops it up
  host.endWave(true);
  manager.tick(16);
  assert.equal(view.step, null, 'waits for the wave banner');
  manager.tick(AFTER_WAVE);
  assert.equal(showing(view), 'look:shipwright', 'the Shipwright is out: a look at it');
  view.tapThrough();
  // The Crew tab is already up: straight to the cheapest upgrade, with O6's line.
  assert.equal(showing(view), 'guided:crewBuy');
  assert.match(view.step.lines[0].text, /Train up a crew member/);
  assert.ok(p.gold >= p.heroLevelCost('cabinBoy'), 'gold topped up to the price');
  manager.emit('upgrade-bought', { kind: 'hull' });
  assert.equal(showing(view), 'guided:crewBuy', 'only the crew upgrade counts');
  manager.emit('upgrade-bought', { kind: 'crew' });
  assert.equal(showing(view), 'look:buyAmount');
  view.tapThrough();
  assert.equal(showing(view), 'guided:setSail');
  host.startWave();
  assert.equal(view.step, null);
  assert.equal(p.tutorial.onboarding, 'O9');

  // Gold reaches the deck's price: O9 at the next idle.
  p.gold = p.deckCost();
  manager.tick(16);
  assert.equal(view.step, null, 'not mid-wave');
  host.endWave(true);
  manager.tick(16);   // idle: O9 is due once the wave's banner has shown
  manager.tick(AFTER_WAVE);
  assert.equal(showing(view), 'guided:shipwrightTab:ship');
  assert.match(view.step.lines[0].text, /Enough gold for a new deck/);
  manager.emit('shipwright-tab', { tab: 'ship' });
  host.shipwrightTab = 'ship';
  assert.equal(showing(view), 'guided:deckBuy');
  assert.equal(view.step.lines, null, 'keeps the line already up');
  p.buildDeck();
  manager.emit('upgrade-bought', { kind: 'deck' });
  assert.equal(showing(view), 'dialog:-');
  assert.match(view.step.lines[0].text, /That's the basics/);
  view.tapThrough();
  assert.equal(view.step, null);
  assert.equal(p.tutorial.onboarding, DONE);
});

test('a short purse at wave 5 gets a dialog about the deck, no forced buy', () => {
  const p = new Progress();
  p.tutorial.onboarding = 'O9';
  for (let w = 0; w < 4; w++) p.winWave();
  p.gold = 0;
  const { manager, host, view } = setup(p);
  manager.tick(16);
  assert.equal(view.step, null, 'wave 5 not cleared yet');
  host.state = 'running';
  manager.tick(16);
  host.endWave(true);
  manager.tick(16);
  manager.tick(AFTER_WAVE);
  assert.equal(showing(view), 'dialog:-');
  assert.match(view.step.lines[0].text, /Save up for a new deck/);
  view.tapThrough();
  assert.match(view.step.lines[0].text, /That's the basics/);
  view.tapThrough();
  assert.equal(p.tutorial.onboarding, DONE);
});

test('Skip ends the onboarding', () => {
  const { manager, host, view } = setup();
  manager.tick(16);
  assert.equal(showing(view), 'dialog:-');
  assert.equal(view.step.skip, true, 'Skip shows during the onboarding');
  manager.skipOnboarding();
  assert.equal(view.step, null);
  assert.equal(host.progress.tutorial.onboarding, DONE);
  assert.equal(host.paused.size, 0, 'the battle runs again');
  host.startWave();
  manager.emit('enemy-killed', {});
  assert.deepEqual(view.banners, [], 'no more onboarding');
});

test('a guided step whose target is missing moves on', () => {
  const p = new Progress();
  p.tutorial.onboarding = 'O8';
  const { manager, host, view } = setup(p);
  host.hidden.add('setSail');
  manager.tick(16);   // resumed mid-run: back to O5 at idle
  assert.equal(showing(view), 'look:shipwright');
  view.tapThrough();
  host.hidden.add('crewBuy');
  assert.equal(showing(view), 'guided:crewBuy');
  manager.tick(500);
  assert.equal(showing(view), 'guided:crewBuy', 'waits a moment first');
  manager.tick(600);
  assert.equal(showing(view), 'look:buyAmount', 'moved on');
  view.tapThrough();
  assert.equal(showing(view), 'guided:setSail');
  manager.tick(1100);
  assert.equal(view.step, null);
  assert.equal(p.tutorial.onboarding, 'O9');
});

test('Replay starts the onboarding over and forgets the tips', () => {
  const p = new Progress();
  p.tutorial.onboarding = DONE;
  p.tutorial.tipsSeen = ['first_loss'];
  const { manager, view } = setup(p);
  manager.tick(16);
  assert.equal(view.step, null);
  manager.replay();
  manager.tick(16);   // still idle: no new edge
  manager.emit('idle');
  assert.equal(showing(view), 'dialog:-');
  assert.deepEqual(p.tutorial.tipsSeen, []);
});

// --- Tips ---

test('the first loss gets one dialog, once', () => {
  const p = new Progress();
  p.tutorial.onboarding = DONE;
  const { manager, host, view } = setup(p);
  host.startWave();
  host.endWave(false);
  manager.tick(AFTER_WAVE);
  assert.equal(showing(view), 'dialog:-');
  assert.match(view.step.lines[0].text, /Blast/);
  view.tapThrough();
  assert.equal(view.step, null);
  assert.deepEqual(p.tutorial.tipsSeen, ['first_loss']);
  host.startWave();
  host.endWave(false);
  manager.tick(AFTER_WAVE);
  assert.equal(view.step, null);
});

test('tips off: no tips', () => {
  const p = new Progress();
  p.tutorial.onboarding = DONE;
  const { manager, host, view } = setup(p);
  manager.setTipsOn(false);
  host.startWave();
  host.endWave(false);
  manager.tick(AFTER_WAVE);
  assert.equal(view.step, null);
  assert.deepEqual(p.tutorial.tipsSeen, []);
});

// A save done with the onboarding, its tips all ahead of it.
function veteranSetup() {
  const p = new Progress();
  p.tutorial.onboarding = DONE;
  return setup(p);
}

test('the first merchant: a Trade Cog, guided at half speed, then a word', () => {
  const { manager, host, view } = veteranSetup();
  assert.equal(host.forced, 'trade_cog');
  host.startWave();
  manager.emit('merchant-tappable', {});
  assert.equal(showing(view), 'guided:merchant');
  assert.equal(host.slow, true);
  assert.equal(host.paused.size, 0, 'the battle goes on');
  manager.emit('merchant-plundered', {});
  assert.equal(host.slow, false);
  assert.equal(showing(view), 'dialog:-');
  assert.match(view.step.lines[0].text, /Free gold/);
  view.tapThrough();
  assert.equal(view.step, null);
  manager.emit('merchant-tappable', {});
  assert.equal(view.step, null, 'once');
});

test('a merchant that sails off ends its tip', () => {
  const { manager, host, view } = veteranSetup();
  host.startWave();
  manager.emit('merchant-tappable', {});
  manager.emit('merchant-gone', {});
  assert.equal(view.step, null);
  assert.equal(host.slow, false);
  assert.ok(host.progress.tutorial.tipsSeen.includes('merchant'));
});

test('the first Galley cast is guided and rigged, then the recipe banner', () => {
  const { manager, host, view } = veteranSetup();
  const p = host.progress;
  host.overlay = 'GalleyScene';
  manager.emit('scene-open', { key: 'GalleyScene' });
  assert.equal(showing(view), 'guided:galleyCast');
  assert.ok(host.rigged, 'a Sardine with a wide zone');
  manager.emit('fishing-cast', {});
  assert.equal(view.step, null);
  manager.emit('fishing-bite', {});
  assert.equal(showing(view), 'guided:galleyBobber');
  manager.emit('reel-started', {});
  assert.equal(showing(view), 'look:galleyReel');
  assert.ok(host.paused.has('GalleyScene'), 'the reel waits');
  view.tapThrough();
  assert.equal(host.paused.size, 0);
  p.catchFish('sardine');
  manager.emit('fish-landed', { id: 'sardine' });
  assert.equal(showing(view), 'dialog:-');
  assert.match(view.step.lines[0].text, /A Sardine/);
  view.tapThrough();
  assert.deepEqual(view.banners, ['New recipe! Eat a meal for a boost that lasts 10 waves.']);
});

test('closing the Galley mid-tip ends it', () => {
  const { manager, host, view } = veteranSetup();
  host.overlay = 'GalleyScene';
  manager.emit('scene-open', { key: 'GalleyScene' });
  manager.emit('fishing-cast', {});
  host.overlay = null;
  manager.emit('scene-close', { key: 'GalleyScene' });
  host.overlay = 'GalleyScene';
  manager.emit('scene-open', { key: 'GalleyScene' });
  manager.emit('fishing-bite', {});
  assert.equal(view.step, null);
  assert.ok(host.progress.tutorial.tipsSeen.includes('galley'));
});

test('expeditions: board, slot, crew, Send; no crew off the ship moves on', () => {
  const p = new Progress();
  p.tutorial.onboarding = DONE;
  p.tutorial.tipsSeen = ['chest'];
  p.islands.skull_cove.best = 10;
  const { manager, host, view } = setup(p);
  manager.tick(16);
  manager.tick(AFTER_WAVE);
  assert.equal(showing(view), 'guided:voyage');
  host.overlay = 'ExpeditionScene';
  manager.emit('scene-open', { key: 'ExpeditionScene' });
  assert.equal(showing(view), 'guided:expeditionSlot');
  manager.emit('expedition-plan', {});
  host.hidden.add('expeditionCrew');
  assert.equal(showing(view), 'guided:expeditionCrew');
  assert.match(view.step.lines[0].text, /Match their traits/);
  manager.tick(1100);
  assert.equal(showing(view), 'guided:expeditionSend');
  host.hidden.add('expeditionSend');   // nobody picked: Send is disabled
  manager.tick(1100);
  assert.equal(view.step, null);
});

test('arriving at a new island: its dialog, once', () => {
  const { manager, host, view } = veteranSetup();
  manager.emit('island-arrived', { id: 'frostbite_reef' });
  manager.tick(16);
  assert.equal(showing(view), 'dialog:-');
  assert.match(view.step.lines[0].text, /Frostbite Reef/);
  assert.equal(view.step.lines.length, 2);
  view.tapThrough();
  manager.emit('island-arrived', { id: 'frostbite_reef' });
  manager.tick(16);
  assert.equal(view.step, null);
  host.startWave();
});

test('turning tips off mid-guided lets that step finish, then stops', () => {
  const { manager, host, view } = veteranSetup();
  host.startWave();
  manager.emit('merchant-tappable', {});
  manager.setTipsOn(false);
  assert.equal(showing(view), 'guided:merchant');
  manager.emit('merchant-plundered', {});
  assert.equal(view.step, null, 'no follow-up');
  assert.equal(host.forced, null);
});

// --- Saves ---

// A save as an older version of the game wrote it: Progress' shape minus
// the tutorial.
function oldSave(edit) {
  const data = new Progress().toSave();
  delete data.tutorial;
  edit(data);
  return JSON.stringify({ version: 18, savedAt: '2026-10-01T00:00:00Z', data });
}

function load(raw) {
  const store = new Map([[SAVE_KEY, raw]]);
  globalThis.window = {
    localStorage: {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
  };
  return loadProgress();
}

test('an old save past wave 1 gets no onboarding and no tips for what it has seen', () => {
  const p = load(oldSave((d) => { d.islands.skull_cove.wave = 12; d.islands.skull_cove.best = 11; }));
  assert.equal(p.tutorial.onboarding, DONE);
  assert.ok(p.tutorial.tipsSeen.includes('first_loss'));
  const { manager, host, view } = setup(p);
  manager.tick(16);
  assert.equal(view.step, null, 'no onboarding');
  host.startWave();
  host.endWave(false);
  manager.tick(AFTER_WAVE);
  assert.equal(view.step, null, 'no first-loss tip');
});

test('an old save gets no tips for features it already has, and the rest still come', () => {
  const p = load(oldSave((d) => {
    d.islands.skull_cove = { ...d.islands.skull_cove, wave: 50, best: 50, cleared: true };
    d.islands.ember_isle = { wave: 3, best: 2, cleared: false, bossPaid: 0, dropsPaid: {} };
    d.island = 'ember_isle';
    d.owned = ['cabinBoy', 'shipsCook'];
    d.defeats = { kraken: 1 };
    d.materials = { kraken_ink: 2 };
    d.merchantsPlundered = 3;
    d.fishCaught = 4;
    d.fishLog = { sardine: 4 };
  }));
  const seen = p.tutorial.tipsSeen;
  for (const id of ['first_loss', 'log', 'merchant', 'boss_incoming', 'boss_material', 'boss_hunts', 'chest',
    'expeditions', 'galley', 'cooking', 'ember', 'finale']) assert.ok(seen.includes(id), `${id} seen`);
  for (const id of ['frost', 'fog', 'abyss', 'ship_parts']) assert.ok(!seen.includes(id), `${id} still to come`);
  const { manager, host, view } = setup(p);
  manager.tick(16);
  manager.tick(AFTER_WAVE);
  assert.equal(view.step, null, 'nothing on load');
  manager.emit('island-arrived', { id: 'ember_isle' });
  manager.tick(16);
  assert.equal(view.step, null, 'Ember Isle already reached');
  manager.emit('island-arrived', { id: 'frostbite_reef' });
  manager.tick(16);
  assert.match(view.step.lines[0].text, /Frostbite Reef/);
  host.startWave();
});

test('an old save still at wave 1 gets the onboarding', () => {
  const p = load(oldSave(() => {}));
  assert.equal(p.tutorial.onboarding, 'O1');
  assert.deepEqual(p.tutorial.tipsSeen, []);
  assert.equal(p.tutorial.tipsOn, true);
});

test('the tutorial state round-trips through a save', () => {
  const p = new Progress();
  p.tutorial = { onboarding: 'O7', tipsSeen: ['first_loss'], tipsOn: false };
  const q = Progress.fromSave(JSON.parse(JSON.stringify(p.toSave())));
  assert.deepEqual(q.tutorial, p.tutorial);
  const bad = Progress.fromSave({ ...p.toSave(), tutorial: { onboarding: 'nope', tipsSeen: [3, 'x', 'x'] } });
  assert.deepEqual(bad.tutorial, { onboarding: DONE, tipsSeen: ['x'], tipsOn: true });
});

let failed = 0;
for (const { name, fn } of tests) {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}\n     ${err.message}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exitCode = failed ? 1 : 0;
