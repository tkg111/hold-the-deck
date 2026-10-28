// The Captain's dialogue box and a banner tip, screenshotted at 2400x1080
// and 1920x1080 (each also cropped round the text), plus how each glyph
// pixel lands on the screen: the game's zoom and whether text sits on whole
// screen pixels. Needs the dev server.
// Run: node scripts/text-shots.mjs [out dir] [url]   (LARGE=1: Text size Large)
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';

const OUT = process.argv[2] ?? join(tmpdir(), 'hold-the-deck-text');
const URL = process.argv[3] ?? 'http://localhost:5173/';
mkdirSync(OUT, { recursive: true });
const LINE = 'Ahoy, greenhorn! Welcome aboard the finest ship on the seven seas.';
const TIP = 'Gold! Every foe drops some.';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
const report = [];

// [CSS width, height, devicePixelRatio, name]: the phone is the playtest's
// (2640x1200 at 3.25x, so the game's zoom is 4.44).
const SIZES = [[2400, 1080, 1, '2400x1080'], [1920, 1080, 1, '1920x1080'], [812, 369, 3.25, 'phone_2640x1200']];
for (const [w, h, dpr, label] of SIZES) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  await page.goto(`${URL}?nodev`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${URL}?nodev`);
  await page.waitForFunction(() => window.game?.scene?.isActive?.('TitleScene'), null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.mouse.click(w / 2, h / 2);
  // The onboarding's first line, typed out in full.
  await page.waitForFunction(() => window.game.scene.isActive('TutorialScene') && window.game.scene.getScene('TutorialScene').box?.visible, null, { timeout: 30000 });
  // LARGE=1: with Settings' Text size on Large (after the battle has read the save's).
  if (process.env.LARGE) await page.evaluate(() => window.setLargeText(true));
  await page.waitForTimeout(3500);
  const info = await page.evaluate(() => {
    const ts = window.game.scene.getScene('TutorialScene');
    const cam = ts.cameras.main;
    const texts = [];
    const walk = (o) => {
      if (!o.visible) return;
      if (typeof o.inkWidth === 'number' && o.text) {
        const m = o.getWorldTransformMatrix();
        texts.push({ text: o.text.slice(0, 30), font: o.font, size: o.fontSize, x: m.tx, y: m.ty, scale: m.scaleX });
      }
      (o.list ?? []).forEach(walk);
    };
    ts.children.list.forEach(walk);
    return { zoom: cam.zoom, scrollX: cam.scrollX, scrollY: cam.scrollY, dpr: devicePixelRatio, texts };
  });
  report.push({ size: label, zoom: info.zoom, dpr: info.dpr, texts: info.texts.filter((t) => t.font.startsWith('main')).map((t) => `${t.font} ${t.size}px "${t.text}"`) });
  await page.screenshot({ path: join(OUT, `${label}_dialogue.png`) });
  const box = await page.evaluate(() => {
    const ts = window.game.scene.getScene('TutorialScene');
    const b = ts.box.getBounds();
    const c = ts.cameras.main;
    const k = window.game.canvas.getBoundingClientRect().width / ts.view.width;
    return { x: (b.x - ts.view.left) * k, y: (b.y - ts.view.top) * k, w: b.width * k, h: b.height * k, c: c.zoom };
  });
  await page.screenshot({ path: join(OUT, `${label}_dialogue_crop.png`), clip: { x: box.x, y: box.y, width: box.w, height: box.h } });
  // A banner tip.
  // (After the skip has put the Captain's layer to sleep: a banner wakes it.)
  await page.evaluate(() => window.tutorial.skipOnboarding());
  await page.waitForTimeout(800);
  await page.evaluate((tip) => window.tutorial.view.banner({ text: tip, face: 'talk0', sticky: true }), TIP);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT, `${label}_banner.png`) });
  const bb = await page.evaluate(() => {
    const ts = window.game.scene.getScene('TutorialScene');
    const b = ts.bannerBox.getBounds();
    const k = window.game.canvas.getBoundingClientRect().width / ts.view.width;
    return { x: (b.x - ts.view.left) * k, y: (b.y - ts.view.top) * k, w: b.width * k, h: b.height * k };
  });
  if (bb.w > 0) await page.screenshot({ path: join(OUT, `${label}_banner_crop.png`), clip: { x: bb.x, y: bb.y, width: bb.w, height: bb.h } });
  await page.close();
}
await browser.close();
console.log(JSON.stringify(report, null, 1));
console.log(`Shots: ${OUT}`);
void LINE;
