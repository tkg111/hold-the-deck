// The Android app's icons and splash, made from the PWA art in public/
// (rerun after changing those): drawn nearest-neighbour in Microsoft Edge
// (Playwright on the installed browser, or PW_CHANNEL) and written into
// android/app/src/main/res/.
//   - adaptive icon: icon-maskable-512.png as the foreground, shrunk to
//     FOREGROUND of its 108dp layer so the launcher's mask never clips the
//     captain (the background layer is APP_COLOR, values/ic_launcher_background.xml);
//   - legacy icons (before Android 8): the maskable art, square and round;
//   - splash: icon-192.png centred (Android 12+'s splash icon, which the
//     system clips to a circle 2/3 of its size; and the older full-screen
//     splash.png on APP_COLOR).
// Run: node scripts/app-icons.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const APP_COLOR = '#2a1e4a';
const FOREGROUND = 0.9;
const RES = 'android/app/src/main/res';
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const png = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
const page = await browser.newPage();
await page.setContent('<body></body>');
const sources = { maskable: png('public/icon-maskable-512.png'), icon: png('public/icon-192.png') };

// Draw one PNG: size x size (or w x h), fill, then the image src scaled to
// `scale` of the width, centred; round: clipped to a circle.
const draw = (spec) => page.evaluate(async ({ src, w, h, fill, scale, round }) => {
  const img = await new Promise((ok) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.src = src;
  });
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  if (round) {
    g.beginPath();
    g.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    g.clip();
  }
  if (fill) {
    g.fillStyle = fill;
    g.fillRect(0, 0, w, h);
  }
  const d = Math.round(Math.min(w, h) * scale);
  g.drawImage(img, Math.round((w - d) / 2), Math.round((h - d) / 2), d, d);
  return c.toDataURL('image/png').split(',')[1];
}, spec);

const write = async (path, spec) => {
  mkdirSync(join(RES, path, '..'), { recursive: true });
  writeFileSync(join(RES, path), Buffer.from(await draw(spec), 'base64'));
};

for (const [name, k] of Object.entries(DENSITIES)) {
  const fg = Math.round(108 * k);
  const legacy = Math.round(48 * k);
  await write(`mipmap-${name}/ic_launcher_foreground.png`, { src: sources.maskable, w: fg, h: fg, scale: FOREGROUND });
  await write(`mipmap-${name}/ic_launcher.png`, { src: sources.maskable, w: legacy, h: legacy, scale: 1 });
  await write(`mipmap-${name}/ic_launcher_round.png`, { src: sources.maskable, w: legacy, h: legacy, scale: 1, round: true });
}
// Android 12+: the icon at 2x in a 576 square (the visible circle is 384).
await write('drawable-nodpi/splash_icon.png', { src: sources.icon, w: 576, h: 576, scale: 384 / 576 });
// Older: the whole launch screen, centre-cropped to the screen's shape.
await write('drawable/splash.png', { src: sources.icon, w: 2732, h: 2732, fill: APP_COLOR, scale: 384 / 2732 });
await browser.close();
console.log(`Icons and splash written to ${RES}`);
