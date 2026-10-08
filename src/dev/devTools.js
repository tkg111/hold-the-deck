import { DISPLAY } from '../config.js';
import { Button } from '../ui/Button.js';

// Development-only controls. Loaded via dynamic import behind
// import.meta.env.DEV, so none of this ships in production builds.
export function installDevTools(scene) {
  const { progress } = scene;
  const label = () => `DEV: all heroes ${progress.devUnlockAll ? 'ON' : 'OFF'}`;
  scene.devButton = new Button(scene, 92, DISPLAY.height - 12, {
    width: 168, height: 21, label: label(), color: 0x546e7a, fontSize: '12px',
    onClick: () => {
      if (scene.state !== 'idle') return;
      progress.setDevUnlockAll(!progress.devUnlockAll);
      scene.devButton.setLabel(label());
      scene.onRosterChanged();
    },
  });
  scene.devPearlsButton = new Button(scene, 50, DISPLAY.height - 36, {
    width: 84, height: 21, label: 'DEV: +10 pearl', color: 0x546e7a, fontSize: '11px',
    onClick: () => {
      progress.pearls += 10;
      scene.refreshUi();
    },
  });
  scene.devWaveButton = new Button(scene, 135, DISPLAY.height - 36, {
    width: 82, height: 21, label: 'DEV: +10 wave', color: 0x546e7a, fontSize: '11px',
    onClick: () => {
      if (scene.state !== 'idle') return;
      for (let i = 0; i < 10; i++) progress.advanceWave();
      scene.refreshUi();
    },
  });
  scene.refreshUi();
}
