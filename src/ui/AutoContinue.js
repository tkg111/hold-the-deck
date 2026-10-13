import { AUTO_CONTINUE, DISPLAY } from '../config.js';
import { Button } from './Button.js';

// Auto-continue, kept across scene restarts in a session (not saved): when
// on, a cleared wave is followed by the next one and a lost wave is retried,
// each after AUTO_CONTINUE.delayMs. Any other button (or a ship slot) pauses
// it until a wave is started by hand with SET SAIL! again; so does a Boss
// Hunt. Its toggle sits in the bottom-left corner of the view, during waves
// too.
const auto = { on: false, paused: false };

export class AutoContinue {
  constructor(scene) {
    this.scene = scene;
    this.timer = null;
    this.starting = false;   // a wave it started itself (doesn't un-pause)
    this.button = new Button(scene, 0, 0, {
      height: 12, font: 'small', width: AUTO_CONTINUE.width, label: this.label(),
      onClick: () => this.toggle(),
    });
    this.corner = scene.add.container(0, 0, [this.button.setPosition(AUTO_CONTINUE.x, AUTO_CONTINUE.y)]).setDepth(20);

    // Buttons that don't pause it: its own, SET SAIL! (a wave started by
    // hand resumes it instead) and the in-battle controls (speed, abilities).
    const onButton = (b) => {
      if (b === this.button || b === scene.startButton || b === scene.speedButton) return;
      if (b.parentContainer === scene.abilityBar) return;
      this.pause();
    };
    // A Boss Hunt (from the map) leaves it paused, and isn't followed by
    // anything.
    const onWaveStarted = ({ hunt = false } = {}) => {
      this.cancel();
      if (!this.starting && !hunt && auto.paused) {
        auto.paused = false;
        this.refresh();
      }
    };
    const handlers = {
      'button-pressed': onButton,
      'slot-clicked': () => this.pause(),   // opens the hero picker
      'wave-started': onWaveStarted,
      'wave-ended': (_won, { hunt = false } = {}) => (hunt ? this.pause() : this.schedule()),
    };
    for (const [name, fn] of Object.entries(handlers)) scene.events.on(name, fn);
    scene.events.once('shutdown', () => {
      this.cancel();
      for (const [name, fn] of Object.entries(handlers)) scene.events.off(name, fn);
    });
  }

  label() { return `AUTO-CONTINUE ${!auto.on ? 'OFF' : auto.paused ? 'PAUSED' : 'ON'}`; }
  refresh() { this.button.setLabel(this.label()); }

  // Bottom-left corner of the view.
  layout(view) {
    this.corner.setPosition(view.left, Math.round(view.bottom - DISPLAY.height));
  }

  toggle() {
    auto.on = !auto.on;
    auto.paused = false;
    this.refresh();
    if (auto.on && this.scene.state === 'idle') this.schedule();
    else this.cancel();
  }

  cancel() {
    this.timer?.remove();
    this.timer = null;
  }

  // Start the next wave (or retry) after the pause, if still wanted.
  schedule() {
    this.cancel();
    if (!auto.on || auto.paused) return;
    this.timer = this.scene.time.delayedCall(AUTO_CONTINUE.delayMs, () => {
      this.timer = null;
      if (!auto.on || auto.paused || this.scene.state !== 'idle') return;
      this.starting = true;
      this.scene.startWave({ confirmed: true });
      this.starting = false;
    });
  }

  pause() {
    if (!auto.on || auto.paused) return;
    auto.paused = true;
    this.cancel();
    this.refresh();
  }
}
