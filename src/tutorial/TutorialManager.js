import { TUTORIAL } from '../config.js';
import { ONBOARDING, TIPS } from './steps.js';

// The Captain's tutorial: runs the onboarding script and the one-time tips
// (steps.js) off the game's events. It knows nothing of Phaser: the game
// side is a host (TutorialHost: the events, what the game is doing, and the
// few things the tutorial does to it) and a view (TutorialScene: the
// dialogue box, the spotlight and the banner). Tests drive it with fakes.
//
// UI code registers spotlight targets by key (registerTarget); steps name
// them. The state lives in progress.tutorial ({ onboarding: the step id it
// waits on or 'done', tipsSeen: tip ids, tipsOn }), saved with the game.

export const DONE = 'done';
export const ONBOARDING_ID = 'onboarding';

// A fresh save's: the onboarding from its first step, no tips seen, on.
export const newTutorialState = () => ({ onboarding: ONBOARDING[0].id, tipsSeen: [], tipsOn: true });

const triggersOf = (step) => [].concat(step.trigger ?? 'next');
// The scene a step shows over (and pauses).
export const sceneOf = (needs) => (needs === 'idle' || needs === 'wave' || !needs ? 'GameScene' : needs);

export class TutorialManager {
  constructor({ onboarding = ONBOARDING, tips = TIPS } = {}) {
    this.onboardingSteps = onboarding;
    this.tips = tips;
    this.targets = new Map();
    this.host = null;
    this.view = null;
    this.events = [];       // events waiting while one is handled
    this.handling = false;
    this.clear();
  }

  // Hook up the game (TutorialHost) and the view (TutorialScene's driver).
  install(host, view) {
    this.host = host;
    this.view = view;
  }

  // Forget everything under way (a new battle scene, or a reset).
  clear() {
    this.queue = [];        // steps triggered, waiting to show: { script, step, data, at }
    this.active = null;     // the step showing (not banners): { script, step, missingMs }
    this.scripts = new Map();   // running scripts by id: { id, steps, pos, carry, resumed, data }
    this.clock = 0;         // real ms (tick)
    this.wasIdle = false;
  }

  get state() { return this.host.progress.tutorial; }
  get onboardingDone() { return this.state.onboarding === DONE; }
  tipSeen(id) { return this.state.tipsSeen.includes(id); }

  // --- Targets ---

  // UI code: key -> a game object, { scene, bounds() } or a function
  // returning either (looked up each time; null when there's none).
  registerTarget(key, target) {
    this.targets.set(key, target);
  }

  target(key) {
    const t = this.targets.get(key);
    return (typeof t === 'function' ? t() : t) ?? null;
  }

  // --- Events ---

  // A game event (see TutorialHost for the list). Events raised while one
  // is being handled (a step's finish starting a wave...) wait their turn.
  emit(event, data = {}) {
    if (!this.host) return;
    this.events.push([event, data]);
    if (this.handling) return;
    this.handling = true;
    try {
      while (this.events.length) this.handle(...this.events.shift());
    } finally {
      this.handling = false;
    }
  }

  handle(event, data) {
    if (event === 'battle-ready') this.onBattleReady();
    // A guided step's action.
    const a = this.active;
    if (a?.step.mode === 'guided' && a.step.action === event && (a.step.actionWhen?.(data) ?? true)) this.finishActive();
    this.dropStale(event, data);
    this.checkTriggers(event, data);
    this.pump();
  }

  // Real time passing (every frame): delays, guided steps whose target has
  // gone, and the battle going idle (the 'idle' event).
  tick(ms) {
    if (!this.host) return;
    this.clock += ms;
    const a = this.active;
    if (a?.step.target) {
      const shown = this.host.targetShown(this.target(a.step.target));
      a.missingMs = shown ? 0 : a.missingMs + ms;
      if (!shown && a.step.mode === 'guided' && a.missingMs >= TUTORIAL.missingMs) this.skipActive();
    }
    const idle = this.host.isReady('idle');
    if (idle && !this.wasIdle) this.emit('idle');
    this.wasIdle = idle;
    this.pump();
  }

  // The battle scene has (re)started: nothing on screen survives it. The
  // onboarding picks up where it was (a step part-way through a run goes
  // back to its run's first, shown at the next idle), and an unseen
  // merchant tip makes the first merchant a Trade Cog.
  onBattleReady() {
    if (this.active) this.endActive();
    this.view?.hide();
    this.clear();
    this.host.setSlow(false);
    if (!this.onboardingDone) {
      let pos = Math.max(0, this.onboardingSteps.findIndex((s) => s.id === this.state.onboarding));
      const resume = this.onboardingSteps[pos].resume;
      let resumed = false;
      if (resume && resume !== this.onboardingSteps[pos].id) {
        pos = this.onboardingSteps.findIndex((s) => s.id === resume);
        resumed = true;
      }
      this.scripts.set(ONBOARDING_ID, {
        id: ONBOARDING_ID, steps: this.onboardingSteps, pos, resumed, onboarding: true,
      });
      this.state.onboarding = this.onboardingSteps[pos].id;
    }
    this.prepareMerchant();
  }

  prepareMerchant() {
    if (this.tips.merchant && this.tipsOpen && !this.tipSeen('merchant')) this.host.forceMerchant('trade_cog');
  }

  get tipsOpen() { return this.state.tipsOn; }

  // Steps that can't show any more: those needing a wave once it's over,
  // and those over a screen once it's closed. A tip that hadn't shown yet
  // can come again; one under way is over.
  dropStale(event, data) {
    const stale = (item) => {
      const needs = item.step.needs;
      if (event === 'wave-ended' && needs === 'wave') return true;
      if (event === 'scene-close' && needs === data.key) return true;
      return (item.step.abortOn ?? []).includes(event);
    };
    this.queue = this.queue.filter((item) => {
      if (!stale(item)) return true;
      // (The onboarding's step just waits for its trigger again.)
      if (item.script.onboarding) return false;
      if (item.script.shown) this.endScript(item.script);
      else this.scripts.delete(item.script.id);
      return false;
    });
    for (const script of [...this.scripts.values()]) {
      const waiting = script.steps[script.pos];
      if (!script.onboarding && script.shown && waiting && !this.isQueued(script) && this.active?.script !== script
        && stale({ step: waiting })) this.endScript(script);
    }
    if (this.active && stale(this.active)) {
      const { script } = this.active;
      this.endActive();
      if (!script.onboarding) this.endScript(script);
      this.view?.hide();
    }
  }

  isQueued(script) { return this.queue.some((i) => i.script === script); }

  // Start any step waiting on this event: the onboarding's, the next step of
  // a tip under way, or a new tip.
  checkTriggers(event, data) {
    for (const script of this.scripts.values()) {
      if (this.isQueued(script) || this.active?.script === script) continue;
      const step = script.steps[script.pos];
      if (!step) continue;
      if (script.resumed) {
        if (event === 'idle') this.enqueue(script, step, data, { now: true });
        continue;
      }
      if (triggersOf(step).includes(event) && (step.when?.(this.host, data) ?? true)) this.enqueue(script, step, data);
    }
    if (!this.tipsOpen) return;
    for (const [id, steps] of Object.entries(this.tips)) {
      if (this.tipSeen(id) || this.scripts.has(id)) continue;
      const step = steps[0];
      if (!triggersOf(step).includes(event) || !(step.when?.(this.host, data) ?? true)) continue;
      const script = { id, steps, pos: 0 };
      this.scripts.set(id, script);
      this.enqueue(script, step, data);
    }
  }

  enqueue(script, step, data, { now = false } = {}) {
    script.resumed = false;
    script.data = data;
    this.queue.push({
      script, step, data, at: this.clock + (now ? 0 : step.delayMs ?? 0),
    });
  }

  // Show what's ready: banners whenever nothing else is up, and one step
  // at a time.
  pump() {
    for (let guard = 0; guard < 50 && !this.active; guard++) {
      const i = this.queue.findIndex((item) => this.clock >= item.at && this.host.isReady(item.step.needs ?? (item.step.mode === 'banner' ? 'any' : 'idle')));
      if (i < 0) return;
      const [item] = this.queue.splice(i, 1);
      this.show(item);
    }
  }

  show({ script, step: base, data }) {
    const g = this.host;
    if (base.skipIf?.(g)) {
      this.advance(script, { carry: base.lines });
      return;
    }
    const step = { ...base, ...(base.adapt?.(g) ?? {}) };
    const lines = step.lines ?? script.carry ?? null;
    script.carry = null;
    if (!script.onboarding && !script.shown) {
      script.shown = true;
      this.state.tipsSeen.push(script.id);
      g.save();
    }
    step.prepare?.(g, data);
    if (step.mode === 'banner') {
      this.view.banner(lines[0]);
      this.advance(script);
      return;
    }
    this.active = { script, step, missingMs: 0 };
    const scene = sceneOf(step.needs);
    this.active.paused = (step.pause ?? step.mode !== 'guided') ? scene : null;
    if (this.active.paused) g.pause(scene);
    if (step.slow) g.setSlow(true);
    g.holdAutoContinue();
    this.view.show({
      mode: step.mode,
      lines,
      target: step.target ?? null,
      scene,
      skip: !!script.onboarding,
      onLinesDone: () => {
        if (this.active?.step === step && step.mode !== 'guided') this.finishActive();
      },
    });
  }

  // Undo what showing the active step did to the game.
  endActive() {
    const a = this.active;
    this.active = null;
    if (a.paused) this.host.resume(a.paused);
    if (a.step.slow) this.host.setSlow(false);
  }

  // The active step is done (its lines read, or its action taken): on to
  // the next. The view stays up if another step follows straight away.
  finishActive() {
    const { script, step } = this.active;
    this.endActive();
    this.advance(script);
    step.finish?.(this.host);
    this.pump();
    if (!this.active) this.view.hide();
  }

  // A guided step that can't go on (its target gone or disabled): skipped.
  skipActive() {
    const { script } = this.active;
    this.endActive();
    this.advance(script);
    this.pump();
    if (!this.active) this.view.hide();
  }

  // Move a script to its next step; a 'next' one is queued right away
  // (with the lines of a step skipped before it, if it has none).
  advance(script, { carry = null } = {}) {
    script.pos++;
    const next = script.steps[script.pos];
    if (!next) {
      this.endScript(script);
      return;
    }
    if (script.onboarding) {
      this.state.onboarding = next.id;
      this.host.save();
    }
    if (!triggersOf(next).includes('next')) return;
    if (carry && !next.lines) script.carry = carry;
    this.enqueue(script, next, script.data, { now: true });
  }

  endScript(script) {
    this.scripts.delete(script.id);
    this.queue = this.queue.filter((i) => i.script !== script);
    if (script.onboarding) {
      this.state.onboarding = DONE;
      this.host.save();
    }
  }

  // --- Settings and Skip ---

  // Skip (during the onboarding): it's done; tips carry on.
  skipOnboarding() {
    const script = this.scripts.get(ONBOARDING_ID);
    if (this.active?.script.onboarding) this.endActive();
    if (script) this.endScript(script);
    this.state.onboarding = DONE;
    this.host.save();
    this.pump();
    if (!this.active) this.view.hide();
  }

  // Replay tutorial: the onboarding from the start (at the next idle) and
  // every tip again.
  replay() {
    for (const script of [...this.scripts.values()]) this.endScript(script);
    if (this.active) {
      this.endActive();
      this.view.hide();
    }
    this.state.onboarding = this.onboardingSteps[0].id;
    this.state.tipsSeen = [];
    this.scripts.set(ONBOARDING_ID, {
      id: ONBOARDING_ID, steps: this.onboardingSteps, pos: 0, onboarding: true,
    });
    this.host.save();
    this.prepareMerchant();
  }

  // Captain's tips on or off. Off: no more tips (a guided one under way
  // finishes, but its script stops there); the onboarding isn't a tip.
  setTipsOn(on) {
    this.state.tipsOn = on;
    this.host.save();
    if (on) {
      this.prepareMerchant();
      return;
    }
    this.host.forceMerchant(null);
    for (const script of [...this.scripts.values()]) {
      if (script.onboarding) continue;
      if (this.active?.script === script) {
        if (this.active.step.mode === 'guided') {
          script.steps = script.steps.slice(0, script.pos + 1);
          continue;
        }
        this.endActive();
        this.view.hide();
      }
      this.endScript(script);
    }
  }
}

// The game's one tutorial (UI code registers its targets here).
export const tutorial = new TutorialManager();
