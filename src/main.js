import Phaser from 'phaser';
import { DISPLAY } from './config.js';
import { installCrispText, RENDER_SCALE } from './display.js';
import { CollectionScene } from './scenes/CollectionScene.js';
import { GameScene } from './scenes/GameScene.js';
import { PackScene } from './scenes/PackScene.js';

installCrispText();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  // Backing canvas size; scenes zoom their cameras so layout stays in DISPLAY units.
  width: DISPLAY.width * RENDER_SCALE,
  height: DISPLAY.height * RENDER_SCALE,
  backgroundColor: '#87b5d6',
  scale: {
    // Fit the window while keeping 16:9, centered with letterboxing.
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene, PackScene, CollectionScene],
});

// Handy for poking at state from the browser console during development.
if (import.meta.env.DEV) window.game = game;
