// What a Frostbite Reef wave-25 save gets for time away (BALANCE_REPORT 22):
// its idle rate at a wave's gold per 75 s of battle (about what the voyage
// sim's greedy crews take there), through Offline.awayEarnings.
import { MOBILE } from '../../src/config.js';
import { awayEarnings, countedMs, waveGoldOf } from '../../src/systems/Offline.js';
import { Progress } from '../../src/systems/Progress.js';
import { formatNum } from '../../src/ui/format.js';

const HOUR = 3600e3;
const p = new Progress();
p.islands.frostbite_reef = {
  wave: 25, best: 24, cleared: false, bossPaid: 0, dropsPaid: {},
};
p.islandId = 'frostbite_reef';
const wave = waveGoldOf(p);
const secs = Number(process.argv[2] ?? 75);
const idleRate = wave / secs;
const now = Date.UTC(2026, 10, 2, 12);
const O = MOBILE.offline;
console.log(`Frostbite Reef wave 25: one wave ${formatNum(wave)} gold; idle rate ${formatNum(idleRate)}/s (a wave per ${secs} s); hold ${formatNum(O.waveCap * wave)}`);
console.log('| Away | Counts as | Old rule (10%, 4 h) | New rule | Waves |');
console.log('|---|---:|---:|---:|---:|');
for (const h of [0.5, 1, 2, 4, 8]) {
  const r = awayEarnings({ idleRate, lastSeen: now - h * HOUR, now, waveGold: wave });
  const old = Math.min(Math.floor(idleRate * O.share * Math.min(h * HOUR, 4 * HOUR) / 1000), O.waveCap * wave);
  console.log(`| ${h < 1 ? `${h * 60} min` : `${h} h`} | ${(countedMs(h * HOUR) / HOUR).toFixed(2)} h | ${formatNum(old)} | ${formatNum(r.gold)}${r.full ? ' (hold full)' : ''} | ${(r.gold / wave).toFixed(1)} |`);
}
