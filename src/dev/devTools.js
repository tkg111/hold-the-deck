import { DISPLAY } from '../config.js';
import { Button } from '../ui/Button.js';

// Development-only controls. Loaded via dynamic import behind
// import.meta.env.DEV, so none of this ships in production builds.
export function installDevTools(scene) {
  const { progress } = scene;
  const label = () => `DEV: all heroes ${progress.devUnlockAll ? 'ON' : 'OFF'}`;
  scene.devButton = new Button(scene, 92, DISPLAY.height - 22, {
    width: 168, height: 26, label: label(), color: 0x546e7a, fontSize: '12px',
    onClick: () => {
      if (scene.state !== 'idle') return;
      progress.setDevUnlockAll(!progress.devUnlockAll);
      scene.devButton.setLabel(label());
      scene.onRosterChanged();
    },
  });
  scene.refreshUi();
}
