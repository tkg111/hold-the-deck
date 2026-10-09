import {
  ABILITY_SCALING, ECONOMY, ENEMIES, HEROES, ISLANDS, SHIP, PACKS, RARITY, STARTING_HEROES, UPGRADES, WANTED,
  WAVES,
} from '../config.js';
import { waveScaling } from './WaveManager.js';

const islandDef = (id) => ISLANDS.find((i) => i.id === id);
// A fresh island's record: its wave counter, best wave cleared, whether its
// finale is beaten, and the last boss wave whose Pearls were paid.
const newIsland = () => ({ wave: 1, best: 0, cleared: false, bossPaid: 0 });

const scaledCost = ({ baseCost, costGrowth }, level) => Math.round(baseCost * costGrowth ** level);

// Everything the player has earned. Plain data plus the formulas that read it.
// toSave() / fromSave() convert to and from the stored form (see Save.js).
export class Progress {
  constructor() {
    // Islands (ISLANDS ids): the one the ship is at, and each visited one's
    // record (see newIsland). wave / lastBossRewardWave read the current one's.
    this.islandId = ISLANDS[0].id;
    this.islands = { [this.islandId]: newIsland() };
    this.mapSeen = false;           // the world map opened since it unlocked
    this.gold = ECONOMY.startingGold;
    this.pearls = ECONOMY.startingPearls;
    this.packsSinceLegendary = 0;   // pity counter
    this.freeLegendaryChests = 0;   // finale rewards waiting in the chest screen
    this.hullHpLevel = 0;
    this.decks = SHIP.startingDecks;
    this.owned = [...STARTING_HEROES];
    this.heroLevels = {};           // missing entry = level 1
    this.heroStars = {};            // missing entry = 0 stars
    this.heroBonus = {};            // Bonus Levels (duplicates past max stars); missing = 0
    // One entry per possible slot (all decks); only the first slotCount are usable.
    this.slots = Array(SHIP.maxDecks * SHIP.slotsPerDeck).fill(null);
    this.slots[0] = STARTING_HEROES[0];

    // Wanted Board, by ENEMIES key: types met so far (posters unlocked),
    // posters opened since, defeats, and bounty tiers paid (0-3).
    this.discovered = [];
    this.seenPosters = [];
    this.defeats = {};
    this.bounties = {};

    this.muted = false;             // sound effects off
    this.autoAbilities = false;     // ability bar's Auto toggle

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
      island: this.islandId,
      islands: Object.fromEntries(Object.entries(this.islands).map(([id, r]) => [id, { ...r }])),
      mapSeen: this.mapSeen,
      freeLegendaryChests: this.freeLegendaryChests,
      gold: this.gold,
      pearls: this.pearls,
      hullHpLevel: this.hullHpLevel,
      decks: this.decks,
      owned,
      heroLevels: ownedOnly(this.heroLevels),
      heroStars: ownedOnly(this.heroStars),
      heroBonus: ownedOnly(this.heroBonus),
      slots: this.slots.map((id) => (id && owned.includes(id) ? id : null)),
      muted: this.muted,
      autoAbilities: this.autoAbilities,
      packsSinceLegendary: this.packsSinceLegendary,
      discovered: [...this.discovered],
      seenPosters: [...this.seenPosters],
      defeats: { ...this.defeats },
      bounties: { ...this.bounties },
    };
  }

  // Build from saved data, clamping anything out of range or unknown so a
  // hand-edited or partially broken save can't crash the game.
  static fromSave(data) {
    const p = new Progress();
    const int = (v, min, max = Infinity, fallback = min) =>
      (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.floor(v))) : fallback);

    p.islands = {};
    for (const def of ISLANDS) {
      const r = data.islands?.[def.id];
      if (!r || typeof r !== 'object') continue;
      p.islands[def.id] = {
        wave: int(r.wave, 1),
        best: int(r.best, 0),
        cleared: r.cleared === true,
        bossPaid: int(r.bossPaid, 0),
      };
    }
    p.islands[ISLANDS[0].id] ??= newIsland();
    p.islandId = islandDef(data.island) && p.isIslandUnlocked(data.island) ? data.island : ISLANDS[0].id;
    p.islands[p.islandId] ??= newIsland();
    p.mapSeen = data.mapSeen === true;
    p.freeLegendaryChests = int(data.freeLegendaryChests, 0);
    p.gold = int(data.gold, 0);
    p.pearls = int(data.pearls, 0, Infinity, p.pearls);
    p.hullHpLevel = int(data.hullHpLevel, 0);
    p.decks = int(data.decks, SHIP.startingDecks, SHIP.maxDecks);
    p.muted = data.muted === true;
    p.autoAbilities = data.autoAbilities === true;
    p.packsSinceLegendary = int(data.packsSinceLegendary, 0, PACKS.legendaryPity - 1);

    const owned = Array.isArray(data.owned) ? data.owned.filter((id) => id in HEROES) : [];
    p.owned = [...new Set([...STARTING_HEROES, ...owned])];

    for (const id of p.owned) {
      if (data.heroLevels?.[id] != null) p.heroLevels[id] = int(data.heroLevels[id], 1);
      if (data.heroStars?.[id] != null) p.heroStars[id] = int(data.heroStars[id], 0, PACKS.maxStars);
      if (data.heroBonus?.[id] != null) p.heroBonus[id] = int(data.heroBonus[id], 0);
    }

    const enemyIds = (list) => (Array.isArray(list) ? [...new Set(list.filter((id) => id in ENEMIES))] : []);
    p.discovered = enemyIds(data.discovered);
    p.seenPosters = enemyIds(data.seenPosters).filter((id) => p.discovered.includes(id));
    for (const id of Object.keys(ENEMIES)) {
      if (data.defeats?.[id] != null) p.defeats[id] = int(data.defeats[id], 0);
      if (data.bounties?.[id] != null) p.bounties[id] = int(data.bounties[id], 0, WANTED.bounties.length);
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

  // --- Islands ---

  // The current island's record and its ISLANDS entry.
  get record() { return this.islands[this.islandId]; }
  get island() { return islandDef(this.islandId); }
  islandRecord(id) { return this.islands[id] ?? null; }

  get wave() { return this.record.wave; }
  set wave(n) { this.record.wave = n; }
  // Stops boss Pearls being farmed on retries (per island).
  get lastBossRewardWave() { return this.record.bossPaid; }
  set lastBossRewardWave(n) { this.record.bossPaid = n; }

  // The wave whose scaling (HP, damage, gold, Elites) this one uses: later
  // islands start harder.
  get scalingWave() { return this.wave + this.island.waveOffset; }

  // Whether the next wave is the current island's finale (not yet beaten).
  get isFinaleWave() {
    const { finale } = this.island;
    return !!finale && !this.record.cleared && this.wave === finale.wave;
  }

  // What WaveManager needs to build the current wave.
  get waveOptions() {
    return {
      offset: this.island.waveOffset,
      finale: this.isFinaleWave ? this.island.finale : null,
      countFactor: this.endlessGrace,
    };
  }

  // Endless grace: the first waves past a beaten finale bring fewer enemies
  // (WAVES.endlessGraceStart x on the first, rising to the full count), so
  // Endless doesn't open with a spike. 1 otherwise.
  get endlessGrace() {
    const { finale } = this.island;
    if (!finale || !this.record.cleared) return 1;
    const k = this.wave - finale.wave;   // 1 = the first wave after the finale
    const n = WAVES.endlessGraceWaves;
    if (k < 1 || k > n) return 1;
    return WAVES.endlessGraceStart + (1 - WAVES.endlessGraceStart) * (k - 1) / n;
  }

  isIslandCleared(id) { return !!this.islands[id]?.cleared; }

  // The first island is always open; each later one once the one before is
  // cleared, if it's available yet.
  isIslandUnlocked(id) {
    const i = ISLANDS.findIndex((d) => d.id === id);
    if (i <= 0) return i === 0;
    return ISLANDS[i].available && this.isIslandCleared(ISLANDS[i - 1].id);
  }

  // The world map opens once any island is cleared.
  get mapUnlocked() { return ISLANDS.some((d) => this.isIslandCleared(d.id)); }

  // Sail to an unlocked island; its wave counter carries on where it was.
  sailTo(id) {
    if (!this.isIslandUnlocked(id)) return false;
    this.islandId = id;
    this.islands[id] ??= newIsland();
    return true;
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
  heroBonusLevels(id) { return this.heroBonus[id] ?? 0; }
  get slotCount() { return this.decks * SHIP.slotsPerDeck; }

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

  get hullMaxHp() { return this.hullMaxHpAt(this.hullHpLevel); }

  hullMaxHpAt(hpLevel) {
    return Math.round(SHIP.baseHp * UPGRADES.hullHp.hpGrowth ** hpLevel)
      + (this.decks - 1) * UPGRADES.deck.hpPerDeck;
  }

  get canBuildDeck() { return this.decks < SHIP.maxDecks; }

  heroDamage(id, level = this.heroLevel(id)) {
    const starBonus = PACKS.starDamageBonus[this.heroStarCount(id)];
    return HEROES[id].damage
      * (1 + (level - 1) * UPGRADES.heroLevel.damagePerLevel)
      * (1 + starBonus)
      * (1 + this.heroBonusLevels(id) * PACKS.bonusLevelDamage);
  }

  // A hero's own attack speed multiplier from its level (the Cabin Boy's
  // levelSpeed); 1 for everyone else.
  heroAttackSpeed(id, level = this.heroLevel(id)) {
    const { levelSpeed } = HEROES[id];
    return levelSpeed ? 1 + Math.min(levelSpeed.max, (level - 1) * levelSpeed.perLevel) : 1;
  }

  // Damage bonus an aura hero (The Captain) gives his deck, e.g. 0.4 = +40%.
  heroAuraBonus(id, level = this.heroLevel(id)) {
    const { aura } = HEROES[id];
    return Math.min(aura.maxDamageBonus, aura.damageBonus
      + (level - 1) * aura.damageBonusPerLevel
      + this.heroStarCount(id) * aura.damageBonusPerStar);
  }

  // Multiplier for a hero's ability durations (and stun), from level and stars.
  abilityScale(id) {
    const { perLevel, perStar, maxScale } = ABILITY_SCALING;
    return Math.min(maxScale, 1 + (this.heroLevel(id) - 1) * perLevel + this.heroStarCount(id) * perStar);
  }

  // Buffs for each active hero: slot -> { damage, attackSpeed } multipliers,
  // from aura heroes (an aura hero buffs the others on its deck, not itself;
  // buffed: has one) and from the hero's own level speed.
  get deckBuffs() {
    const buffs = {};
    const deckOf = (slot) => Math.floor(slot / SHIP.slotsPerDeck);
    const active = this.activeHeroes;
    for (const { id, slot } of active) buffs[slot] = { damage: 1, attackSpeed: this.heroAttackSpeed(id), buffed: false };
    for (const src of active) {
      const { aura } = HEROES[src.id];
      if (!aura) continue;
      for (const { slot } of active) {
        if (slot === src.slot || deckOf(slot) !== deckOf(src.slot)) continue;
        buffs[slot].damage *= 1 + this.heroAuraBonus(src.id);
        buffs[slot].attackSpeed *= 1 + aura.attackSpeedBonus;
        buffs[slot].buffed = true;
      }
    }
    return buffs;
  }

  waveClearGold(wave = this.scalingWave) {
    return Math.round((ECONOMY.waveClearBase + (wave - 1) * ECONOMY.waveClearPerWave) * waveScaling(wave).gold);
  }

  // Add gold; returns the amount paid.
  earnGold(amount) {
    this.gold += amount;
    return amount;
  }

  // Move on to the next wave after a clear.
  advanceWave() {
    this.record.best = Math.max(this.record.best, this.wave);
    this.wave++;
  }

  // The current wave was won: pays its gold and Pearls (and, for a finale,
  // the island's reward: Pearls and free Legendary chests, and the island is
  // cleared), then moves on. Returns { gold, pearls, finale } (finale: the
  // beaten finale's config, or null).
  winWave() {
    const finale = this.isFinaleWave ? this.island.finale : null;
    const gold = this.earnGold(this.waveClearGold());
    let pearls = this.waveClearPearls();
    if (finale) {
      pearls += finale.pearls;
      this.freeLegendaryChests += finale.legendaryChests;
      this.record.cleared = true;
    }
    this.pearls += pearls;
    this.advanceWave();
    // A save from before islands that had sailed past the finale wave
    // (see Save.js) picks up where it was.
    if (finale) this.wave = Math.max(this.wave, this.record.best + 1);
    return { gold, pearls, finale };
  }

  waveClearPearls(wave = this.wave) {
    const milestone = wave % ECONOMY.pearlsMilestoneEvery === 0 ? ECONOMY.pearlsPerMilestone : 0;
    return ECONOMY.pearlsPerWave + milestone;
  }

  // Pearls for killing the boss of the current wave; 0 if already paid this wave.
  claimBossPearls() {
    if (this.lastBossRewardWave >= this.wave) return 0;
    this.lastBossRewardWave = this.wave;
    this.pearls += ECONOMY.pearlsPerBoss;
    return ECONOMY.pearlsPerBoss;
  }

  // --- Wanted Board ---

  isDiscovered(id) { return this.discovered.includes(id); }

  // First sighting of an enemy type: unlocks its poster (unseen until
  // opened). Returns whether it was new.
  discover(id) {
    if (!id || this.isDiscovered(id)) return false;
    this.discovered.push(id);
    return true;
  }

  isPosterSeen(id) { return this.seenPosters.includes(id); }
  get hasUnseenPoster() { return this.discovered.some((id) => !this.isPosterSeen(id)); }
  markPosterSeen(id) {
    if (this.isDiscovered(id) && !this.isPosterSeen(id)) this.seenPosters.push(id);
  }

  defeatCount(id) { return this.defeats[id] ?? 0; }
  // Bounty tiers already paid for this type (0 = none).
  bountyTier(id) { return this.bounties[id] ?? 0; }

  // One more of this type defeated. Pays (in Pearls) any bounty tier it
  // reaches; returns the tiers paid, [{ tier, defeats, pearls }].
  recordDefeat(id) {
    if (!id) return [];
    this.defeats[id] = this.defeatCount(id) + 1;
    const paid = [];
    while (this.bountyTier(id) < WANTED.bounties.length) {
      const bounty = WANTED.bounties[this.bountyTier(id)];
      if (this.defeats[id] < bounty.defeats) break;
      this.bounties[id] = this.bountyTier(id) + 1;
      this.pearls += bounty.pearls;
      paid.push(bounty);
    }
    return paid;
  }

  // --- Costs ---

  hullHpCost() { return scaledCost(UPGRADES.hullHp, this.hullHpLevel); }
  deckCost() { return this.canBuildDeck ? UPGRADES.deck.costs[this.decks - 1] : null; }
  heroLevelCost(id) { return scaledCost(UPGRADES.heroLevel, this.heroLevel(id) - 1); }

  // --- Purchases (return true on success) ---

  spend(cost) {
    if (cost == null || this.gold < cost) return false;
    this.gold -= cost;
    return true;
  }

  buyHullHp() {
    if (!this.spend(this.hullHpCost())) return false;
    this.hullHpLevel++;
    return true;
  }

  buildDeck() {
    if (!this.spend(this.deckCost())) return false;
    this.decks++;
    return true;
  }

  // --- Packs ---

  get packCost() { return PACKS.cost; }

  get canOpenPack() { return this.freeLegendaryChests > 0 || this.pearls >= this.packCost; }
  // "Buy 10" (Pearls only; free chests open one at a time).
  get canOpenBulk() { return this.pearls >= PACKS.bulkCost; }

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

  // Pull one hero: a free Legendary chest first if one is waiting, else
  // spend Pearls. Returns what happened, or null if unaffordable.
  openPack(random = Math.random) {
    if (!this.canOpenPack) return null;
    const freeChest = this.freeLegendaryChests > 0;
    if (freeChest) this.freeLegendaryChests--;
    else this.pearls -= this.packCost;
    return this.pull(random, freeChest);
  }

  // "Buy 10": PACKS.bulkCount paid chests for PACKS.bulkCost Pearls. Returns
  // the pulls in order (see pull), or null if unaffordable.
  openBulk(random = Math.random) {
    if (!this.canOpenBulk) return null;
    this.pearls -= PACKS.bulkCost;
    return Array.from({ length: PACKS.bulkCount }, () => this.pull(random, false));
  }

  // One chest's hero: a Legendary from a free chest or at pity, else rolled.
  // A new hero joins the crew, a duplicate adds a star, and one past max
  // stars adds a Bonus Level. Returns { id, pity, isNew, stars, bonus,
  // bonusLevel, slot }.
  pull(random, freeChest) {
    const pity = !freeChest && this.packsUntilPity <= 1;
    const id = Progress.rollHero(random, freeChest || pity ? 'legendary' : null);
    if (HEROES[id].rarity === 'legendary') this.packsSinceLegendary = 0;
    else this.packsSinceLegendary++;

    if (!this.owned.includes(id)) {
      this.owned.push(id);
      // Generous: drop a new hero straight into the first free slot.
      const free = this.slots.slice(0, this.slotCount).indexOf(null);
      if (free !== -1) this.slots[free] = id;
      return { id, pity, isNew: true, stars: 0, bonus: 0, slot: free };
    }
    if (this.heroStarCount(id) < PACKS.maxStars) {
      this.heroStars[id] = this.heroStarCount(id) + 1;
      return { id, pity, isNew: false, stars: this.heroStars[id], bonus: this.heroBonusLevels(id) };
    }
    this.heroBonus[id] = this.heroBonusLevels(id) + 1;
    return { id, pity, isNew: false, stars: PACKS.maxStars, bonus: this.heroBonus[id], bonusLevel: true };
  }

  levelHero(id) {
    if (!this.isOwned(id) || !this.spend(this.heroLevelCost(id))) return false;
    this.heroLevels[id] = this.heroLevel(id) + 1;
    return true;
  }
}
