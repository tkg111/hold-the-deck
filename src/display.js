import { DISPLAY } from './config.js';

// The game's base resolution is DISPLAY.width x height (480x270)
// pixels, shown at the largest whole-number scale that fits the window, so
// every art pixel is a square block of real screen pixels. The canvas is that
// size in physical pixels; each scene's camera zooms so game code keeps using
// DISPLAY.width x height layout units. The scale is re-picked when the window
// (or its devicePixelRatio) changes.

function pickPixelScale() {
  const dpr = window.devicePixelRatio || 1;
  const fit = Math.min(
    (window.innerWidth * dpr) / DISPLAY.width,
    (window.innerHeight * dpr) / DISPLAY.height,
  );
  return Math.max(1, Math.floor(fit));
}

let pixelScale = pickPixelScale();

// Physical screen pixels per art pixel.
export const getPixelScale = () => pixelScale;
// Physical screen pixels per layout unit (the camera zoom).
const renderZoom = () => pixelScale;

// Size of the backing canvas for the current scale.
export const canvasSize = () => ({
  width: DISPLAY.width * pixelScale,
  height: DISPLAY.height * pixelScale,
});

// Call at the start of every scene's create(). Zoom around the default center
// origin and look at the middle of the layout, so the camera shows exactly
// (0, 0)-(DISPLAY.width, DISPLAY.height). (A top-left origin renders the same,
// but Phaser's worldView/midPoint assume a centered origin and would be wrong.)
export function applyRenderScale(scene) {
  scene.cameras.main
    .setZoom(renderZoom())
    .centerOn(DISPLAY.width / 2, DISPLAY.height / 2);
}

// Show the canvas at its physical size (CSS pixels = physical / dpr).
function fitCanvas(game) {
  const { width, height } = canvasSize();
  game.scale.resize(width, height);
  game.scale.setZoom(1 / (window.devicePixelRatio || 1));
}

// Keep the whole-number scale in step with the window: resize the canvas,
// re-zoom every scene's camera. (UI text is drawn one texel per art pixel and
// scaled like the sprites, so it needs nothing here.)
export function installIntegerScaling(game) {
  fitCanvas(game);
  const update = () => {
    const next = pickPixelScale();
    if (next !== pixelScale) {
      pixelScale = next;
      for (const scene of game.scene.scenes) {
        if (!scene.cameras?.main) continue;
        applyRenderScale(scene);
      }
    }
    fitCanvas(game);
  };
  // Window resizes and zoom (devicePixelRatio) changes fire 'resize'; the
  // observer also catches viewport changes that don't.
  window.addEventListener('resize', update);
  new ResizeObserver(update).observe(document.documentElement);
}
