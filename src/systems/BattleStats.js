import { ENEMIES } from '../config.js';

// The Captain's Log tracking: per wave, what each crewmate did and which
// enemy types hurt the hull. Kept cheap for big waves: damage is credited
// through small shared source objects ({ hero, kind }), and each hit is a few
// additions into a per-crewmate entry.

// What a crewmate's damage came from: their normal attacks (splash, chain
// lightning and pierce included), their ability, or poison and status
// effects (poison ticks, a curse's bonus damage).
export const KINDS = ['attack', 'ability', 'effect'];

// Support crew's extra stat (an entry field), by hero id.
export const SUPPORT = {
  captain: 'aura',        // bonus damage his deck aura added to the others' hits
  shipsDoctor: 'healed',  // hull HP repaired
  netThrower: 'slowed',   // enemies slowed (each net or Big Net that caught one)
  shipsCook: 'stuns',     // stuns applied
};

// One shared source object per hero and kind, so hits allocate nothing.
const SOURCES = {};
export function damageSource(hero, kind) {
  SOURCES[hero] ??= {};
  SOURCES[hero][kind] ??= { hero, kind };
  return SOURCES[hero][kind];
}

// ENEMIES key of an enemy (boarding boats, launched by the Ghost Galleon,
// carry no key of their own).
const KEY_OF_DEF = new Map(Object.entries(ENEMIES).map(([key, def]) => [def, key]));
const enemyKey = (enemy) => enemy.key ?? KEY_OF_DEF.get(enemy.def) ?? null;

export class BattleStats {
  constructor() {
    this.crew = null;   // hero id -> entry, while a wave runs
  }

  // A wave starts with these crewmates (Hero objects, slot order). A crewmate
  // The Captain buffs has auraShare: the part of each of their hits that his
  // aura added (attacks also count the extra attack speed).
  start(wave, island, heroes) {
    this.wave = wave;
    this.island = island;
    this.order = heroes.map((h) => h.id);
    this.crew = {};
    for (const h of heroes) {
      const aura = h.aura;
      this.crew[h.id] = {
        attack: 0, ability: 0, effect: 0, kills: 0, uses: 0, aura: 0, healed: 0, slowed: 0, stuns: 0,
        auraFrom: aura?.from ?? null,
        auraAttack: aura ? 1 - 1 / (aura.damage * aura.speed) : 0,
        auraOther: aura ? 1 - 1 / aura.damage : 0,
      };
    }
    this.hull = {};
  }

  // amount of damage actually dealt by source (after armour, shields and
  // overkill).
  dealt(source, amount) {
    const c = this.crew?.[source.hero];
    if (!c) return;
    c[source.kind] += amount;
    if (c.auraFrom) {
      const from = this.crew[c.auraFrom];
      if (from) from.aura += amount * (source.kind === 'attack' ? c.auraAttack : c.auraOther);
    }
  }

  kill(source) {
    const c = this.crew?.[source.hero];
    if (c) c.kills++;
  }

  abilityUsed(hero) {
    const c = this.crew?.[hero];
    if (c) c.uses++;
  }

  // A support stat (SUPPORT) went up by n.
  add(hero, field, n = 1) {
    const c = this.crew?.[hero];
    if (c) c[field] += n;
  }

  // amount of hull HP an enemy took off the ship.
  hullHit(enemy, amount) {
    if (!this.crew || amount <= 0) return;
    const key = enemyKey(enemy);
    if (key) this.hull[key] = (this.hull[key] ?? 0) + amount;
  }

  // The wave is over: its record for the log (whole numbers), or null if
  // none was running.
  finish(won) {
    if (!this.crew) return null;
    const round = (n) => Math.round(n);
    const record = {
      wave: this.wave,
      island: this.island,
      won,
      crew: this.order.map((id) => {
        const c = this.crew[id];
        const entry = {
          id, attack: round(c.attack), ability: round(c.ability), effect: round(c.effect), kills: c.kills, uses: c.uses,
        };
        if (SUPPORT[id]) entry.support = round(c[SUPPORT[id]]);
        return entry;
      }),
      hull: Object.fromEntries(Object.entries(this.hull).map(([k, v]) => [k, round(v)])),
    };
    this.crew = null;
    return record;
  }
}

// --- Reading records ---

export const totalDamage = (c) => c.attack + c.ability + c.effect;

// Crew entries summed by hero over several records (first seen first).
export function sumCrew(records) {
  const byId = new Map();
  for (const r of records) {
    for (const c of r.crew) {
      const sum = byId.get(c.id);
      if (!sum) {
        byId.set(c.id, { ...c });
        continue;
      }
      for (const f of ['attack', 'ability', 'effect', 'kills', 'uses', 'support']) {
        if (c[f] != null) sum[f] = (sum[f] ?? 0) + c[f];
      }
    }
  }
  return [...byId.values()];
}

// Hull damage summed by enemy type over several records.
export function sumHull(records) {
  const out = {};
  for (const r of records) for (const [k, v] of Object.entries(r.hull)) out[k] = (out[k] ?? 0) + v;
  return out;
}

// The record's top damage dealer ({ id, damage }), or null if nobody dealt any.
export function mvpOf(record) {
  let best = null;
  for (const c of record.crew) {
    const damage = totalDamage(c);
    if (damage > 0 && (!best || damage > best.damage)) best = { id: c.id, damage };
  }
  return best;
}
