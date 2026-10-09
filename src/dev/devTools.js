import { Button } from '../ui/Button.js';

// Development-only controls. Loaded via dynamic import behind
// import.meta.env.DEV, so none of this ships in production builds.
export function installDevTools(scene) {
  const { progress } = scene;
  const small = { height: 12, font: 'small' };
  const label = () => `DEV ALL HEROES ${progress.devUnlockAll ? 'ON' : 'OFF'}`;
  scene.devButton = new Button(scene, 64, 263, {
    ...small, width: 124, label: label(),
    onClick: () => {
      if (scene.state !== 'idle') return;
      progress.setDevUnlockAll(!progress.devUnlockAll);
      scene.devButton.setLabel(label());
      scene.onRosterChanged();
    },
  });
  scene.devPearlsButton = new Button(scene, 32, 250, {
    ...small, width: 60, label: '+10 PRL',
    onClick: () => {
      progress.pearls += 10;
      scene.refreshUi();
    },
  });
  scene.devWaveButton = new Button(scene, 96, 250, {
    ...small, width: 60, label: '+10 WAVE',
    onClick: () => {
      if (scene.state !== 'idle') return;
      // Stops at an island's finale, so it isn't skipped.
      for (let i = 0; i < 10 && !progress.isFinaleWave; i++) progress.advanceWave();
      scene.refreshUi();
    },
  });
  scene.refreshUi();
}
