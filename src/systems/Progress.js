import { ECONOMY, HEROES, HOUSE, PACKS, PRESTIGE, RARITY, SEMANGAT_SHOP, STARTING_HEROES, UPGRADES } from '../config.js';

const scaledCost = ({ baseCost, costGrowth }, level) => Math.round(baseCost * costGrowth ** level);

// Everything the player has earned. Plain data plus the formulas that read it.
// toSave() / fromSave() convert to and from the stored form (see Save.js).
export class Progress {
  constructor() {
    this.wave = 1;
    this.gold = ECONOMY.startingGold;
    this.angPow = ECONOMY.startingAngPow;
    this.lastBossRewardWave = 0;    // stops boss Ang Pow being farmed on retries
    this.packsSinceLegendary = 0;   // pity counter
    this.houseHpLevel = 0;
    this.floors = HOUSE.startingFloors;
    this.owned = [...STARTING_HEROES];
    this.heroLevels = {};           // missing entry = level 1
    this.heroStars = {};            // missing entry = 0 stars
    // One entry per possible slot (all floors); only the first slotCount are usable.
    this.slots = Array(HOUSE.maxFloors * HOUSE.slotsPerFloor).fill(null);
    this.slots[0] = STARTING_HEROES[0];

    this.muted = false;             // sound effects off

    // Prestige ("Pindah Kampung"): kept across runs.
    this.semangat = 0;
    this.semangatShop = {};         // bonus key -> level; missing = 0
    this.prestigeCount = 0;
    this.bestWave = 1;              // highest wave ever reached, all runs
    this.goldFraction = 0;          // carry for fractional bonus gold; not saved

    // Dev-only: treat every hero as owned. Not part of saved progress.
    this.devUnlockAll = false;
  }

  // --- Saving ---

  // Plain object of real progress. Dev-unlocked heroes (and their levels/stars)
  // are left out so the dev toggle never leaks into a save.
  toSave() {
    const owned = [...this.owned];
    const ownedOnly = (obj) => Object.fromEntries(Object.entries(obj).filter(([id]) => owned.includes(id)));
    return {
      wave: this.wave,
      gold: this.gold,
      angPow: this.angPow,
      lastBossRewardWave: this.lastBossRewardWave,
      houseHpLevel: this.houseHpLevel,
      floors: this.floors,
      owned,
      heroLevels: ownedOnly(this.heroLevels),
      heroStars: ownedOnly(this.heroStars),
      slots: this.slots.map((id) => (id && owned.includes(id) ? id : null)),
      muted: this.muted,
      packsSinceLegendary: this.packsSinceLegendary,
      semangat: this.semangat,
      semangatShop: { ...this.semangatShop },
      prestigeCount: this.prestigeCount,
      bestWave: this.bestWave,
    };
  }

  // Build from saved data, clamping anything out of range or unknown so a
  // hand-edited or partially broken save can't crash the game.
  static fromSave(data) {
    const p = new Progress();
    const int = (v, min, max = Infinity, fallback = min) =>
      (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback);

    p.wave = int(data.wave, 1);
    p.gold = int(data.gold, 0);
    p.angPow = int(data.angPow, 0, Infinity, p.angPow);
    p.lastBossRewardWave = int(data.lastBossRewardWave, 0);
    p.houseHpLevel = int(data.houseHpLevel, 0);
    p.floors = int(data.floors, HOUSE.startingFloors, HOUSE.maxFloors);
    p.muted = data.muted === true;
    p.packsSinceLegendary = int(data.packsSinceLegendary, 0, PACKS.legendaryPity - 1);
    p.semangat = int(data.semangat, 0);
    p.prestigeCount = int(data.prestigeCount, 0);
    p.bestWave = Math.max(p.wave, int(data.bestWave, 1));
    for (const [key, bonus] of Object.entries(SEMANGAT_SHOP)) {
      const level = data.semangatShop?.[key];
      if (level != null) p.semangatShop[key] = int(level, 0, bonus.maxLevel ?? Infinity);
    }

    const owned = Array.isArray(data.owned) ? data.owned.filter((id) => id in HEROES) : [];
    p.owned = [...new Set([...STARTING_HEROES, ...owned])];

    for (const id of p.owned) {
      if (data.heroLevels?.[id] != null) p.heroLevels[id] = int(data.heroLevels[id], 1);
      if (data.heroStars?.[id] != null) p.heroStars[id] = int(data.heroStars[id], 0, PACKS.maxStars);
    }

    if (Array.isArray(data.slots)) {
      const seen = new Set();
      p.slots = p.slots.map((_, i) => {
        const id = data.slots[i];
        if (!id || !p.owned.includes(id) || seen.has(id)) return null;
        seen.add(id);
        return id;
      });
    }
    return p;
  }

  // --- Heroes & slots ---

  isOwned(id) { return this.devUnlockAll || this.owned.includes(id); }
  // Owned hero ids, Common first (stable within a rarity).
  get ownedHeroes() {
    const order = Object.keys(RARITY);
    return Object.keys(HEROES)
      .filter((id) => this.isOwned(id))
      .sort((a, b) => order.indexOf(HEROES[a].rarity) - order.indexOf(HEROES[b].rarity));
  }
  heroLevel(id) { return this.heroLevels[id] ?? 1; }
  heroStarCount(id) { return this.heroStars[id] ?? 0; }
  get slotCount() { return this.floors * HOUSE.slotsPerFloor; }

  // [{ id, slot }] for heroes in usable slots.
  get activeHeroes() {
    return this.slots.slice(0, this.slotCount)
      .map((id, slot) => ({ id, slot }))
      .filter(({ id }) => id && this.isOwned(id));
  }

  slotOf(id) {
    const slot = this.slots.indexOf(id);
    return slot < this.slotCount ? slot : -1;
  }

  // Put a hero (or null) in a slot. A hero already placed elsewhere swaps with
  // whatever is in the target slot.
  assignHero(slot, id) {
    if (slot < 0 || slot >= this.slotCount) return false;
    if (id && !this.isOwned(id)) return false;
    const from = id ? this.slots.indexOf(id) : -1;
    if (from !== -1) this.slots[from] = this.slots[slot];
    this.slots[slot] = id;
    return true;
  }

  setDevUnlockAll(on) {
    this.devUnlockAll = on;
    if (!on) this.slots = this.slots.map((id) => (id && this.isOwned(id) ? id : null));
  }

  // --- Derived stats ---

  get houseMaxHp() { return this.houseMaxHpAt(this.houseHpLevel); }

  houseMaxHpAt(hpLevel) {
    const base = HOUSE.baseHp
      + hpLevel * UPGRADES.houseHp.hpPerLevel
      + (this.floors - 1) * UPGRADES.floor.hpPerFloor;
    return Math.round(base * this.semangatMultiplier('houseHp'));
  }

  get canBuildFloor() { return this.floors < HOUSE.maxFloors; }

  heroDamage(id, level = this.heroLevel(id)) {
    const starBonus = PACKS.starDamageBonus[this.heroStarCount(id)];
    return HEROES[id].damage
      * (1 + (level - 1) * UPGRADES.heroLevel.damagePerLevel)
      * (1 + starBonus)
      * this.semangatMultiplier('heroDamage');
  }

  // Damage bonus an aura hero (Tok Penghulu) gives his floor, e.g. 0.5 = +50%.
  heroAuraBonus(id, level = this.heroLevel(id)) {
    const { aura } = HEROES[id];
    const starBonus = PACKS.starDamageBonus[this.heroStarCount(id)];
    return (aura.damageBonus + (level - 1) * aura.damageBonusPerLevel) * (1 + starBonus);
  }

  // Buffs from aura heroes for each active hero: slot -> { damage, attackSpeed }
  // multipliers. An aura hero buffs the others on its floor, not itself.
  get floorBuffs() {
    const buffs = {};
    const floorOf = (slot) => Math.floor(slot / HOUSE.slotsPerFloor);
    const active = this.activeHeroes;
    for (const { slot } of active) buffs[slot] = { damage: 1, attackSpeed: 1, buffed: false };
    for (const src of active) {
      const { aura } = HEROES[src.id];
      if (!aura) continue;
      for (const { slot } of active) {
        if (slot === src.slot || floorOf(slot) !== floorOf(src.slot)) continue;
        buffs[slot].damage *= 1 + this.heroAuraBonus(src.id);
        buffs[slot].attackSpeed *= 1 + aura.attackSpeedBonus;
        buffs[slot].buffed = true;
      }
    }
    return buffs;
  }

  // Base wave-clear gold, before the Semangat bonus (see earnGold).
  waveClearGold(wave = this.wave) {
    return ECONOMY.waveClearBase + (wave - 1) * ECONOMY.waveClearPerWave;
  }

  // Add base gold with the Semangat gold bonus applied; returns the whole gold
  // paid. Fractions carry over, so +10% on a 2-gold kill still adds up over
  // several kills instead of rounding away.
  earnGold(base) {
    this.goldFraction += base * this.semangatMultiplier('gold');
    const paid = Math.floor(this.goldFraction + 1e-9);
    this.goldFraction -= paid;
    this.gold += paid;
    return paid;
  }

  // Move on to the next wave after a clear.
  advanceWave() {
    this.wave++;
    this.bestWave = Math.max(this.bestWave, this.wave);
  }

  waveClearAngPow(wave = this.wave) {
    const milestone = wave % ECONOMY.angPowMilestoneEvery === 0 ? ECONOMY.angPowPerMilestone : 0;
    return ECONOMY.angPowPerWave + milestone;
  }

  // Ang Pow for killing the boss of the current wave; 0 if already paid this wave.
  claimBossAngPow() {
    if (this.lastBossRewardWave >= this.wave) return 0;
    this.lastBossRewardWave = this.wave;
    this.angPow += ECONOMY.angPowPerBoss;
    return ECONOMY.angPowPerBoss;
  }

  // --- Costs ---

  houseHpCost() { return scaledCost(UPGRADES.houseHp, this.houseHpLevel); }
  floorCost() { return this.canBuildFloor ? UPGRADES.floor.costs[this.floors - 1] : null; }
  heroLevelCost(id) { return scaledCost(UPGRADES.heroLevel, this.heroLevel(id) - 1); }

  // --- Purchases (return true on success) ---

  spend(cost) {
    if (cost == null || this.gold < cost) return false;
    this.gold -= cost;
    return true;
  }

  buyHouseHp() {
    if (!this.spend(this.houseHpCost())) return false;
    this.houseHpLevel++;
    return true;
  }

  buildFloor() {
    if (!this.spend(this.floorCost())) return false;
    this.floors++;
    return true;
  }

  // --- Packs ---

  get packCost() {
    return Math.max(1, PACKS.cost - this.semangatLevel('packDiscount') * SEMANGAT_SHOP.packDiscount.perLevel);
  }

  get canOpenPack() { return this.angPow >= this.packCost; }

  // Rarity weights limited to rarities that have heroes, so rates stay valid
  // if a tier is empty (e.g. Legendary before its heroes exist).
  static packRates() {
    const present = new Set(Object.values(HEROES).map((h) => h.rarity));
    const entries = Object.entries(PACKS.rates).filter(([r]) => present.has(r));
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    return entries.map(([rarity, w]) => ({ rarity, chance: w / total }));
  }

  // Packs left until the pity guarantee: a Legendary is certain on this pack
  // number at the latest (1 = the next pack).
  get packsUntilPity() { return PACKS.legendaryPity - this.packsSinceLegendary; }

  static rollHero(random = Math.random, forceRarity = null) {
    let roll = random();
    const rates = Progress.packRates();
    let rarity = forceRarity ?? rates[rates.length - 1].rarity;
    if (!forceRarity) {
      for (const r of rates) {
        if (roll < r.chance) { rarity = r.rarity; break; }
        roll -= r.chance;
      }
    }
    const pool = Object.keys(HEROES).filter((id) => HEROES[id].rarity === rarity);
    return pool[Math.floor(random() * pool.length)];
  }

  // Spend Ang Pow and pull one hero. Returns what happened, or null if unaffordable.
  openPack(random = Math.random) {
    if (!this.canOpenPack) return null;
    this.angPow -= this.packCost;
    const pity = this.packsUntilPity <= 1;
    const id = Progress.rollHero(random, pity ? 'legendary' : null);
    if (HEROES[id].rarity === 'legendary') this.packsSinceLegendary = 0;
    else this.packsSinceLegendary++;

    if (!this.owned.includes(id)) {
      this.owned.push(id);
      // Generous: drop a new hero straight into the first free slot.
      const free = this.slots.slice(0, this.slotCount).indexOf(null);
      if (free !== -1) this.slots[free] = id;
      return { id, pity, isNew: true, stars: 0, refund: 0, slot: free };
    }
    if (this.heroStarCount(id) < PACKS.maxStars) {
      this.heroStars[id] = this.heroStarCount(id) + 1;
      return { id, pity, isNew: false, stars: this.heroStars[id], refund: 0 };
    }
    this.angPow += PACKS.maxStarRefund;
    return { id, pity, isNew: false, stars: PACKS.maxStars, refund: PACKS.maxStarRefund };
  }

  levelHero(id) {
    if (!this.isOwned(id) || !this.spend(this.heroLevelCost(id))) return false;
    this.heroLevels[id] = this.heroLevel(id) + 1;
    return true;
  }

  // --- Semangat shop ---

  semangatLevel(key) { return this.semangatShop[key] ?? 0; }

  // e.g. 1.2 for +20%. (Not used for packDiscount, which is a flat amount.)
  semangatMultiplier(key) {
    return 1 + this.semangatLevel(key) * SEMANGAT_SHOP[key].perLevel;
  }

  // Cost of the next level, or null at max level.
  semangatCost(key) {
    const bonus = SEMANGAT_SHOP[key];
    const level = this.semangatLevel(key);
    if (bonus.maxLevel != null && level >= bonus.maxLevel) return null;
    return scaledCost(bonus, level);
  }

  buySemangat(key) {
    const cost = this.semangatCost(key);
    if (cost == null || this.semangat < cost) return false;
    this.semangat -= cost;
    this.semangatShop[key] = this.semangatLevel(key) + 1;
    return true;
  }

  // --- Prestige: Pindah Kampung ---

  get canPrestige() { return this.wave >= PRESTIGE.unlockWave; }

  // What prestiging right now would grant, based on the wave reached this run.
  get prestigeRewards() {
    const reached = this.wave;
    return {
      semangat: Math.floor(PRESTIGE.semangatBase * (reached / PRESTIGE.unlockWave) ** PRESTIGE.semangatExponent),
      angPow: Math.floor(reached * PRESTIGE.angPowPerWave),
    };
  }

  // Reset the run and pay out. Keeps owned heroes, stars, slot assignments,
  // Ang Pow, pity, Semangat and shop levels, settings. Returns the rewards.
  prestige() {
    if (!this.canPrestige) return null;
    const rewards = this.prestigeRewards;
    const fresh = new Progress();
    this.wave = fresh.wave;
    this.gold = fresh.gold;
    this.houseHpLevel = fresh.houseHpLevel;
    this.floors = fresh.floors;
    this.heroLevels = {};
    this.lastBossRewardWave = 0;   // boss Ang Pow can be earned again next run
    this.semangat += rewards.semangat;
    this.angPow += rewards.angPow;
    this.prestigeCount++;
    return rewards;
  }
}
