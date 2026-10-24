import { MOBILE } from './config.js';
import { audio } from './audio/Audio.js';

// Phones: touch that only ever plays the game, and the portrait guard.

// No zooming, scrolling or callouts from touches on the page (index.html's
// CSS covers most of it: touch-action, overscroll-behavior, user-select):
// iOS Safari ignores user-scalable=no, so its pinch gestures are cancelled
// here, and a long press on the canvas opens no menu (also Phaser's
// disableContextMenu).
export function installTouchGuards(game) {
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
  }
  game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  game.canvas.addEventListener('selectstart', (e) => e.preventDefault());
}

// A phone held upright: the game would be under 1 CSS px per art px (a 480
// wide area across ~390 CSS px), with tap targets and the small font too
// small to use. So a full-screen "Turn your phone sideways" (#rotate in
// index.html) covers it, with the game and its sound paused behind until
// the phone turns. Tablets (wider than MOBILE.portrait.maxWidth) and
// desktops (no touch screen) play in any shape.
export function installPortraitGuard(game) {
  const overlay = document.getElementById('rotate');
  if (!overlay || !window.matchMedia) return;
  const { maxWidth, iconScale } = MOBILE.portrait;
  const img = overlay.querySelector('img');
  img.addEventListener('load', () => {
    img.style.width = `${img.naturalWidth * iconScale}px`;
    img.style.height = `${img.naturalHeight * iconScale}px`;
  });
  img.src = `${import.meta.env.BASE_URL}rotate.png`;
  const query = window.matchMedia(`(orientation: portrait) and (pointer: coarse) and (max-width: ${maxWidth - 1}px)`);
  let shown = false;
  const update = () => {
    if (query.matches === shown) return;
    shown = query.matches;
    overlay.hidden = !shown;
    audio.hold('portrait', shown);
    if (shown) game.pause();
    else game.resume();
  };
  query.addEventListener?.('change', update);
  window.addEventListener('resize', update);
  update();
}
