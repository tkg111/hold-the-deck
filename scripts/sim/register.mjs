// Lets the game's modules run in Node for the balance simulation: 'phaser'
// resolves to a small shim (phaser-shim.mjs) and the build-time constant
// from vite.config.js gets a value.
import { register } from 'node:module';

globalThis.__ASSET_VERSION__ = 'sim';
register('./hooks.mjs', import.meta.url);
