import { ABILITIES } from '../config.js';

// Crew text helpers (the crew grid, the quick-upgrade card, hero cards and
// the Crew Roster): a crewmate's effect and ability lines.

const pct = (n) => `${Math.round(n * 100)}%`;
const secs = (ms) => `${+(ms / 1000).toFixed(1)}s`;

// One-line summary of a hero's effect, built from its config numbers.
export function describeHero(def) {
  if (def.aura) {
    const { aura } = def;
    return `No attack. Deck buff: +${pct(aura.damageBonus)} dmg (+${pct(aura.damageBonusPerLevel)} per level, `
      + `max ${pct(aura.maxDamageBonus)}), +${pct(aura.attackSpeedBonus)} speed`;
  }
  const parts = [];
  if (def.stun) parts.push(`${pct(def.stun.chance)} chance to stun ${secs(def.stun.duration)}`);
  if (def.lob) parts.push('lobbed');
  if (def.area) parts.push('area hit');
  if (def.pierce) parts.push(`pierces up to ${def.pierce.maxTargets} enemies in a line`);
  if (def.poison) parts.push(`poison: ${pct(def.poison.ratio)} dmg/s for ${secs(def.poison.duration)}`);
  if (def.crit) parts.push(`${pct(def.crit.chance)} crit chance for ${def.crit.multiplier}x damage`);
  if (def.slow) parts.push(`slows ${pct(1 - def.slow.factor)} for ${secs(def.slow.duration)}`);
  if (def.chill) parts.push(`chills ${pct(1 - def.chill.factor)} for ${secs(def.chill.duration)}`);
  if (def.jet) parts.push('short-range flame hits all near the target');
  if (def.burn) parts.push(`burn: ${pct(def.burn.ratio)} dmg/s for ${secs(def.burn.duration)}`);
  if (def.knockback) parts.push('knocks foes back');
  if (def.curse) parts.push(`curse: +${pct(def.curse.bonus)} damage taken from all`);
  if (def.targets === 'furthest') parts.push('aims at the furthest foe');
  if (def.ignoresArmor) parts.push('ignores armour');
  if (def.passesShields) parts.push('passes through shields');
  if (def.chain) parts.push(`chain lightning hits up to ${def.chain.targets}`);
  if (def.antiAir) parts.push(def.flyerBonus ? `hits flyers for ${def.flyerBonus}x` : 'hits flyers');
  if (def.netsFlyers) parts.push('nets ground flyers');
  // The Uncharted Seas' crew.
  if (def.burst) parts.push(`${def.burst.count} shots per attack`);
  if (def.mines) parts.push(`lays mines on the lane (${def.mines.max} at once)`);
  if (def.grab) parts.push(`tentacles hold ${def.grab.targets > 1 ? `${def.grab.targets} foes` : 'the front foe'} ${secs(def.grab.holdMs)}`);
  if (def.crewAura?.attackSpeed) parts.push(`crew +${pct(def.crewAura.attackSpeed)} attack speed`);
  if (def.crewAura?.range) parts.push(`crew +${pct(def.crewAura.range)} range`);
  if (def.mend) parts.push(`repairs ${pct(def.mend.share)} hull every ${secs(def.mend.every)}`);
  if (def.reveals) parts.push('reveals hidden foes');
  if (def.rage) parts.push(`+1% dmg per 1% hull missing (max ${pct(def.rage.max)})`);
  if (def.levelSpeed) parts.push(`+${pct(def.levelSpeed.perLevel)} attack speed per level (max ${pct(def.levelSpeed.max)})`);
  const text = parts.join(', ') || 'Fast shots, no effect';
  return text[0].toUpperCase() + text.slice(1);
}

// A crewmate's ability effect line, from ABILITIES[id].effect with its
// {placeholders} filled in. scale: the hero's ability scale (level and stars),
// which lengthens durations.
export function describeAbility(id, scale = 1) {
  const a = ABILITIES[id];
  const values = {
    duration: a.duration != null && secs(a.duration * scale),
    stun: a.stun != null && secs(a.stun * scale),
    slow: a.slow != null && pct(1 - a.slow),
    bonus: a.bonus != null && pct(a.bonus),
    attackSpeed: a.attackSpeed != null && pct(a.attackSpeed - 1),
    damage: a.damage != null && `${a.damage}x`,
    heal: a.heal != null && pct(a.heal),
    balls: a.balls,
    hits: a.hits,
    bombs: a.bombs,
    count: a.count,
    ground: a.ground != null && secs(a.ground * scale),
    shots: a.shots,
    mines: a.mines,
  };
  return a.effect.replace(/\{(\w+)\}/g, (_, key) => values[key]);
}

// "15S COOLDOWN", and "RAPID FIRE  15S COOLDOWN".
export const cooldownLabel = (id) => `${secs(ABILITIES[id].cooldown).toUpperCase()} COOLDOWN`;
export const abilityTitle = (id) => `${ABILITIES[id].name.toUpperCase()}  ${cooldownLabel(id)}`;
