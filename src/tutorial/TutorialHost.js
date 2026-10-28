import Phaser from 'phaser';
import { ISLANDS, MEALS, TUTORIAL } from '../config.js';
import * as Expeditions from '../systems/Expeditions.js';
import { saveProgress } from '../systems/Save.js';
import { targetShown } from './targets.js';

// Events the scenes emit on their own event emitters that the tutorial
// listens to, besides each scene's create / shutdown ('battle-ready' for
// the battle, 'scene-open' / 'scene-close' { key } for the rest) and 'idle'
// (TutorialManager.tick: the battle between waves, nothing open over it):
//   GameScene: wave-started { wave, boss, finale, hunt, dive }, crew-awakened { id },
//     wave-ended (won, { hunt, dive }) (and 'wave-won' for a won island
//     wave), enemy-killed, boss-material, island-arrived { id },
//     shipwright-toggled { open }, shipwright-tab { tab },
//     upgrade-bought { kind: 'crew' | 'hull' | 'deck' },
//     merchant-tappable, merchant-plundered, merchant-gone
//   GalleyScene: fishing-cast, fishing-bite, reel-started, fish-landed { id }
//   ExpeditionScene: expedition-plan, expedition-crew, expedition-sent
const FORWARD = [
  'wave-started', 'wave-ended', 'enemy-killed', 'boss-material', 'island-arrived', 'crew-awakened',
  'shipwright-toggled', 'shipwright-tab', 'upgrade-bought',
  'merchant-tappable', 'merchant-plundered', 'merchant-gone',
  'fishing-cast', 'fishing-bite', 'reel-started', 'fish-landed',
  'expedition-plan', 'expedition-crew', 'expedition-sent',
];

const TUTORIAL_SCENE = 'TutorialScene';

// The game as the tutorial sees it (the `g` the steps get): its events,
// what's going on, and the few things the tutorial does to it.
export class TutorialHost {
  constructor(game, manager) {
    this.game = game;
    this.manager = manager;
    this.toppedUp = false;   // the onboarding's one gold top-up (this session)
  }

  // Once the game has booted (its scenes exist).
  install() {
    for (const scene of this.game.scene.scenes) {
      const { key } = scene.sys.settings;
      if (key === TUTORIAL_SCENE || key === 'TitleScene') continue;
      const events = scene.sys.events;
      events.on('create', () => this.manager.emit(key === 'GameScene' ? 'battle-ready' : 'scene-open', { key }));
      events.on('shutdown', () => this.manager.emit('scene-close', { key }));
      for (const name of FORWARD) events.on(name, (...args) => this.forward(name, args));
    }
    this.game.events.on('step', (_time, delta) => this.manager.tick(Math.min(delta, 100)));
  }

  forward(name, args) {
    if (name === 'wave-ended') {
      const [won, { hunt = false, dive = false } = {}] = args;
      this.manager.emit(name, { won, hunt, dive });
      if (won && !hunt && !dive) this.manager.emit('wave-won', {});
      return;
    }
    this.manager.emit(name, args[0] ?? {});
  }

  get battle() { return this.game.scene.getScene('GameScene'); }
  get progress() { return this.battle.progress; }

  scene(key) { return this.game.scene.getScene(key); }

  // Scenes up (running, or paused by the tutorial), but not the tutorial's.
  get openScenes() {
    return this.game.scene.scenes.filter((s) => {
      const { status, key } = s.sys.settings;
      return key !== TUTORIAL_SCENE && status >= Phaser.Scenes.RUNNING && status <= Phaser.Scenes.PAUSED;
    });
  }

  // Whether a step needing `needs` can show now (see steps.js).
  isReady(needs) {
    const gs = this.battle;
    const open = this.openScenes;
    if (!gs?.shipwright || !open.includes(gs)) return false;
    // While you were away comes before anything the Captain says.
    if (gs.awayOpen) return false;
    const overlay = open.some((s) => s !== gs);
    switch (needs) {
      case 'any': return true;
      case 'idle': return gs.state === 'idle' && !overlay && !gs.modalOpen && !gs.heroPicker.visible;
      case 'wave': return gs.state === 'running' && !overlay;
      default: return open.includes(this.scene(needs));
    }
  }

  // --- What the game's like ---

  get shipwrightOpen() { return this.progress.shipwrightOpen; }
  get shipwrightTab() { return this.battle.shipwright.tab; }
  get canAffordDeck() {
    const p = this.progress;
    return p.canBuildDeck && p.gold >= p.deckCost();
  }
  get anyRecipeKnown() { return Object.keys(MEALS.list).some((id) => this.progress.isRecipeKnown(id)); }
  get huntsUnlocked() {
    const p = this.progress;
    return p.mapUnlocked && ISLANDS.some((d) => p.hasHunts(d.id));
  }
  get expeditionsUnlocked() { return Expeditions.isUnlocked(this.progress); }

  targetShown(target) { return targetShown(target); }

  // --- What the tutorial does to it ---

  save() { saveProgress(this.progress); }

  pause(key) { this.game.scene.pause(key); }
  resume(key) { this.game.scene.resume(key); }

  // The battle at TUTORIAL.merchantSpeed (or back to normal).
  setSlow(on) { this.battle?.setSlowMotion?.(on ? TUTORIAL.merchantSpeed : 1); }

  // Auto-continue waits while the Captain talks.
  holdAutoContinue() { this.battle?.autoContinue?.pause(); }

  startWave() { this.battle.startWave(); }

  // The next merchant ship is this type (null: back to random).
  forceMerchant(type) {
    if (this.battle?.merchants) this.battle.merchants.forceNext = type;
  }

  // The Galley's next catch is TUTORIAL.galleyRig's.
  rigCatch() { this.scene('GalleyScene').rigCatch(TUTORIAL.galleyRig); }

  // Gold up to the cheapest crew upgrade's price, if short (once).
  topUpForCrewBuy() {
    const cheapest = this.battle.shipwright.cheapestCrew();
    const p = this.progress;
    if (this.toppedUp || !cheapest || p.gold >= cheapest.plan.cost) return;
    this.toppedUp = true;
    p.gold = cheapest.plan.cost;
    this.battle.refreshUi();
    this.save();
  }
}
