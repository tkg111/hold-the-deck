import Phaser from 'phaser';
import { canvasSize, installScaling } from './display.js';
import { CollectionScene } from './scenes/CollectionScene.js';
import { GameScene } from './scenes/GameScene.js';
import { MapScene } from './scenes/MapScene.js';
import { PackScene } from './scenes/PackScene.js';
import { WantedScene } from './scenes/WantedScene.js';
import { loadUiSpec } from './ui/kit.js';

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
    scene: [GameScene, PackScene, CollectionScene, WantedScene, MapScene],
  });

  // Handy for poking at state from the browser console during development.
  if (import.meta.env.DEV) window.game = game;

  installScaling(game);
});
