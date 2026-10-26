import { AUTO_CONTINUE } from '../config.js';
import { Button } from './Button.js';
import { light, text } from './kit.js';

// Auto-continue, kept across scene restarts in a session (not saved): when
// on, a cleared wave is followed by the next one and a lost wave is retried,
// each after AUTO_CONTINUE.delayMs. Any other button (or a ship slot) pauses
// it until a wave is started by hand with SET SAIL! again; so does a Boss
// Hunt. Its AUTO NEXT toggle sits in the bottom-left corner of the view's
// safe area, during waves too.
const auto = { on: false, paused: false };

export class AutoContinue {
  constructor(scene) {
    this.scene = scene;
    this.timer = null;
    this.starting = false;   // a wave it started itself (doesn't un-pause)
    // AUTO over NEXT (or PAUSED): gold while on, wood while off or paused.
    const { width, height } = AUTO_CONTINUE;
    this.button = new Button(scene, 0, 0, {
      width, height, label: '', onClick: () => this.toggle(),
    });
    this.lines = [
      text(scene, 0, -4, 'AUTO', light({ font: 'small' })).setOrigin(0.5),
      text(scene, 0, 5, '', light({ font: 'small' })).setOrigin(0.5),
    ];
    this.button.content.add(this.lines);
    this.corner = scene.add.container(0, 0, [this.button]).setDepth(20);
    this.refresh();

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

  refresh() {
    const on = auto.on && !auto.paused;
    this.button.setStyle(on ? 'gold' : 'wood');
    this.lines[1].setText(auto.on && auto.paused ? 'PAUSED' : 'NEXT');
    for (const t of this.lines) t.setFontKey(on ? 'small_dark' : 'small_light');
  }

  // The view's safe bottom-left corner, or with its bottom at y (above the
  // button bar, see GameScene.placeAutoNext).
  layout(view, bottom = null) {
    const { width, height } = AUTO_CONTINUE;
    const b = bottom ?? view.safe.bottom;
    this.button.setPosition(Math.round(view.safe.left + width / 2), Math.round(b - height / 2));
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
