import Phaser from 'phaser';
import { DISPLAY, MOBILE } from './config.js';

// The game area fills the window, scaled (fractionally) from layout units:
// - a window 16:9 or wider: 270 tall, as wide as the window's shape makes
//   it (480 to DISPLAY.maxWidth); wider than that, maxWidth wide with
//   rows cropped equally from the top and bottom instead of bars;
// - a narrower window: 480 wide and taller, up to 360 (4:3), past which
//   the 4:3 area is centred with bars above and below (DISPLAY.barColor).
// The view is centred on the 480x270 battlefield: a wider one shows more
// on both sides (view.left goes below 0), a taller one more above and below
// (as each scene's align says). Each scene's camera zooms so game code
// keeps working in layout units, and everything is re-picked when the
// window (or its devicePixelRatio) changes.
//
// The game draws under a notch or punch-hole camera (index.html's
// viewport-fit=cover); the safe area is read separately (safeInsets) so
// the HUD and buttons stay clear of it.

function measure() {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(window.innerWidth * dpr);
  const h = Math.round(window.innerHeight * dpr);
  // A hidden page can report a 0x0 window: fall back to the base at 1x.
  if (!w || !h) {
    return { scale: 1, canvasWidth: DISPLAY.width, canvasHeight: DISPLAY.height, width: DISPLAY.width, height: DISPLAY.height };
  }
  const aspect = w / h;
  const { width: baseW, height: baseH, maxWidth, wideAspect, minAspect } = DISPLAY;
  let canvasHeight = h;
  let scale;
  if (aspect >= wideAspect) {
    // Phones: as tall as the base, or as wide as maxWidth allows.
    scale = aspect > maxWidth / baseH ? w / maxWidth : h / baseH;
  } else {
    // Tablets: as wide as the base, taller up to 4:3.
    if (aspect < minAspect) canvasHeight = Math.round(w / minAspect);
    scale = w / baseW;
  }
  return { scale, canvasWidth: w, canvasHeight, width: w / scale, height: canvasHeight / scale };
}

let current = measure();

// Size of the backing canvas (physical pixels).
export const canvasSize = () => ({ width: current.canvasWidth, height: current.canvasHeight });

// Call at the start of every scene's create(). Sets scene.view: the visible
// area in layout units ({ left, top, right, bottom, width, height, centerX,
// centerY, safe }), centred on the base 480x270 rectangle across, so
// centerX is always 240. Up and down, a view taller than 270 puts the base
// rectangle at `align.y` (0 = flush top, 0.5 = centred, 1 = flush bottom);
// the default centres it, which suits overlays laid out in base
// coordinates. A shorter one (a very wide window) is always cropped
// equally. view.safe is the area clear of notches, cameras and screen
// edges ({ left, top, right, bottom }, see safeInsets), for the HUD. On
// window resizes the view is recomputed with the same align and the scene
// gets a 'view-resize' event with it.
export function applyRenderScale(scene, align = { y: 0.5 }) {
  const { scale, canvasWidth, canvasHeight, width, height } = current;
  const extra = height - DISPLAY.height;
  const top = extra < 0 ? -extra / 2 : -Math.round(extra * align.y);
  const left = (DISPLAY.width - width) / 2;
  const inset = safeInsets(scale);
  scene.renderAlign = align;
  scene.view = {
    left, top, width, height,
    right: left + width,
    bottom: top + height,
    centerX: left + width / 2,
    centerY: top + height / 2,
    safe: {
      left: left + inset.left,
      top: top + inset.top,
      right: left + width - inset.right,
      bottom: top + height - inset.bottom,
    },
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

// The safe area's insets in layout units: the page's env(safe-area-inset-*)
// (and, in the Android app, the cutout insets it reports: --native-inset-*),
// read off a hidden probe element (#safe-probe in index.html), plus
// MOBILE.safeMargin on every edge. CSS px become layout units at the
// game's scale (layout = CSS px x dpr / scale).
function safeInsets(scale) {
  const probe = document.getElementById('safe-probe');
  const style = probe ? getComputedStyle(probe) : null;
  const k = (window.devicePixelRatio || 1) / scale;
  const side = (name) => (style ? parseFloat(style[`padding${name}`]) || 0 : 0) * k + MOBILE.safeMargin;
  return { left: side('Left'), top: side('Top'), right: side('Right'), bottom: side('Bottom') };
}

// Where to put a HUD group laid out in the base 480x270 rectangle, MOBILE.
// safeMargin in from its edges: { left, right, top, bottom } offsets that
// move it to the view's safe area (a group of the left edge by left, of the
// right edge by right, and so on), and centerX for one centred across.
// Without a notch these are the view's own edges.
export function hudEdges(view) {
  const m = MOBILE.safeMargin;
  return {
    left: Math.round(view.safe.left - m),
    right: Math.round(view.safe.right + m - DISPLAY.width),
    top: Math.round(view.safe.top - m),
    bottom: Math.round(view.safe.bottom + m - DISPLAY.height),
    centerX: Math.round(view.centerX - DISPLAY.width / 2),
  };
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

// A full-view picture only DISPLAY.width wide (the world map), drawn at
// x = 0: the view's sides past it filled with the picture's own edge
// colour (its pixel at the left and right edge, halfway down), kept
// through resizes, under the picture. Returns the two fills.
export function fillSides(scene, image) {
  const key = image.texture.key;
  const { width, height } = image.frame;
  const edge = (x) => scene.textures.getPixel(x, Math.floor(height / 2), key)?.color ?? 0;
  const left = scene.add.rectangle(0, 0, 1, 1, edge(0)).setOrigin(1, 0);
  const right = scene.add.rectangle(width, 0, 1, 1, edge(width - 1)).setOrigin(0);
  const fit = (view) => {
    const top = Math.floor(view.top);
    const h = Math.ceil(view.bottom) - top;
    left.setPosition(image.x, top).setSize(Math.max(1, Math.ceil(image.x - view.left)), h).setVisible(view.left < image.x);
    right.setPosition(image.x + width, top).setSize(Math.max(1, Math.ceil(view.right - image.x - width)), h)
      .setVisible(view.right > image.x + width);
  };
  fit(scene.view);
  scene.events.on('view-resize', fit);
  image.once('destroy', () => scene.events.off('view-resize', fit));
  return [left, right];
}

// Where a rectangle of the scene's layout (x, y, w, h) is on the page, in
// CSS pixels ({ left, top, width, height }), to put an HTML element over it.
export function pageRect(scene, x, y, w, h) {
  const box = scene.game.canvas.getBoundingClientRect();
  const k = box.width / scene.view.width;
  return {
    left: box.left + (x - scene.view.left) * k,
    top: box.top + (y - scene.view.top) * k,
    width: w * k,
    height: h * k,
  };
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
export function installScaling(game) {
  document.documentElement.style.background = DISPLAY.barColor;
  document.body.style.background = DISPLAY.barColor;
  fitCanvas(game);
  let insetsKey = '';
  const update = () => {
    const next = measure();
    const probe = document.getElementById('safe-probe');
    const style = probe ? getComputedStyle(probe) : null;
    const key = style ? `${style.paddingLeft} ${style.paddingTop} ${style.paddingRight} ${style.paddingBottom}` : '';
    const changed = next.canvasWidth !== current.canvasWidth || next.canvasHeight !== current.canvasHeight || key !== insetsKey;
    current = next;
    insetsKey = key;
    fitCanvas(game);
    if (!changed) return;
    for (const scene of game.scene.scenes) {
      const status = scene.sys.settings.status;
      if (!scene.view || status < Phaser.Scenes.RUNNING || status > Phaser.Scenes.SLEEPING) continue;
      scene.events.emit('view-resize', applyRenderScale(scene, scene.renderAlign));
    }
  };
  // Window resizes, rotations, fullscreen and zoom (devicePixelRatio)
  // changes fire 'resize'; the observer also catches viewport changes that
  // don't, and the app's safe-area update (native.js) calls it directly.
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
  window.addEventListener('safe-area-change', update);
  new ResizeObserver(update).observe(document.documentElement);
}

// Fullscreen for the whole page (the canvas follows through the resize).
// Hidden where the browser doesn't allow it (e.g. iPhone Safari), and where
// the game already runs fullscreen as an app (see GameScene).
export const fullscreenSupported = () => !!document.fullscreenEnabled;
export const isFullscreen = () => !!document.fullscreenElement;

export function toggleFullscreen() {
  if (isFullscreen()) document.exitFullscreen?.();
  else document.documentElement.requestFullscreen?.().catch(() => {});
}
