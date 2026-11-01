// The journey sim's report (journey.mjs): markdown tables from the runs'
// records, and the pacing chart of the median Regular run as an SVG.
import { HEROES, ISLANDS, UNCHARTED } from '../../src/config.js';
import { SEAS } from '../../src/data/uncharted.js';

const HOUR = 3600e3;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const pct = (a, b) => (b ? `${Math.round(100 * a / b)}%` : '-');
const f1 = (n) => (n == null ? '-' : n.toFixed(1));
const big = (n) => {
  const units = [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  const u = units.find(([v]) => Math.abs(n) >= v);
  return u ? `${(n / u[0]).toFixed(1).replace(/\.0$/, '')}${u[1]}` : `${Math.round(n)}`;
};
const range = (xs, fmt = f1) => (xs.length ? `${fmt(median(xs))} (${fmt(Math.min(...xs))}–${fmt(Math.max(...xs))})` : '-');

export const MILESTONES = [
  ...ISLANDS.filter((d) => d.available).map((d) => `${d.name} cleared`),
  'The Abyss opened', 'Abyss depth 25', 'Abyss depth 50', 'Abyss depth 100',
  ...SEAS.map((s) => `${s.stages[s.stages.length - 1].id} beaten`),
  'First awakening', '4 awakened', 'All awakened',
  ...UNCHARTED.crewRewards.map((r) => `Earned: ${HEROES[r.hero].name}`),
  'Full roster',
];

const byProfile = (runs) => runs.reduce((m, r) => ((m[r.profile] ??= []).push(r), m), {});
const sorted = (runs) => [...runs].sort((a, b) => a.seed - b.seed);

// The run whose end day is the median of its profile's.
export function medianRun(runs) {
  const s = [...runs].sort((a, b) => a.endDay - b.endDay);
  return s[Math.floor((s.length - 1) / 2)];
}

function timeline(runs) {
  const out = ['| Milestone | Days (median, range) | Hours played | Attempts so far | Runs |', '|---|---|---|---|---:|'];
  for (const name of MILESTONES) {
    const hit = runs.map((r) => r.milestones[name]).filter(Boolean);
    out.push(`| ${name} | ${range(hit.map((m) => m.day))} | ${range(hit.map((m) => m.hours))} | `
      + `${range(hit.map((m) => m.attempts), (n) => `${Math.round(n)}`)} | ${hit.length}/${runs.length} |`);
  }
  return out.join('\n');
}

function walls(runs) {
  const rows = runs.flatMap((r) => r.walls.map((w) => ({ ...w, profile: r.profile, seed: r.seed })));
  if (!rows.length) return 'None: no run was stuck more than a real day on one wave or one stage at one crown.';
  const out = ['| Profile | Seed | Where (stage@crowns) | From day | Days stuck | Tries (lost) | What sank the ship (hull damage, lost tries) | Crew at the start | Got past by |',
    '|---|---:|---|---:|---:|---|---|---|---|'];
  for (const w of rows.sort((a, b) => a.profile.localeCompare(b.profile) || a.seed - b.seed || a.from - b.from)) {
    out.push(`| ${w.profile} | ${w.seed} | ${w.key.replace(/^U/, '')}${w.open ? ' (open)' : ''} | ${f1(w.from)} | ${f1(w.days)} | `
      + `${w.attempts} (${w.losses}) | ${w.hull} | ${w.startCrew} | ${w.past.join(', ')} |`);
  }
  return out.join('\n');
}

// Island losses: all of them, and the longest streak.
function islandLosses(runs) {
  return runs.map((r) => `${r.profile} ${r.seed}: ${r.ff.played.islands - 200} island losses, ${r.ff.played.hunts} hunts`).join('; ');
}

function sessionTable(run) {
  const out = ['| Session | Day, hour | Furthest | Gold earned | Battle | Offline | Merchants | Expeditions | Islands | Hunts | Abyss | Uncharted | New crew / stars / parts / awakenings |',
    '|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|'];
  run.sessionLog.forEach((s, i) => {
    const g = sum(Object.values(s.gold));
    const m = (ms) => (ms ? `${Math.round(ms / 60e3)}m` : '-');
    out.push(`| ${i + 1} | ${s.day}, ${String(Math.round(s.hour)).padStart(2, '0')}:00 | ${progressLabel(s.progress)} | ${big(g)} | `
      + `${pct(s.gold.battle, g)} | ${pct(s.gold.offline, g)} | ${pct(s.gold.merchant, g)} | ${pct(s.gold.expedition, g)} | `
      + `${m(s.modeMs.islands)} | ${m(s.modeMs.hunts)} | ${m(s.modeMs.abyss)} | ${m(s.modeMs.uncharted)} | `
      + `${s.events.crew} / ${s.events.stars} / ${s.events.parts} / ${s.events.awaken} |`);
  });
  return out.join('\n');
}

function dayTable(run) {
  const out = ['| Day | Furthest | Gold earned | Battle | Offline | Merchants | Expeditions | Islands | Hunts | Abyss | Uncharted |',
    '|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|'];
  for (const d of run.days) {
    const g = sum(Object.values(d.gold));
    const m = (ms) => (ms ? `${Math.round(ms / 60e3)}m` : '-');
    out.push(`| ${d.day} | ${progressLabel(d.progress)} | ${big(g)} | ${pct(d.gold.battle, g)} | ${pct(d.gold.offline, g)} | `
      + `${pct(d.gold.merchant, g)} | ${pct(d.gold.expedition, g)} | ${m(d.modeMs.islands)} | ${m(d.modeMs.hunts)} | ${m(d.modeMs.abyss)} | ${m(d.modeMs.uncharted)} |`);
  }
  return out.join('\n');
}

export function progressLabel(pr) {
  if (!pr) return '-';
  if (!pr.abyss && !pr.crowns) return pr.island;
  return `${pr.frontier === '-' ? pr.island : `Uncharted ${pr.frontier}`} (${pr.crowns}♛), Abyss ${pr.abyss}`;
}

// Days where nothing moved (no new island wave, depth, crown or awakening).
const progressKey = (pr) => (pr ? `${pr.islandScale}:${pr.abyss}:${pr.crowns}:${pr.awakened}` : '');
function deadTime(runs) {
  const out = ['| Profile | Days with no progress (median, range) | Sessions with nothing to spend on | Longest stretch with no new crewmate, part level or awakening |',
    '|---|---|---|---|'];
  for (const [profile, rs] of Object.entries(byProfile(runs))) {
    const dead = rs.map((r) => r.days.filter((d, i) => i > 0 && progressKey(d.progress) === progressKey(r.days[i - 1].progress)).length);
    const noSpend = rs.map((r) => r.sessionsNoSpend);
    const sessions = rs.map((r) => r.sessions);
    const gaps = rs.map((r) => longestGap(r));
    out.push(`| ${profile} | ${range(dead, (n) => `${n}`)} | ${sum(noSpend)} of ${sum(sessions)} | `
      + `${range(gaps.map((g) => g.hours), (n) => `${n.toFixed(1)} h`)} real (${range(gaps.map((g) => g.sessions), (n) => `${n}`)} sessions) |`);
  }
  return out.join('\n');
}
function longestGap(run) {
  let best = { sessions: 0, hours: 0 };
  let since = null;
  run.sessionLog.forEach((s, i) => {
    const t = s.day * 24 + s.hour;
    const event = s.events.crew + s.events.parts + s.events.awaken > 0;
    if (since == null) since = { i, t };
    if (event) {
      if (i - since.i > best.sessions) best = { sessions: i - since.i, hours: t - since.t };
      since = { i, t };
    }
  });
  return best;
}

function economy(runs) {
  const out = [];
  out.push('| Profile | Gold from battle | Offline | Merchants | Expeditions | Offline payouts at the 8-wave hold / at the 4 h cap | Offline paid vs the time cap alone |',
    '|---|---:|---:|---:|---:|---|---:|');
  for (const [profile, rs] of Object.entries(byProfile(runs))) {
    const g = (k) => sum(rs.flatMap((r) => r.days.map((d) => d.gold[k])));
    const total = g('battle') + g('offline') + g('merchant') + g('expedition');
    const off = rs.map((r) => r.offline);
    out.push(`| ${profile} | ${pct(g('battle'), total)} | ${pct(g('offline'), total)} | ${pct(g('merchant'), total)} | ${pct(g('expedition'), total)} | `
      + `${sum(off.map((o) => o.full))} / ${sum(off.map((o) => o.timeCapped))} of ${sum(off.map((o) => o.reports))} | `
      + `${pct(sum(off.map((o) => o.gold)), sum(off.map((o) => o.uncapped)))} |`);
  }
  out.push('', '| Profile | Grog regained | Wasted at the cap | Share wasted | First-clear refunds | Loss refunds | Galleons | Coral Shallows | Grog spent |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const [profile, rs] of Object.entries(byProfile(runs))) {
    const g = (k) => median(rs.map((r) => r.grog[k]));
    out.push(`| ${profile} | ${g('regen')} | ${g('wasted')} | ${pct(g('wasted'), g('wasted') + g('regen'))} | ${g('firstClear')} | ${g('refunded')} | `
      + `${g('galleon')} | ${g('coral')} | ${g('spent')} |`);
  }
  out.push('', '(Medians per run.)', '', '| Profile | Pearls earned | Spent | Full roster (day) | Battles with a meal on | Meals cooked (all runs) |', '|---|---:|---:|---|---:|---|');
  for (const [profile, rs] of Object.entries(byProfile(runs))) {
    const cooked = {};
    for (const r of rs) for (const [id, n] of Object.entries(r.meals.cooked)) cooked[id] = (cooked[id] ?? 0) + n;
    const roster = rs.map((r) => r.milestones['Full roster']?.day).filter((d) => d != null);
    out.push(`| ${profile} | ${median(rs.map((r) => r.pearls.earned))} | ${median(rs.map((r) => r.pearls.spent))} | `
      + `${roster.length ? range(roster) : 'not reached'} (${roster.length}/${rs.length}) | `
      + `${pct(sum(rs.map((r) => r.meals.withMeal)), sum(rs.map((r) => r.meals.battles)))} | `
      + `${Object.entries(cooked).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id} ${n}`).join(', ')} |`);
  }
  out.push('', '| Profile | Merchants seen / tapped | Expeditions (by length) | Casts / landed |', '|---|---|---|---|');
  for (const [profile, rs] of Object.entries(byProfile(runs))) {
    const lengths = {};
    for (const r of rs) for (const [id, n] of Object.entries(r.expeditions.byDuration)) lengths[id] = (lengths[id] ?? 0) + n;
    out.push(`| ${profile} | ${sum(rs.map((r) => r.merchants.seen))} / ${sum(rs.map((r) => r.merchants.tapped))} | `
      + `${Object.entries(lengths).map(([id, n]) => `${id} ${n}`).join(', ')} | ${sum(rs.map((r) => r.fishing.casts))} / ${sum(rs.map((r) => r.fishing.landed))} |`);
  }
  return out.join('\n');
}

function runsTable(runs) {
  const out = ['| Profile | Seed | Stopped | Day | Hours played | Battles | Islands / hunts / Abyss / Uncharted battles | Skipped (fast-forward) | Final crew | Wall clock |',
    '|---|---:|---|---:|---:|---:|---|---:|---|---:|'];
  for (const r of runs) {
    const pl = r.ff.played;
    out.push(`| ${r.profile} | ${r.seed} | ${r.stoppedAt} | ${f1(r.endDay)} | ${f1(r.playedMs / HOUR)} | ${r.attempts} | `
      + `${pl.islands} / ${pl.hunts} / ${pl.abyss + r.ff.skipped.abyss} / ${pl.uncharted + r.ff.skipped.uncharted} | `
      + `${r.ff.skipped.abyss + r.ff.skipped.uncharted} | ${r.final.crew} | ${Math.round(r.wallSec)}s |`);
  }
  return out.join('\n');
}

export function report(results, {
  wallSec, days, ff, playOn, profiles,
}) {
  const runs = profiles.flatMap((p) => sorted(results.filter((r) => r.profile === p)));
  const parts = [`# Journey sim: ${runs.length} runs, ${days}-day cap${ff ? '' : ', no fast-forward'}${playOn ? ', played on past 6-6' : ''}, ${Math.round(wallSec)} s wall clock`, ''];
  parts.push('## Runs', '', runsTable(runs), '');
  for (const [profile, rs] of Object.entries(byProfile(runs))) parts.push(`## A. Timeline: ${profile}`, '', timeline(rs), '');
  parts.push('## B. Walls', '', walls(runs), '', islandLosses(runs), '');
  const regular = byProfile(runs).regular;
  if (regular) {
    const m = medianRun(regular);
    parts.push(`## C. Pacing: the median Regular run (seed ${m.seed}), per day`, '', dayTable(m), '', 'Per session:', '', sessionTable(m), '');
  }
  for (const [profile, rs] of Object.entries(byProfile(runs))) {
    if (profile === 'regular') continue;
    const m = medianRun(rs);
    parts.push(`### The median ${profile} run (seed ${m.seed}), per day`, '', dayTable(m), '');
  }
  parts.push('## D. Dead time', '', deadTime(runs), '');
  parts.push('## E. Economy', '', economy(runs), '');
  return parts.join('\n');
}

// --- The pacing chart ---

// The median Regular run, per session, as small multiples sharing the x
// axis (one y-scale each): gold earned (log), its share by source, and the
// minutes played per mode. A table of the same numbers is in the report.
const SERIES = {
  gold: [['battle', 'Battle', '#2a78d6'], ['offline', 'Offline', '#eb6834'], ['merchant', 'Merchants', '#1baf7a'], ['expedition', 'Expeditions', '#eda100']],
  mode: [['islands', 'Islands', '#2a78d6'], ['hunts', 'Boss Hunts', '#eb6834'], ['abyss', 'The Abyss', '#1baf7a'], ['uncharted', 'Uncharted Seas', '#eda100']],
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function svg(results) {
  const regular = results.filter((r) => r.profile === 'regular');
  if (!regular.length) return '';
  const run = medianRun(regular);
  const log = run.sessionLog;
  const W = 760;
  const left = 64;
  const right = 16;
  const colW = (W - left - right) / log.length;
  const barW = Math.max(4, colW - 6);
  const x = (i) => left + i * colW + (colW - barW) / 2;
  const panels = [];
  let y = 64;
  const head = (title, sub) => {
    panels.push(`<text x="${left}" y="${y}" class="t">${esc(title)}</text><text x="${left}" y="${y + 14}" class="s">${esc(sub)}</text>`);
    y += 26;
  };
  const legend = (series) => {
    let lx = left;
    for (const [, name, color] of series) {
      panels.push(`<rect x="${lx}" y="${y - 8}" width="10" height="10" rx="2" fill="${color}"/><text x="${lx + 14}" y="${y + 1}" class="s">${esc(name)}</text>`);
      lx += 22 + name.length * 6.5;
    }
    y += 14;
  };
  // 1. Furthest progress, as labels.
  head('Furthest progress after each session', `Regular, seed ${run.seed}: ${log.length} sessions of 20 minutes at x4 over ${Math.ceil(run.endDay)} days`);
  log.forEach((s, i) => {
    const label = s.progress.crowns ? `U ${s.progress.frontier}` : s.progress.island;
    panels.push(`<text x="${x(i) + barW / 2}" y="${y + 10}" class="v" text-anchor="middle">${esc(label)}</text>`);
  });
  y += 30;
  // 2. Gold earned (log scale).
  const golds = log.map((s) => sum(Object.values(s.gold)));
  const lo = Math.floor(Math.log10(Math.max(1, Math.min(...golds.filter((g) => g > 0)))));
  const hi = Math.ceil(Math.log10(Math.max(...golds)));
  const H = 110;
  head('Gold earned per session', 'log scale');
  const gy = (g) => y + H - (H * (Math.log10(Math.max(g, 10 ** lo)) - lo)) / (hi - lo);
  for (let e = lo; e <= hi; e += Math.max(1, Math.round((hi - lo) / 5))) {
    panels.push(`<line x1="${left}" x2="${W - right}" y1="${gy(10 ** e)}" y2="${gy(10 ** e)}" class="g"/><text x="${left - 6}" y="${gy(10 ** e) + 3}" class="s" text-anchor="end">${big(10 ** e)}</text>`);
  }
  log.forEach((s, i) => {
    const g = golds[i];
    const top = gy(g);
    panels.push(`<rect x="${x(i)}" y="${top}" width="${barW}" height="${Math.max(1, y + H - top)}" rx="2" fill="#2a78d6"><title>Session ${i + 1}: ${big(g)} gold</title></rect>`);
  });
  y += H + 30;
  // 3. and 4. 100% stacks.
  const stack = (title, sub, field, series, total) => {
    head(title, sub);
    legend(series);
    const HH = 90;
    for (const f of [0, 0.5, 1]) {
      panels.push(`<line x1="${left}" x2="${W - right}" y1="${y + HH * (1 - f)}" y2="${y + HH * (1 - f)}" class="g"/><text x="${left - 6}" y="${y + HH * (1 - f) + 3}" class="s" text-anchor="end">${total ? `${Math.round(f * total)}m` : `${f * 100}%`}</text>`);
    }
    log.forEach((s, i) => {
      const vals = series.map(([k]) => s[field][k] / (field === 'modeMs' ? 60e3 : 1));
      const denom = total ?? sum(vals) ?? 1;
      let base = y + HH;
      series.forEach(([, name, color], k) => {
        const h = denom ? (HH * vals[k]) / denom : 0;
        if (h < 0.5) return;
        const gap = h > 3 ? 1 : 0;
        panels.push(`<rect x="${x(i)}" y="${base - h + gap}" width="${barW}" height="${h - gap}" rx="1" fill="${color}"><title>Session ${i + 1}, ${name}: ${field === 'modeMs' ? `${vals[k].toFixed(1)} min` : `${Math.round((100 * vals[k]) / denom)}%`}</title></rect>`);
        base -= h;
      });
    });
    y += HH + 30;
  };
  stack('Where the gold came from', 'share of each session\'s gold', 'gold', SERIES.gold, null);
  const maxMin = Math.max(...log.map((s) => sum(Object.values(s.modeMs)) / 60e3));
  stack('Minutes played per mode', 'battle time at x4 plus results screens, per session', 'modeMs', SERIES.mode, Math.ceil(maxMin / 5) * 5);
  // x axis: session numbers.
  log.forEach((s, i) => panels.push(`<text x="${x(i) + barW / 2}" y="${y - 14}" class="s" text-anchor="middle">${i + 1}</text>`));
  panels.push(`<text x="${left}" y="${y + 2}" class="s">session (day ${log.map((s) => s.day).filter((d, i, a) => a.indexOf(d) === i).join(', ')})</text>`);
  const height = y + 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${height}" width="${W}" height="${height}" font-family="system-ui, sans-serif">
<style>
  .bg { fill: #fcfcfb; } .t { font-size: 13px; font-weight: 600; fill: #0b0b0b; } .s { font-size: 10px; fill: #52514e; }
  .v { font-size: 9px; fill: #0b0b0b; } .g { stroke: #e4e3df; stroke-width: 1; }
  @media (prefers-color-scheme: dark) { .bg { fill: #1a1a19; } .t, .v { fill: #f0efec; } .s { fill: #c3c2b7; } .g { stroke: #383835; } }
</style>
<rect class="bg" width="100%" height="100%"/>
<text x="${left}" y="28" class="t" style="font-size:15px">Hold the Deck: the journey of a median Regular player</text>
<text x="${left}" y="44" class="s">npm run sim:journey -- regular 5 (BALANCE_REPORT section 21)</text>
${panels.join('\n')}
</svg>
`;
}
