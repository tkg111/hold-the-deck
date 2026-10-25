// Screenshots of the game at phone and tablet shapes, and a contact sheet
// of them (docs/screens.png), with checks for black bars, small tap
// targets and HUD overlaps. Needs the dev server (npm run dev) and
// Microsoft Edge (or the browser channel in PW_CHANNEL, e.g. chrome):
// Playwright drives the installed browser, so it downloads nothing.
// Run: node scripts/screens.mjs [url]   (default http://localhost:5173/)
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const VIEWPORTS = [
  { name: '16:9', width: 1920, height: 1080 },
  { name: '19.5:9', width: 2340, height: 1080 },
  { name: '20:9', width: 2400, height: 1080 },
  { name: '21:9', width: 2560, height: 1080 },
  { name: '4:3 tablet', width: 2048, height: 1536 },
];
const SCENES = ['Title', 'Skull Cove', 'Frostbite Reef', 'Galley', 'Rankings'];
const OUT = join(tmpdir(), 'hold-the-deck-screens');
mkdirSync(OUT, { recursive: true });
mkdirSync('docs', { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });
const shots = [];
const problems = [];

// In the page: every visible tappable object of the open scenes, with its
// hit area in layout units ({ scene, name, x, y, w, h }).
const tapTargets = () => {
  const out = [];
  for (const scene of window.game.scene.getScenes(true)) {
    for (const obj of scene.input._list) {
      if (!obj.input?.enabled || !obj.input.hitArea) continue;
      let visible = obj.visible && obj.alpha > 0;
      for (let p = obj.parentContainer; p && visible; p = p.parentContainer) visible = p.visible && p.alpha > 0;
      if (!visible || !obj.getWorldTransformMatrix) continue;
      const m = obj.getWorldTransformMatrix();
      const a = obj.input.hitArea;
      const ox = obj.displayOriginX ?? 0;
      const oy = obj.displayOriginY ?? 0;
      const x = m.tx + (a.x - ox) * m.scaleX;
      const y = m.ty + (a.y - oy) * m.scaleY;
      const w = a.width * Math.abs(m.scaleX);
      const h = a.height * Math.abs(m.scaleY);
      const v = scene.view;
      if (w >= v.width * 0.9 && h >= v.height * 0.9) continue;   // full-view backdrops
      if (x + w < v.left || x > v.right || y + h < v.top || y > v.bottom) continue;
      const label = obj.parentContainer?.text?.text || obj.text || obj.texture?.key || obj.type;
      out.push({ scene: scene.sys.settings.key, name: String(label).slice(0, 24), x, y, w, h });
    }
  }
  return out;
};

async function check(page, vp, sceneName) {
  const bars = await page.evaluate(() => {
    const r = window.game.canvas.getBoundingClientRect();
    return { left: r.left, top: r.top, right: innerWidth - r.right, bottom: innerHeight - r.bottom };
  });
  const barTotal = Math.round(bars.left + bars.right + bars.top + bars.bottom);
  if (barTotal > 1) problems.push(`${vp.name} ${sceneName}: bars (CSS px) ${JSON.stringify(bars)}`);
  const targets = await page.evaluate(tapTargets);
  for (const t of targets) {
    if (t.w < 31.5 || t.h < 31.5) problems.push(`${vp.name} ${sceneName}: small tap target "${t.name}" ${t.w.toFixed(0)}x${t.h.toFixed(0)}`);
  }
}

for (const vp of VIEWPORTS) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  page.on('pageerror', (e) => {
    problems.push(`${vp.name}: page error ${e.message}`);
    console.error(`${vp.name}: page error`, e.stack);
  });
  const url = `${URL}${URL.includes('?') ? '&' : '?'}nodev`;
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.goto(url);
  const shot = async (sceneName) => {
    await check(page, vp, sceneName);
    const file = join(OUT, `${vp.name.replace(/[^\w.]+/g, '_')}_${sceneName.replace(/\W+/g, '_')}.png`);
    await page.screenshot({ path: file });
    shots.push({ vp, sceneName, file });
  };

  await page.waitForFunction(() => window.game?.scene.isActive('TitleScene'), null, { timeout: 60000 });
  await page.waitForTimeout(1600);
  await shot('Title');

  // Skull Cove, a wave under way (the onboarding skipped, no tips).
  await page.mouse.click(vp.width / 2, vp.height / 2);
  // (Running, or paused while the Captain talks.)
  await page.waitForFunction(() => window.game.scene.getScene('GameScene').sys.settings.status >= 5, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    window.tutorial.state.tipsOn = false;
    window.tutorial.skipOnboarding();
    window.game.scene.getScene('GameScene').startWave({ confirmed: true });
  });
  await page.waitForTimeout(4500);
  await shot('Skull Cove');

  // Frostbite Reef: sail there (a fresh battle), the Galley and Rankings
  // between waves, then a wave.
  await page.evaluate(() => {
    const s = window.game.scene.getScene('GameScene');
    s.progress.devSailTo('frostbite_reef');
    s.save();
    s.scene.restart();
  });
  await page.waitForFunction(() => {
    const s = window.game.scene.getScene('GameScene');
    return s.sys.settings.status === 5 && s.abilityBar?.scene && s.progress.islandId === 'frostbite_reef';
  }, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.game.scene.getScene('GameScene').openGalley());
  await page.waitForTimeout(1200);
  await shot('Galley');
  await page.evaluate(() => window.game.scene.getScene('GalleyScene').close());
  await page.waitForTimeout(400);
  await page.evaluate(() => window.game.scene.getScene('GameScene').openRankings());
  await page.waitForTimeout(1500);
  await shot('Rankings');
  await page.evaluate(() => window.game.scene.getScene('RankingsScene').close());
  await page.waitForTimeout(400);
  await page.evaluate(() => window.game.scene.getScene('GameScene').startWave({ confirmed: true }));
  await page.waitForTimeout(5000);
  await shot('Frostbite Reef');
  await page.close();
}

// The contact sheet: a row per viewport, a column per scene, each shot
// scaled to THUMB_H tall, drawn in the browser.
const THUMB_H = 216;
const sheet = await browser.newPage({ viewport: { width: 400, height: 300 } });
const fs = await import('node:fs');
const data = shots.map((s) => ({
  row: VIEWPORTS.indexOf(s.vp), col: SCENES.indexOf(s.sceneName), label: `${s.vp.name} (${s.vp.width}x${s.vp.height}) · ${s.sceneName}`,
  src: `data:image/png;base64,${fs.readFileSync(s.file).toString('base64')}`,
}));
const png = await sheet.evaluate(async ({ data, THUMB_H, rows, cols }) => {
  const imgs = await Promise.all(data.map((d) => new Promise((ok) => {
    const img = new Image();
    img.onload = () => ok({ ...d, img });
    img.src = d.src;
  })));
  const colW = Math.max(...imgs.map((d) => Math.round(d.img.width * THUMB_H / d.img.height)));
  const pad = 10;
  const labelH = 18;
  const canvas = document.createElement('canvas');
  canvas.width = cols * (colW + pad) + pad;
  canvas.height = rows * (THUMB_H + labelH + pad) + pad;
  const g = canvas.getContext('2d');
  g.fillStyle = '#20232a';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.imageSmoothingQuality = 'high';
  g.font = '12px sans-serif';
  for (const d of imgs) {
    const w = Math.round(d.img.width * THUMB_H / d.img.height);
    const x = pad + d.col * (colW + pad) + Math.round((colW - w) / 2);
    const y = pad + d.row * (THUMB_H + labelH + pad);
    g.fillStyle = '#d8dce4';
    g.fillText(d.label, pad + d.col * (colW + pad), y + 12);
    g.drawImage(d.img, x, y + labelH, w, THUMB_H);
  }
  return canvas.toDataURL('image/png').split(',')[1];
}, { data, THUMB_H, rows: VIEWPORTS.length, cols: SCENES.length });
writeFileSync('docs/screens.png', Buffer.from(png, 'base64'));
await browser.close();

console.log(`Shots: ${OUT}`);
console.log('Contact sheet: docs/screens.png');
console.log(problems.length ? `\n${problems.length} problem(s):\n${[...new Set(problems)].join('\n')}` : '\nNo bars, small tap targets or page errors.');
