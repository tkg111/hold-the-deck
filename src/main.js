import Phaser from 'phaser';
import { canvasSize, installCrispText, installIntegerScaling } from './display.js';
import { CollectionScene } from './scenes/CollectionScene.js';
import { GameScene } from './scenes/GameScene.js';
import { PackScene } from './scenes/PackScene.js';
import { PrestigeScene } from './scenes/PrestigeScene.js';

installCrispText();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // Backing canvas size in physical pixels; scenes zoom their cameras so
  // layout stays in DISPLAY units. installIntegerScaling keeps it in step.
  ...canvasSize(),
  backgroundColor: '#9fd3f2',
  // Nearest-neighbour filtering and whole-pixel positions for the pixel art.
  pixelArt: true,
  // No automatic fitting: the canvas is a whole-number multiple of the base
  // resolution (see display.js), centered by the page's flex layout.
  scale: { mode: Phaser.Scale.NONE },
  scene: [GameScene, PackScene, CollectionScene, PrestigeScene],
});

// Handy for poking at state from the browser console during development.
if (import.meta.env.DEV) window.game = game;

installIntegerScaling(game);
