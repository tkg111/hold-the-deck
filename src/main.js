import Phaser from 'phaser';
import { audio } from './audio/Audio.js';
import { canvasSize, installScaling } from './display.js';
import { AbyssEndScene } from './scenes/AbyssEndScene.js';
import { AwayScene } from './scenes/AwayScene.js';
import { CollectionScene } from './scenes/CollectionScene.js';
import { EndingScene } from './scenes/EndingScene.js';
import { ExpeditionScene } from './scenes/ExpeditionScene.js';
import { GalleyScene } from './scenes/GalleyScene.js';
import { GameScene } from './scenes/GameScene.js';
import { LogScene } from './scenes/LogScene.js';
import { MapScene } from './scenes/MapScene.js';
import { PackScene } from './scenes/PackScene.js';
import { RankingsScene } from './scenes/RankingsScene.js';
import { ShipyardScene } from './scenes/ShipyardScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { TutorialScene, TutorialView } from './scenes/TutorialScene.js';
import { WantedScene } from './scenes/WantedScene.js';
import { TutorialHost } from './tutorial/TutorialHost.js';
import { tutorial } from './tutorial/TutorialManager.js';
import { loadUiSpec } from './ui/kit.js';
import { installPortraitGuard, installTouchGuards } from './phone.js';
import { installApp } from './native.js';
import { installPwa } from './pwa.js';

// ui.json (icon order, slice sizes, colours) loads before the game starts.
loadUiSpec().then(() => {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    // Backing canvas size in physical pixels; scenes zoom their cameras so
    // layout stays in DISPLAY units. installScaling keeps it in step.
    ...canvasSize(),
    backgroundColor: '#9fd3f2',
    // Nearest-neighbour filtering for the pixel art, and every object drawn on
    // whole pixels.
    pixelArt: true,
    roundPixels: true,
    // No automatic fitting: the canvas is sized to the game area (see
    // display.js), centered by the page's flex layout.
    scale: { mode: Phaser.Scale.NONE },
    // Phaser's own sound stays off: the game makes its AudioContext on the
    // first input (src/audio/Audio.js), so the browser never has one to
    // block and warn about.
    audio: { noAudio: true },
    // A long press (or right click) on the canvas opens no menu.
    disableContextMenu: true,
    // First: the title, which loads everything and then starts the battle.
    scene: [TitleScene, GameScene, PackScene, CollectionScene, WantedScene, MapScene, LogScene, EndingScene, ExpeditionScene, ShipyardScene, AbyssEndScene, GalleyScene, AwayScene,
      // Over the map and the Captain's Log, which open it.
      RankingsScene,
      // Last: over every other scene.
      TutorialScene],
  });

  // Handy for poking at state from the browser console during development
  // (and for scripts/screens.mjs).
  if (import.meta.env.DEV) Object.assign(window, { game, tutorial });

  installScaling(game);
  audio.install();
  installPwa(game);
  installTouchGuards(game);
  installPortraitGuard(game);
  installApp(game, tutorial);

  // The Captain's tutorial listens to the scenes once they exist.
  game.events.once('ready', () => {
    const host = new TutorialHost(game, tutorial);
    tutorial.install(host, new TutorialView(game, tutorial));
    host.install();
  });
});
