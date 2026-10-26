import { DISPLAY, ISLANDS } from '../config.js';
import { finishAll } from '../systems/Expeditions.js';
import { gameMaterials } from '../systems/Parts.js';
import { isBossWave } from '../systems/WaveManager.js';
import { isBossDepth } from '../systems/Abyss.js';
import { Button } from '../ui/Button.js';

// Dev controls. Loaded via dynamic import only when DEV_TOOLS is on
// (see devFlag.js: dev builds, or ?dev on the live site). They sit in the
// bottom-left corner of the view, above the auto-continue toggle (positions
// in the base 480x270), and only show between waves.
export function installDevTools(scene) {
  const { progress } = scene;
  const small = { height: 12, font: 'small' };
  const label = () => `DEV ALL HEROES ${progress.devUnlockAll ? 'ON' : 'OFF'}`;
  const devButton = new Button(scene, 64, 216, {
    ...small, width: 124, label: label(),
    onClick: () => {
      if (scene.state !== 'idle') return;
      progress.setDevUnlockAll(!progress.devUnlockAll);
      devButton.setLabel(label());
      scene.onRosterChanged();
    },
  });
  const pearlsButton = new Button(scene, 32, 203, {
    ...small, width: 60, label: '+10 PRL',
    onClick: () => {
      progress.pearls += 10;
      scene.refreshUi();
    },
  });
  const waveButton = new Button(scene, 96, 203, {
    ...small, width: 60, label: '+10 WAVE',
    onClick: () => {
      if (scene.state !== 'idle') return;
      // In a dive: 10 depths deeper.
      if (progress.inAbyss) {
        progress.abyss.run.depth += 10;
        scene.showBattlefield();
      }
      // Stops at an island's finale, so it isn't skipped.
      for (let i = 0; i < 10 && !progress.inAbyss && !progress.isFinaleWave; i++) progress.advanceWave();
      scene.refreshUi();
    },
  });

  // Sail on to the next island with content (back to Skull Cove after the
  // last), unlocking it: the islands before it are marked cleared.
  const islands = ISLANDS.filter((i) => i.available);
  const nextIsland = () => islands[(islands.indexOf(progress.island) + 1) % islands.length];
  const islandLabel = () => `DEV SAIL: ${(nextIsland().shortName ?? nextIsland().name).toUpperCase()}`;
  const islandButton = new Button(scene, 64, 190, {
    ...small, width: 124, label: islandLabel(),
    onClick: () => {
      if (scene.state !== 'idle' || !progress.devSailTo(nextIsland().id)) return;
      islandButton.setLabel(islandLabel());
      scene.arriveAtIsland();
      scene.refreshUi();
      scene.save();
    },
  });
  // Skip ahead to the next boss wave or the island's finale (not past it).
  const bossButton = new Button(scene, 64, 177, {
    ...small, width: 124, label: 'DEV NEXT BOSS WAVE',
    onClick: () => {
      if (scene.state !== 'idle') return;
      // In a dive: the next boss depth.
      if (progress.inAbyss) {
        const { run } = progress.abyss;
        do run.depth++;
        while (!isBossDepth(run.depth));
        scene.showBattlefield();
        scene.refreshUi();
        return;
      }
      if (progress.isFinaleWave) return;
      do progress.advanceWave();
      while (!isBossWave(progress.wave) && !progress.isFinaleWave);
      scene.refreshUi();
    },
  });

  // Open the Abyss: every island cleared (the map reveals it next time).
  const abyssButton = new Button(scene, 64, 138, {
    ...small, width: 124, label: 'DEV OPEN ABYSS',
    onClick: () => {
      if (scene.state !== 'idle') return;
      for (const island of islands) {
        progress.islands[island.id] ??= { wave: 1, best: 0, cleared: false, bossPaid: 0, dropsPaid: {} };
        progress.islands[island.id].cleared = true;
      }
      scene.refreshUi();
      scene.save();
    },
  });

  // Every running expedition comes back now.
  const expeditionsButton = new Button(scene, 64, 164, {
    ...small, width: 124, label: 'DEV END EXPEDITIONS',
    onClick: () => {
      finishAll(progress);
      scene.watchExpeditions(1000);
      scene.save();
    },
  });

  // 50 more of every boss material (for the Shipyard).
  const materialsButton = new Button(scene, 64, 151, {
    ...small, width: 124, label: 'DEV +50 MATERIALS',
    onClick: () => {
      for (const m of gameMaterials()) progress.addMaterial(m.id, 50);
      scene.refreshUi();
      scene.save();
    },
  });

  const buttons = [devButton, pearlsButton, waveButton, islandButton, bossButton, expeditionsButton, materialsButton, abyssButton];
  const corner = scene.add.container(0, 0, buttons).setDepth(20);
  // (Lifted clear of AUTO NEXT, which may sit above the button bar.)
  const layout = (view) => corner.setPosition(view.left, Math.round(view.bottom - DISPLAY.height) - 40);
  layout(scene.view);
  scene.events.on('view-resize', layout);
  scene.events.once('shutdown', () => {
    scene.devTools = null;
    scene.events.off('view-resize', layout);
  });

  scene.devTools = {
    refresh(idle) {
      for (const b of buttons) b.setVisible(idle);
      islandButton.setLabel(islandLabel());   // the map may have moved the ship
    },
  };
  scene.refreshUi();
}
