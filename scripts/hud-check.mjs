// The battle HUD's longest cases, screenshotted at 2400x1080 (20:9) and
// 1920x1080 (16:9): the meal plaque with the longest meal names and 20+
// waves left (a Caretaker aboard), its tooltip, gold and Pearls at huge
// values, the longest wave plaques and a big enemies-left count. Reports
// any HUD text that runs past its plaque. Needs the dev server.
// Run: node scripts/hud-check.mjs [url]
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const URL = process.argv[2] ?? 'http://localhost:5173/';
const OUT = join(tmpdir(), 'hold-the-deck-hud');
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'msedge' });

// In the page: every text in the HUD groups wider than the plaque under it
// (the nearest earlier nine-slice in its container that overlaps it).
const overflows = () => {
  const gs = window.game.scene.getScene('GameScene');
  const out = [];
  const check = (group) => {
    const kids = group.list ?? [];
    kids.forEach((t, i) => {
      if (!t.visible || typeof t.inkWidth !== 'number' || !t.text) return;
      const b = t.getBounds();
      for (let j = i - 1; j >= 0; j--) {
        const p = kids[j];
        if (p.type !== 'NineSlice' || !p.visible) continue;
        const pb = p.getBounds();
        if (b.centerY < pb.top || b.centerY > pb.bottom || b.centerX < pb.left || b.centerX > pb.right) continue;
        if (b.left < pb.left || b.right > pb.right) out.push(`"${t.text}" ${Math.round(b.width)} px wide runs past its ${Math.round(pb.width)} px plaque`);
        break;
      }
      if (t.list) check(t);
    });
    for (const c of kids) if (c.list && c.type === 'Container') check(c);
  };
  for (const g of [gs.topLeft, gs.topRight, gs.topCenter]) check(g);
  return out;
};

const problems = [];
const cases = [
  ['meal_angler', (p) => { p.meal = { id: 'angler_bake', wavesLeft: 25 }; }],
  ['meal_koi', (p) => { p.meal = { id: 'golden_koi_feast', wavesLeft: 25 }; }],
  ['gold_huge', (p) => { p.gold = 888.8e33; p.pearls = 888888; p.meal = { id: 'golden_koi_feast', wavesLeft: 9 }; }],
];

for (const [w, h] of [[2400, 1080], [1920, 1080]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => problems.push(`${w}x${h}: page error ${e.message}`));
  await page.goto(`${URL}?nodev`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${URL}?nodev`);
  await page.waitForFunction(() => window.game?.scene?.isActive?.('TitleScene'), null, { timeout: 60000 });
  await page.waitForTimeout(1000);
  await page.mouse.click(w / 2, h / 2);
  await page.waitForFunction(() => window.game.scene.getScene('GameScene').sys.settings.status >= 5, null, { timeout: 30000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    window.tutorial.state.tipsOn = false;
    window.tutorial.skipOnboarding();
  });
  for (const [name, setup] of cases) {
    await page.evaluate(`(${setup})(window.game.scene.getScene('GameScene').progress); window.game.scene.getScene('GameScene').refreshUi();`);
    await page.waitForTimeout(200);
    for (const o of await page.evaluate(overflows)) problems.push(`${w}x${h} ${name}: ${o}`);
    await page.screenshot({ path: join(OUT, `${w}x${h}_${name}.png`) });
  }
  // The meal's tooltip (a tap on the plaque).
  await page.evaluate(() => window.game.scene.getScene('GameScene').showMealNote());
  await page.waitForTimeout(200);
  await page.screenshot({ path: join(OUT, `${w}x${h}_meal_tooltip.png`) });
  // The longest wave plaques, during a wave (enemies left).
  for (const [name, island] of [['frostbite_boss', 'frostbite_reef'], ['fogbound_boss', 'fogbound_isle']]) {
    await page.evaluate((id) => {
      const s = window.game.scene.getScene('GameScene');
      s.progress.devSailTo(id);
      s.arriveAtIsland();
      while (s.progress.wave < 40) s.progress.advanceWave();
      s.refreshUi();
    }, island);
    await page.waitForTimeout(300);
    for (const o of await page.evaluate(overflows)) problems.push(`${w}x${h} ${name}: ${o}`);
    await page.screenshot({ path: join(OUT, `${w}x${h}_${name}.png`) });
  }
  await page.evaluate(() => window.game.scene.getScene('GameScene').startWave({ confirmed: true }));
  await page.waitForTimeout(1500);
  for (const o of await page.evaluate(overflows)) problems.push(`${w}x${h} wave_running: ${o}`);
  await page.screenshot({ path: join(OUT, `${w}x${h}_wave_running.png`) });
  await page.close();
}
await browser.close();
console.log(`Shots: ${OUT}`);
console.log(problems.length ? [...new Set(problems)].join('\n') : 'No HUD text runs past its plaque.');
