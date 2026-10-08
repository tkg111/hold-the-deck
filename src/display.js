import Phaser from 'phaser';
import { DISPLAY } from './config.js';

// The game is laid out in DISPLAY.width x DISPLAY.height logical units, but the
// canvas is rendered RENDER_SCALE times larger. Each scene's camera zooms by the
// same factor, so game code never deals with the real pixel size.
//
// The scale is picked once at boot from the screen (not the current window), so
// a window that starts small and is maximized later still renders crisply. It
// targets about one canvas pixel per physical pixel when the game fills the screen.
function pickRenderScale() {
  const dpr = window.devicePixelRatio || 1;
  const long = Math.max(window.screen.width, window.screen.height);
  const short = Math.min(window.screen.width, window.screen.height);
  const fit = Math.min(long / DISPLAY.width, short / DISPLAY.height);
  return Phaser.Math.Clamp(Math.ceil(fit * dpr), 1, DISPLAY.maxRenderScale);
}

export const RENDER_SCALE = pickRenderScale();

// Call at the start of every scene's create(). Zoom around the default center
// origin and look at the middle of the layout, so the camera shows exactly
// (0, 0)-(DISPLAY.width, DISPLAY.height). (A top-left origin renders the same,
// but Phaser's worldView/midPoint assume a centered origin and would be wrong.)
export function applyRenderScale(scene) {
  scene.cameras.main
    .setZoom(RENDER_SCALE)
    .centerOn(DISPLAY.width / 2, DISPLAY.height / 2);
}

// Phaser renders Text at resolution 1 unless told otherwise, which looks soft
// once the camera zooms in. Default every scene.add.text() to RENDER_SCALE;
// a style that sets its own resolution still wins.
export function installCrispText() {
  const factory = Phaser.GameObjects.GameObjectFactory.prototype;
  const addText = factory.text;
  factory.text = function text(x, y, content, style = {}) {
    return addText.call(this, x, y, content, { resolution: RENDER_SCALE, ...style });
  };
}
