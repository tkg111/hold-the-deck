import { Button } from '../ui/Button.js';
import { px } from '../ui/kit.js';

// Development-only controls. Loaded via dynamic import behind
// import.meta.env.DEV, so none of this ships in production builds.
export function installDevTools(scene) {
  const { progress } = scene;
  const small = { height: px(12), font: 'small' };
  const label = () => `DEV ALL HEROES ${progress.devUnlockAll ? 'ON' : 'OFF'}`;
  scene.devButton = new Button(scene, px(52), px(262), {
    ...small, width: px(100), label: label(),
    onClick: () => {
      if (scene.state !== 'idle') return;
      progress.setDevUnlockAll(!progress.devUnlockAll);
      scene.devButton.setLabel(label());
      scene.onRosterChanged();
    },
  });
  scene.devPearlsButton = new Button(scene, px(26), px(249), {
    ...small, width: px(48), label: '+10 PRL',
    onClick: () => {
      progress.pearls += 10;
      scene.refreshUi();
    },
  });
  scene.devWaveButton = new Button(scene, px(78), px(249), {
    ...small, width: px(48), label: '+10 WAVE',
    onClick: () => {
      if (scene.state !== 'idle') return;
      for (let i = 0; i < 10; i++) progress.advanceWave();
      scene.refreshUi();
    },
  });
  scene.refreshUi();
}
