import Phaser from 'phaser';
import { DISPLAY } from './config.js';

// The game is drawn at the largest whole-number scale at which the base
// resolution (DISPLAY.width x height, 480x270) still fits the window, so every
// art pixel is a square block of real screen pixels. Rather than leaving the
// rest of the window empty, the view grows to fill it: it is the window size
// divided by that scale (never smaller than the base), and scenes show more of
// the world. The canvas is the view size in physical pixels; each scene's
// camera zooms so game code keeps working in layout units. Everything is
// re-picked when the window (or its devicePixelRatio) changes.

function measure() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth * dpr;
  const h = window.innerHeight * dpr;
  const scale = Math.max(1, Math.floor(Math.min(w / DISPLAY.width, h / DISPLAY.height)));
  return {
    scale,
    width: Math.max(DISPLAY.width, Math.floor(w / scale)),
    height: Math.max(DISPLAY.height, Math.floor(h / scale)),
  };
}

let current = measure();

// Physical screen pixels per art pixel (the camera zoom).
export const getPixelScale = () => current.scale;

// Size of the backing canvas for the current scale and view.
export const canvasSize = () => ({
  width: current.width * current.scale,
  height: current.height * current.scale,
});

// Call at the start of every scene's create(). Sets scene.view: the visible
// area in layout units ({ left, top, right, bottom, width, height, centerX,
// centerY }). The base 480x270 rectangle sits inside it at `align` (0 = flush
// left / top, 0.5 = centred, 1 = flush right / bottom); the default centres
// it, which suits overlays laid out in base coordinates. On window resizes the
// view is recomputed with the same align and the scene gets a 'view-resize'
// event with it.
export function applyRenderScale(scene, align = { x: 0.5, y: 0.5 }) {
  const { scale, width, height } = current;
  const left = -Math.round((width - DISPLAY.width) * align.x);
  const top = -Math.round((height - DISPLAY.height) * align.y);
  scene.renderAlign = align;
  scene.view = {
    left, top, width, height,
    right: left + width,
    bottom: top + height,
    centerX: left + width / 2,
    centerY: top + height / 2,
  };
  // Zoom around the default centre origin and look at the middle of the view.
  // (A top-left origin renders the same, but Phaser's worldView/midPoint
  // assume a centred origin and would be wrong.)
  scene.cameras.main
    .setSize(width * scale, height * scale)
    .setZoom(scale)
    .centerOn(scene.view.centerX, scene.view.centerY);
  return scene.view;
}

// A rectangle covering the whole view (a modal backdrop), kept covering it
// through resizes. It blocks clicks underneath.
export function fillView(scene, color, alpha) {
  const v = scene.view;
  const rect = scene.add.rectangle(v.left, v.top, v.width, v.height, color, alpha).setOrigin(0).setInteractive();
  const fit = (view) => {
    rect.setPosition(view.left, view.top).setSize(view.width, view.height);
    rect.input.hitArea.setSize(view.width, view.height);
  };
  scene.events.on('view-resize', fit);
  rect.once('destroy', () => scene.events.off('view-resize', fit));
  return rect;
}

// Show the canvas at its physical size (CSS pixels = physical / dpr).
function fitCanvas(game) {
  const { width, height } = canvasSize();
  game.scale.resize(width, height);
  game.scale.setZoom(1 / (window.devicePixelRatio || 1));
}

// Keep the scale and view in step with the window: resize the canvas, then
// re-aim every running scene's camera and tell it about its new view. (UI
// text is drawn one texel per art pixel and scaled like the sprites, so it
// needs nothing here.)
export function installIntegerScaling(game) {
  fitCanvas(game);
  const update = () => {
    const next = measure();
    const changed = next.scale !== current.scale || next.width !== current.width || next.height !== current.height;
    current = next;
    fitCanvas(game);
    if (!changed) return;
    for (const scene of game.scene.scenes) {
      const status = scene.sys.settings.status;
      if (!scene.view || status < Phaser.Scenes.RUNNING || status > Phaser.Scenes.SLEEPING) continue;
      scene.events.emit('view-resize', applyRenderScale(scene, scene.renderAlign));
    }
  };
  // Window resizes, fullscreen and zoom (devicePixelRatio) changes fire
  // 'resize'; the observer also catches viewport changes that don't.
  window.addEventListener('resize', update);
  new ResizeObserver(update).observe(document.documentElement);
}

// Fullscreen for the whole page (the canvas follows through the resize).
// Hidden where the browser doesn't allow it (e.g. iPhone Safari).
export const fullscreenSupported = () => !!document.fullscreenEnabled;
export const isFullscreen = () => !!document.fullscreenElement;

export function toggleFullscreen() {
  if (isFullscreen()) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
