import Phaser from 'phaser';
import { DISPLAY } from './config.js';

// The game area is always exactly DISPLAY.width (480) art pixels wide,
// scaled (fractionally) to fill the window's width. Its height follows the
// window between DISPLAY.minAspect (4:3, 480x360) and DISPLAY.maxAspect
// (16:9, 480x270): a wider window shows the 16:9 area centred with bars left
// and right, a taller one the 4:3 area centred with bars above and below
// (DISPLAY.bars: a dark page with a wooden border round the canvas). The
// canvas is the game area in physical pixels; each scene's camera zooms so
// game code keeps working in layout units. Everything is re-picked when the
// window (or its devicePixelRatio) changes.

function measure() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(window.innerWidth * dpr);
  const h = Math.round(window.innerHeight * dpr);
  // A hidden page can report a 0x0 window: fall back to the base at 1x.
  if (!w || !h) return { scale: 1, canvasWidth: DISPLAY.width, canvasHeight: DISPLAY.height, height: DISPLAY.height };
  let canvasWidth = w;
  let canvasHeight = h;
  if (w / h > DISPLAY.maxAspect) canvasWidth = Math.round(h * DISPLAY.maxAspect);
  else if (w / h < DISPLAY.minAspect) canvasHeight = Math.round(w / DISPLAY.minAspect);
  const scale = canvasWidth / DISPLAY.width;
  return { scale, canvasWidth, canvasHeight, height: canvasHeight / scale };
}

let current = measure();

// Size of the backing canvas (physical pixels).
export const canvasSize = () => ({ width: current.canvasWidth, height: current.canvasHeight });

// Call at the start of every scene's create(). Sets scene.view: the visible
// area in layout units ({ left, top, right, bottom, width, height, centerX,
// centerY }); it is always 480 wide and 270 to 360 tall. The base 480x270
// rectangle sits inside it at `align.y` (0 = flush top, 0.5 = centred,
// 1 = flush bottom); the default centres it, which suits overlays laid out in
// base coordinates. On window resizes the view is recomputed with the same
// align and the scene gets a 'view-resize' event with it.
export function applyRenderScale(scene, align = { y: 0.5 }) {
  const { scale, canvasWidth, canvasHeight, height } = current;
  const width = DISPLAY.width;
  const top = -Math.round((height - DISPLAY.height) * align.y);
  scene.renderAlign = align;
  scene.view = {
    left: 0, top, width, height,
    right: width,
    bottom: top + height,
    centerX: width / 2,
    centerY: top + height / 2,
  };
  // Zoom around the default centre origin and look at the middle of the view.
  // (A top-left origin renders the same, but Phaser's worldView/midPoint
  // assume a centred origin and would be wrong.)
  scene.cameras.main
    .setSize(canvasWidth, canvasHeight)
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

// The bars round the game area: the page in the bar colour and a wooden
// frame round the canvas (box-shadow rings, so they take no layout space and
// are simply off-screen on a side where the canvas meets the window's edge).
function styleBars(canvas) {
  const { color, border } = DISPLAY.bars;
  document.documentElement.style.background = color;
  document.body.style.background = color;
  const rings = [];
  let spread = 0;
  for (const [width, ringColor] of border) {
    spread += width;
    rings.push(`0 0 0 ${spread}px ${ringColor}`);
  }
  canvas.style.boxShadow = rings.join(', ');
}

// Keep the scale and view in step with the window: resize the canvas, then
// re-aim every running scene's camera and tell it about its new view. (UI
// text is drawn one texel per art pixel and scaled like the sprites, so it
// needs nothing here.)
export function installScaling(game) {
  styleBars(game.canvas);
  fitCanvas(game);
  const update = () => {
    const next = measure();
    const changed = next.canvasWidth !== current.canvasWidth || next.canvasHeight !== current.canvasHeight;
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
