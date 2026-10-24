import { MOBILE } from '../config.js';
import * as Expeditions from './Expeditions.js';

// While you were away: gold for time spent away from the game, at a share
// of the idle rate (progress.idleRate: gold per second of battle, a moving
// average sampled at each wave cleared on an island or in the Abyss), plus
// what else came in meanwhile (expeditions back, Bait). progress.lastSeen
// is when the player last had the game open (written on every save, and as
// the page is hidden).

const O = MOBILE.offline;

// The idle rate after one more sample (gold per second of battle).
export function sampleIdleRate(rate, goldPerSecond) {
  if (!Number.isFinite(goldPerSecond) || goldPerSecond < 0) return rate;
  return (1 - O.emaWeight) * rate + O.emaWeight * goldPerSecond;
}

// Gold for being away from lastSeen to now: { awayMs, capped, gold }.
// Nothing under minAwayMs; at most capMs counts. A clock that went
// backwards (now < lastSeen) gives nothing (backwards: true).
export function awayEarnings({ idleRate, lastSeen, now }) {
  if (!Number.isFinite(lastSeen) || now < lastSeen) return { awayMs: 0, capped: false, gold: 0, backwards: now < lastSeen };
  const awayMs = now - lastSeen;
  if (awayMs < O.minAwayMs) return { awayMs, capped: false, gold: 0, backwards: false };
  const counted = Math.min(awayMs, O.capMs);
  const gold = Math.floor(Math.max(0, idleRate) * O.share * counted / 1000);
  return { awayMs, capped: awayMs > O.capMs, gold, backwards: false };
}

// The player is back (the game loaded, or the page shown again): what came
// in since progress.lastSeen, and lastSeen moves to now. Expeditions and
// Bait are brought up to now here; the gold is only reported (paid by
// collect()). Returns { awayMs, capped, gold, expeditions (that came back
// while away), bait: { from, to } or null } or null if there's nothing to
// tell (or the player was away under minAwayMs).
export function comeBack(progress, now = Date.now()) {
  const { lastSeen } = progress;
  const earned = awayEarnings({ idleRate: progress.idleRate, lastSeen, now });
  const readyBefore = Expeditions.readyCount(progress);
  Expeditions.tick(progress, now);
  const expeditions = Math.max(0, Expeditions.readyCount(progress) - readyBefore);
  // Bait as it was when the player left (it's only counted up when looked
  // at), then as it is now.
  if (Number.isFinite(lastSeen) && lastSeen >= progress.baitAt && lastSeen <= now) progress.tickBait(lastSeen);
  const baitFrom = progress.bait;
  progress.tickBait(now);
  const bait = progress.bait > baitFrom ? { from: baitFrom, to: progress.bait } : null;
  progress.lastSeen = now;
  if (earned.backwards || earned.awayMs < O.minAwayMs) return null;
  if (!earned.gold && !expeditions && !bait) return null;
  return { ...earned, expeditions, bait };
}

// Pay a comeBack() report's gold.
export function collect(progress, report) {
  const gold = progress.earnGold(report.gold);
  progress.goldAway += gold;
  return gold;
}

// "5 h 12 m" (or "45 m", "3 m").
export function formatAway(ms) {
  const minutes = Math.floor(ms / 60000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${m} m` : `${m} m`;
}
