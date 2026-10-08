import { ECONOMY, HEROES, HOUSE, PACKS, STARTING_HEROES, UPGRADES } from '../config.js';

const scaledCost = ({ baseCost, costGrowth }, level) => Math.round(baseCost * costGrowth ** level);

// Everything the player has earned. Plain data plus the formulas that read it,
// so saving (step 6) only needs to serialize the fields set in the constructor.
export class Progress {
  constructor() {
    this.wave = 1;
    this.gold = ECONOMY.startingGold;
    this.angPow = ECONOMY.startingAngPow;
    this.lastBossRewardWave = 0;    // stops boss Ang Pow being farmed on retries
    this.houseHpLevel = 0;
    this.floors = HOUSE.startingFloors;
    this.owned = [...STARTING_HEROES];
    this.heroLevels = {};           // missing entry = level 1
    this.heroStars = {};            // missing entry = 0 stars
    // One entry per possible slot (all floors); only the first slotCount are usable.
    this.slots = Array(HOUSE.maxFloors * HOUSE.slotsPerFloor).fill(null);
    this.slots[0] = STARTING_HEROES[0];

    // Dev-only: treat every hero as owned. Not part of saved progress.
    this.devUnlockAll = false;
  }

  // --- Heroes & slots ---

  isOwned(id) { return this.devUnlockAll || this.owned.includes(id); }
  get ownedHeroes() { return Object.keys(HEROES).filter((id) => this.isOwned(id)); }
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

  get houseMaxHp() {
    return HOUSE.baseHp
      + this.houseHpLevel * UPGRADES.houseHp.hpPerLevel
      + (this.floors - 1) * UPGRADES.floor.hpPerFloor;
  }

  get canBuildFloor() { return this.floors < HOUSE.maxFloors; }

  heroDamage(id, level = this.heroLevel(id)) {
    const starBonus = PACKS.starDamageBonus[this.heroStarCount(id)];
    return HEROES[id].damage
      * (1 + (level - 1) * UPGRADES.heroLevel.damagePerLevel)
      * (1 + starBonus);
  }

  waveClearGold(wave = this.wave) {
    return ECONOMY.waveClearBase + (wave - 1) * ECONOMY.waveClearPerWave;
  }

  waveClearAngPow(wave = this.wave) {
    return wave % ECONOMY.angPowMilestoneEvery === 0 ? ECONOMY.angPowPerMilestone : 0;
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

  get canOpenPack() { return this.angPow >= PACKS.cost; }

  // Rarity weights limited to rarities that have heroes, so rates stay valid
  // if a tier is empty (e.g. Legendary before its heroes exist).
  static packRates() {
    const present = new Set(Object.values(HEROES).map((h) => h.rarity));
    const entries = Object.entries(PACKS.rates).filter(([r]) => present.has(r));
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    return entries.map(([rarity, w]) => ({ rarity, chance: w / total }));
  }

  static rollHero(random = Math.random) {
    let roll = random();
    const rates = Progress.packRates();
    let rarity = rates[rates.length - 1].rarity;
    for (const r of rates) {
      if (roll < r.chance) { rarity = r.rarity; break; }
      roll -= r.chance;
    }
    const pool = Object.keys(HEROES).filter((id) => HEROES[id].rarity === rarity);
    return pool[Math.floor(random() * pool.length)];
  }

  // Spend Ang Pow and pull one hero. Returns what happened, or null if unaffordable.
  openPack(random = Math.random) {
    if (!this.canOpenPack) return null;
    this.angPow -= PACKS.cost;
    const id = Progress.rollHero(random);

    if (!this.owned.includes(id)) {
      this.owned.push(id);
      // Generous: drop a new hero straight into the first free slot.
      const free = this.slots.slice(0, this.slotCount).indexOf(null);
      if (free !== -1) this.slots[free] = id;
      return { id, isNew: true, stars: 0, refund: 0, slot: free };
    }
    if (this.heroStarCount(id) < PACKS.maxStars) {
      this.heroStars[id] = this.heroStarCount(id) + 1;
      return { id, isNew: false, stars: this.heroStars[id], refund: 0 };
    }
    this.angPow += PACKS.maxStarRefund;
    return { id, isNew: false, stars: PACKS.maxStars, refund: PACKS.maxStarRefund };
  }

  levelHero(id) {
    if (!this.isOwned(id) || !this.spend(this.heroLevelCost(id))) return false;
    this.heroLevels[id] = this.heroLevel(id) + 1;
    return true;
  }
}
