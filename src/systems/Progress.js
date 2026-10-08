import { ECONOMY, HEROES, HOUSE, UPGRADES } from '../config.js';

const scaledCost = ({ baseCost, costGrowth }, level) => Math.round(baseCost * costGrowth ** level);

// Everything the player has earned. Plain data plus the formulas that read it,
// so saving (step 6) only needs to serialize the fields set in the constructor.
export class Progress {
  constructor() {
    this.wave = 1;
    this.gold = ECONOMY.startingGold;
    this.houseHpLevel = 0;
    this.floors = HOUSE.startingFloors;
    this.heroLevels = { budakLastik: 1 };
  }

  // --- Derived stats ---

  get houseMaxHp() {
    return HOUSE.baseHp
      + this.houseHpLevel * UPGRADES.houseHp.hpPerLevel
      + (this.floors - 1) * UPGRADES.floor.hpPerFloor;
  }

  get canBuildFloor() { return this.floors < HOUSE.maxFloors; }

  heroDamage(id, level = this.heroLevels[id]) {
    return HEROES[id].damage * (1 + (level - 1) * UPGRADES.heroLevel.damagePerLevel);
  }

  waveClearGold(wave = this.wave) {
    return ECONOMY.waveClearBase + (wave - 1) * ECONOMY.waveClearPerWave;
  }

  // --- Costs ---

  houseHpCost() { return scaledCost(UPGRADES.houseHp, this.houseHpLevel); }
  floorCost() { return this.canBuildFloor ? UPGRADES.floor.costs[this.floors - 1] : null; }
  heroLevelCost(id) { return scaledCost(UPGRADES.heroLevel, this.heroLevels[id] - 1); }

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

  levelHero(id) {
    if (!this.spend(this.heroLevelCost(id))) return false;
    this.heroLevels[id]++;
    return true;
  }
}
