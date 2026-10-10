import { DEV, DISPLAY } from '../config.js';
import { Button } from '../ui/Button.js';

// Auto-continue, kept across scene restarts in a session: when on, a cleared
// wave is followed by the next one and a lost wave is retried, each after
// DEV.autoContinueMs. Any other button (or a ship slot) pauses it until a
// wave is started by hand with SET SAIL! again.
const auto = { on: false, paused: false };

// Dev controls. Loaded via dynamic import only when DEV_TOOLS is on
// (see devFlag.js: dev builds, or ?dev on the live site). They sit
// in the bottom-left corner of the view (positions in the base 480x270).
export function installDevTools(scene) {
  const { progress } = scene;
  const small = { height: 12, font: 'small' };
  const label = () => `DEV ALL HEROES ${progress.devUnlockAll ? 'ON' : 'OFF'}`;
  const devButton = new Button(scene, 64, 263, {
    ...small, width: 124, label: label(),
    onClick: () => {
      if (scene.state !== 'idle') return;
      progress.setDevUnlockAll(!progress.devUnlockAll);
      devButton.setLabel(label());
      scene.onRosterChanged();
    },
  });
  const pearlsButton = new Button(scene, 32, 250, {
    ...small, width: 60, label: '+10 PRL',
    onClick: () => {
      progress.pearls += 10;
      scene.refreshUi();
    },
  });
  const waveButton = new Button(scene, 96, 250, {
    ...small, width: 60, label: '+10 WAVE',
    onClick: () => {
      if (scene.state !== 'idle') return;
      // Stops at an island's finale, so it isn't skipped.
      for (let i = 0; i < 10 && !progress.isFinaleWave; i++) progress.advanceWave();
      scene.refreshUi();
    },
  });

  let timer = null;
  let autoStarting = false;
  const cancel = () => {
    timer?.remove();
    timer = null;
  };
  const autoLabel = () => `DEV: AUTO-CONTINUE ${!auto.on ? 'OFF' : auto.paused ? 'PAUSED' : 'ON'}`;
  // Start the next wave (or retry) after the pause, if still wanted.
  const schedule = () => {
    cancel();
    if (!auto.on || auto.paused) return;
    timer = scene.time.delayedCall(DEV.autoContinueMs, () => {
      timer = null;
      if (!auto.on || auto.paused || scene.state !== 'idle') return;
      autoStarting = true;
      scene.startWave({ confirmed: true });
      autoStarting = false;
    });
  };
  const pause = () => {
    if (!auto.on || auto.paused) return;
    auto.paused = true;
    cancel();
    autoButton.setLabel(autoLabel());
  };
  // Visible during waves too, so it can be turned off mid-wave.
  const autoButton = new Button(scene, 76, 237, {
    ...small, width: 148, label: autoLabel(),
    onClick: () => {
      auto.on = !auto.on;
      auto.paused = false;
      autoButton.setLabel(autoLabel());
      if (auto.on && scene.state === 'idle') schedule();
      else cancel();
    },
  });

  const corner = scene.add.container(0, 0, [devButton, pearlsButton, waveButton, autoButton]).setDepth(20);
  const layout = (view) => corner.setPosition(view.left, Math.round(view.bottom - DISPLAY.height));
  layout(scene.view);

  // Buttons that don't pause it: its own, SET SAIL! (a wave started by hand
  // resumes it instead) and the in-battle controls (speed and abilities).
  const onButton = (b) => {
    if (b === autoButton || b === scene.startButton || b === scene.speedButton) return;
    if (b.parentContainer === scene.abilityBar) return;
    pause();
  };
  const onWaveStarted = () => {
    cancel();
    if (!autoStarting && auto.paused) {
      auto.paused = false;
      autoButton.setLabel(autoLabel());
    }
  };
  const handlers = {
    'button-pressed': onButton,
    'slot-clicked': pause,         // opens the hero picker
    'wave-started': onWaveStarted,
    'wave-ended': schedule,
    'view-resize': layout,
  };
  for (const [name, fn] of Object.entries(handlers)) scene.events.on(name, fn);
  scene.events.once('shutdown', () => {
    cancel();
    scene.devTools = null;
    for (const [name, fn] of Object.entries(handlers)) scene.events.off(name, fn);
  });

  scene.devTools = {
    // Between waves only, apart from auto-continue.
    refresh(idle) {
      for (const b of [devButton, pearlsButton, waveButton]) b.setVisible(idle);
    },
  };
  scene.refreshUi();
}
