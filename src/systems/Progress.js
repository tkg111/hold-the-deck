import {
  ABILITY_SCALING, ABYSS, AUDIO, AWAKEN, BATTLE_LOG, ECONOMY, ENEMIES, EXPEDITIONS, FISHING, HEROES, HUNTS, ISLANDS, MEALS, PARTS, SHIP,
  PACKS, RARITY, STARTING_HEROES, UI_KIT, UNCHARTED, UPGRADES, WANTED, WAVES,
} from '../config.js';
import { clearBonus, enemyFirstWave, islandContent } from './WaveManager.js';
import {
  checkpoints, depthClearBonus, depthGold, depthOptions, milestoneOf, newSeed,
} from './Abyss.js';
import { totalDamage } from './BattleStats.js';
import { entryFromSave, maxSlots, traitOf } from './Expeditions.js';
import { FISH_DATA, fishOf, mealFish, mealModifiers } from './Fishing.js';
import { sampleIdleRate } from './Offline.js';
import {
  gameParts, materialOf, materialOfBoss, PART_DATA, partCost, partInGame, partOf, partValue,
} from './Parts.js';
import { allPacks, PACK_DATA, packOf } from './Packs.js';
import * as Uncharted from './Uncharted.js';
import { DONE, newTutorialState } from '../tutorial/TutorialManager.js';
import { ONBOARDING } from '../tutorial/steps.js';
import { newOnlineRecord, onlineFromSave, onlineToSave } from '../online/record.js';

// A guard on MAX buys (costs grow far faster than this matters).
const MAX_BULK = 10000;

const islandDef = (id) => ISLANDS.find((i) => i.id === id);
// A fresh island's record: its wave counter, best wave cleared, whether its
// finale is beaten, the last boss wave whose Pearls were paid, and each
// boss's last wave whose material was paid.
const newIsland = () => ({
  wave: 1, best: 0, cleared: false, bossPaid: 0, dropsPaid: {},
});

const scaledCost = ({ baseCost, costGrowth }, level) => Math.round(baseCost * costGrowth ** level);

// Today in local time ("2026-10-13"): Boss Hunts' daily doubles reset at
// midnight.
export function localDay(now = Date.now()) {
  const d = new Date(now);
  const two = (n) => `${n}`.padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

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
    this.packsSinceLegendary = 0;   // pity counter (across every pack)
    // Packs (packs.json ids): the one the chest screen opens on, those looked
    // at there since they unlocked, and those whose "NEW PACK" banner has
    // shown.
    this.lastPack = null;
    this.packsSeen = [];
    this.packsAnnounced = [];
    this.freeLegendaryChests = 0;   // finale rewards waiting in the chest screen
    // Free chests from expeditions waiting there, by tier (Legendary ones
    // join freeLegendaryChests).
    this.freeChests = { common: 0, rare: 0 };
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

    // Captain's Log: the last BATTLE_LOG.keep waves' records (BattleStats),
    // oldest first.
    this.battleLog = [];

    // Expeditions (see Expeditions.js): one entry or null per slot, and the
    // last waves' gold and battle time ({ gold, ms }), oldest first, which
    // their gold is based on.
    this.expeditions = [];
    this.goldLog = [];

    // Ship parts (see Parts.js): boss materials held, by material id; parts
    // owned, by part id -> level (1-5); the part on each slot (parts.json's
    // slots; missing = empty, the stock look).
    this.materials = {};
    this.parts = {};
    this.equipped = {};
    // Boss Hunts, by boss (ENEMIES key): hunt level (missing = 1), and
    // today's wins over each (huntDay: the local day they count for).
    this.huntLevels = {};
    this.huntDay = '';
    this.huntWins = {};
    // The Abyss (see Abyss.js): the deepest depth reached, depths whose
    // first-clear milestone was paid, dives started, whether the map has
    // revealed it, and the dive under way (null between dives): its seed,
    // the depth it's at (a reload resumes at its start), the depth it
    // started from, and its totals for the end-of-run screen (gold,
    // materials by id, damage by crewmate) and the bosses whose material
    // this depth already paid.
    this.abyss = newAbyss();
    // The Uncharted Seas (see Uncharted.js): Grog and when the next one
    // started coming back, Sea Glass and Hearts of the Deep held, each
    // stage's best crown, the first clears paid, and whether its map spot
    // has been seen. The stage under way (not saved; a reload ends it):
    // { id, crown, cost, slotsBefore (the ship's crew before the Muster) }.
    this.uncharted = Uncharted.newRecord();
    this.stage = null;
    // Crew Awakening: the awakened crew (HEROES ids).
    this.awakened = [];

    // The Galley (see Fishing.js; Merchants.js for plunder): fish held, by
    // fishing.json id; Spice; Bait, and the time the next one started
    // coming back (Date.now() ms; see tickBait); meals cooked (the Pantry,
    // by meal id); the active meal ({ id, wavesLeft } or null); every fish
    // ever caught (the Fish Log, by id); and totals for the Captain's Log.
    this.fish = {};
    this.spice = 0;
    this.bait = FISHING.bait.cap;
    this.baitAt = Date.now();
    this.pantry = {};
    this.meal = null;
    this.fishLog = {};
    this.merchantsPlundered = 0;
    this.fishCaught = 0;

    // While you were away (see Offline.js): gold per second of battle (a
    // moving average, sampled at each wave cleared), when the game was last
    // open (Date.now() ms; written on every save), and the gold it has paid
    // for time away (the Captain's Log).
    this.idleRate = 0;
    this.lastSeen = Date.now();
    this.goldAway = 0;

    // Rankings (see src/online/record.js): joined or not, the captain's
    // name and crew code, the best depth the server holds, and the boards
    // last fetched.
    this.online = newOnlineRecord();

    this.muted = false;             // music and sound effects off
    // The Settings' volume sliders (0-100); muting keeps them.
    this.musicVolume = AUDIO.defaults.music;
    this.sfxVolume = AUDIO.defaults.sfx;
    this.vibration = true;          // the Android app's haptics (Settings)
    this.largeText = false;         // Settings' Text size: Large (the Captain's words, tooltips)
    this.autoAbilities = false;     // ability bar's Auto toggle
    // The Shipwright: how many levels a buy button buys (UI_KIT.buyAmounts:
    // '1', '10' or 'max'), and whether the panel is out (or slid away).
    this.buyAmount = UI_KIT.buyAmounts[0];
    this.shipwrightOpen = true;
    // The Captain's tutorial (see TutorialManager): the onboarding step it
    // waits on (or 'done'), the tips already shown, and Captain's tips on.
    this.tutorial = newTutorialState();

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
      islands: Object.fromEntries(Object.entries(this.islands).map(([id, r]) => [id, { ...r, dropsPaid: { ...r.dropsPaid } }])),
      mapSeen: this.mapSeen,
      freeLegendaryChests: this.freeLegendaryChests,
      freeChests: { ...this.freeChests },
      gold: this.gold,
      pearls: this.pearls,
      hullHpLevel: this.hullHpLevel,
      decks: this.decks,
      owned,
      heroLevels: ownedOnly(this.heroLevels),
      heroStars: ownedOnly(this.heroStars),
      heroBonus: ownedOnly(this.heroBonus),
      // During a stage's Muster, the crew as it was before it.
      slots: (this.stage?.slotsBefore ?? this.slots).map((id) => (id && owned.includes(id) ? id : null)),
      muted: this.muted,
      musicVolume: this.musicVolume,
      sfxVolume: this.sfxVolume,
      vibration: this.vibration,
      largeText: this.largeText,
      autoAbilities: this.autoAbilities,
      buyAmount: this.buyAmount,
      shipwrightOpen: this.shipwrightOpen,
      tutorial: { ...this.tutorial, tipsSeen: [...this.tutorial.tipsSeen] },
      packsSinceLegendary: this.packsSinceLegendary,
      lastPack: this.lastPack,
      packsSeen: [...this.packsSeen],
      packsAnnounced: [...this.packsAnnounced],
      discovered: [...this.discovered],
      seenPosters: [...this.seenPosters],
      defeats: { ...this.defeats },
      bounties: { ...this.bounties },
      battleLog: this.battleLog,
      expeditions: this.expeditions.map((e) => (e ? { ...e, party: [...e.party], from: { ...e.from } } : null)),
      goldLog: this.goldLog.map((w) => ({ ...w })),
      materials: { ...this.materials },
      parts: { ...this.parts },
      equipped: { ...this.equipped },
      huntLevels: { ...this.huntLevels },
      huntDay: this.huntDay,
      huntWins: { ...this.huntWins },
      abyss: {
        ...this.abyss,
        milestones: [...this.abyss.milestones],
        run: this.abyss.run && {
          ...this.abyss.run,
          materials: { ...this.abyss.run.materials },
          damage: { ...this.abyss.run.damage },
          dropsPaid: [...this.abyss.run.dropsPaid],
        },
      },
      fish: { ...this.fish },
      spice: this.spice,
      bait: this.bait,
      baitAt: this.baitAt,
      pantry: { ...this.pantry },
      meal: this.meal && { ...this.meal },
      fishLog: { ...this.fishLog },
      merchantsPlundered: this.merchantsPlundered,
      fishCaught: this.fishCaught,
      idleRate: this.idleRate,
      lastSeen: this.lastSeen,
      goldAway: this.goldAway,
      online: onlineToSave(this.online),
      uncharted: {
        ...this.uncharted,
        items: { ...this.uncharted.items },
        crowns: { ...this.uncharted.crowns },
        firstClears: [...this.uncharted.firstClears],
      },
      awakened: this.awakened.filter((id) => owned.includes(id)),
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
        dropsPaid: Object.fromEntries(Object.entries(r.dropsPaid ?? {})
          .filter(([boss]) => ENEMIES[boss]?.boss).map(([boss, wave]) => [boss, int(wave, 0)])),
      };
    }
    p.islands[ISLANDS[0].id] ??= newIsland();
    p.islandId = islandDef(data.island) && p.canSailTo(data.island) ? data.island : ISLANDS[0].id;
    p.islands[p.islandId] ??= newIsland();
    p.mapSeen = data.mapSeen === true;
    p.freeLegendaryChests = int(data.freeLegendaryChests, 0);
    for (const tier of Object.keys(p.freeChests)) p.freeChests[tier] = int(data.freeChests?.[tier], 0);
    p.gold = int(data.gold, 0);
    p.pearls = int(data.pearls, 0, Infinity, p.pearls);
    p.hullHpLevel = int(data.hullHpLevel, 0);
    p.decks = int(data.decks, SHIP.startingDecks, SHIP.maxDecks);
    p.muted = data.muted === true;
    p.musicVolume = int(data.musicVolume, 0, 100, AUDIO.defaults.music);
    p.sfxVolume = int(data.sfxVolume, 0, 100, AUDIO.defaults.sfx);
    p.vibration = data.vibration !== false;
    p.largeText = data.largeText === true;
    p.autoAbilities = data.autoAbilities === true;
    if (UI_KIT.buyAmounts.includes(data.buyAmount)) p.buyAmount = data.buyAmount;
    p.shipwrightOpen = data.shipwrightOpen !== false;
    const t = data.tutorial;
    if (t && typeof t === 'object') {
      const step = t.onboarding === DONE || ONBOARDING.some((s) => s.id === t.onboarding) ? t.onboarding : DONE;
      const seen = Array.isArray(t.tipsSeen) ? [...new Set(t.tipsSeen.filter((id) => typeof id === 'string'))] : [];
      p.tutorial = { onboarding: step, tipsSeen: seen, tipsOn: t.tipsOn !== false };
    }
    p.packsSinceLegendary = int(data.packsSinceLegendary, 0, PACKS.legendaryPity - 1);
    // Before packs.json is loaded (it always is in the game) any id is kept.
    const knownPack = (id) => typeof id === 'string' && (PACK_DATA.loaded ? !!packOf(id) : true);
    p.lastPack = knownPack(data.lastPack) ? data.lastPack : null;
    const packIds = (list) => (Array.isArray(list) ? [...new Set(list.filter(knownPack))] : []);
    p.packsSeen = packIds(data.packsSeen);
    p.packsAnnounced = packIds(data.packsAnnounced);

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

    if (Array.isArray(data.battleLog)) {
      p.battleLog = data.battleLog.slice(-BATTLE_LOG.keep).map((r) => logRecordFromSave(r, int)).filter(Boolean);
    }

    if (Array.isArray(data.goldLog)) {
      p.goldLog = data.goldLog.slice(-EXPEDITIONS.recentWaves)
        .filter((w) => w && typeof w === 'object')
        .map((w) => ({ gold: int(w.gold, 0), ms: int(w.ms, 0) }));
    }
    // Expeditions: crew away on one aren't on the ship.
    const away = new Set();
    if (Array.isArray(data.expeditions)) {
      p.expeditions = data.expeditions.slice(0, maxSlots()).map((r) => {
        const entry = entryFromSave(r, p, away);
        entry?.party.forEach((id) => away.add(id));
        return entry;
      });
    }

    // Ship parts and Boss Hunts. Before parts.json is loaded (it always is
    // in the game) any id is kept as it is.
    const knownMaterial = (id) => (PART_DATA.loaded ? !!materialOf(id) : true);
    const knownPart = (id) => (PART_DATA.loaded ? !!partOf(id) : true);
    for (const [id, n] of Object.entries(data.materials ?? {})) if (knownMaterial(id)) p.materials[id] = int(n, 0);
    for (const [id, level] of Object.entries(data.parts ?? {})) {
      if (knownPart(id) && Number.isFinite(level) && level >= 1) p.parts[id] = int(level, 1, PARTS.maxLevel);
    }
    for (const [slot, id] of Object.entries(data.equipped ?? {})) {
      const fits = PART_DATA.loaded ? partOf(id)?.slot === slot : typeof id === 'string';
      if (fits && p.parts[id]) p.equipped[slot] = id;
    }
    for (const [boss, level] of Object.entries(data.huntLevels ?? {})) {
      if (ENEMIES[boss]?.boss) p.huntLevels[boss] = int(level, 1);
    }
    if (typeof data.huntDay === 'string') p.huntDay = data.huntDay.slice(0, 10);
    for (const [boss, n] of Object.entries(data.huntWins ?? {})) {
      if (ENEMIES[boss]?.boss) p.huntWins[boss] = int(n, 0, HUNTS.dailyDoubles);
    }
    p.abyss = abyssFromSave(data.abyss, int, knownMaterial);

    // The Galley. Before fishing.json is loaded (it always is in the game)
    // any fish id is kept.
    const knownFish = (id) => (FISH_DATA.loaded ? !!fishOf(id) : true);
    const counts = (obj, known) => Object.fromEntries(Object.entries(obj && typeof obj === 'object' ? obj : {})
      .filter(([id, n]) => known(id) && Number.isFinite(n) && n > 0).map(([id, n]) => [id, int(n, 0)]));
    p.fish = counts(data.fish, knownFish);
    p.fishLog = counts(data.fishLog, knownFish);
    p.pantry = counts(data.pantry, (id) => id in MEALS.list);
    p.spice = int(data.spice, 0);
    p.bait = int(data.bait, 0, Infinity, p.bait);
    if (Number.isFinite(data.baitAt)) p.baitAt = data.baitAt;
    const m = data.meal;
    if (m && typeof m === 'object' && m.id in MEALS.list && Number.isFinite(m.wavesLeft) && m.wavesLeft >= 1) {
      p.meal = { id: m.id, wavesLeft: int(m.wavesLeft, 1) };
    }
    p.merchantsPlundered = int(data.merchantsPlundered, 0);
    p.fishCaught = int(data.fishCaught, 0);
    if (Number.isFinite(data.idleRate) && data.idleRate > 0) p.idleRate = data.idleRate;
    if (Number.isFinite(data.lastSeen)) p.lastSeen = data.lastSeen;
    p.goldAway = int(data.goldAway, 0);
    p.online = onlineFromSave(data.online);
    p.uncharted = unchartedFromSave(data.uncharted, int);
    p.awakened = Array.isArray(data.awakened) ? [...new Set(data.awakened.filter((id) => p.owned.includes(id)))] : [];

    if (Array.isArray(data.slots)) {
      const seen = new Set(away);
      p.slots = p.slots.map((_, i) => {
        const id = data.slots[i];
        if (!id || !p.owned.includes(id) || seen.has(id)) return null;
        seen.add(id);
        return id;
      });
    }
    return p;
  }

  // --- Captain's Log ---

  // A finished wave's record (BattleStats.finish); keeps the last few.
  logWave(record) {
    if (!record) return;
    this.battleLog.push(record);
    if (this.battleLog.length > BATTLE_LOG.keep) this.battleLog.splice(0, this.battleLog.length - BATTLE_LOG.keep);
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

  // What WaveManager (and the volcano) need to build the current wave.
  get waveOptions() {
    return {
      island: this.island,
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

  // On the map, the first island is always open and each later one opens
  // once the one before is cleared.
  isIslandUnlocked(id) {
    const i = ISLANDS.findIndex((d) => d.id === id);
    if (i <= 0) return i === 0;
    return this.isIslandCleared(ISLANDS[i - 1].id);
  }

  // Whether the ship can sail there: unlocked, and it has content yet
  // (`available`; the rest are "coming soon").
  canSailTo(id) {
    return this.isIslandUnlocked(id) && !!islandDef(id)?.available;
  }

  // The world map opens once any island is cleared.
  get mapUnlocked() { return ISLANDS.some((d) => this.isIslandCleared(d.id)); }

  // Sail to an unlocked island; its wave counter carries on where it was.
  sailTo(id) {
    if (!this.canSailTo(id)) return false;
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

  // Whether a hero is away on an expedition (and can't go on the ship).
  isAway(id) { return this.expeditions.some((e) => e?.party.includes(id)); }

  // Put a hero (or null) in a slot. A hero already placed elsewhere swaps with
  // whatever is in the target slot. Not one away on an expedition.
  assignHero(slot, id) {
    if (slot < 0 || slot >= this.slotCount) return false;
    if (id && (!this.isOwned(id) || this.isAway(id))) return false;
    const from = id ? this.slots.indexOf(id) : -1;
    if (from !== -1) this.slots[from] = this.slots[slot];
    this.slots[slot] = id;
    return true;
  }

  setDevUnlockAll(on) {
    this.devUnlockAll = on;
    if (!on) this.slots = this.slots.map((id) => (id && this.isOwned(id) ? id : null));
  }

  // Dev-only: sail to an island with content, marking every island before
  // it cleared so it's unlocked (this is saved, like real progress).
  devSailTo(id) {
    const i = ISLANDS.findIndex((d) => d.id === id);
    if (i < 0 || !ISLANDS[i].available) return false;
    for (const before of ISLANDS.slice(0, i)) {
      this.islands[before.id] ??= newIsland();
      this.islands[before.id].cleared = true;
    }
    this.islandId = id;
    this.islands[id] ??= newIsland();
    return true;
  }

  // --- Derived stats ---

  get hullMaxHp() { return this.hullMaxHpAt(this.hullHpLevel); }

  // With the active meal's max hull change.
  hullMaxHpAt(hpLevel) {
    const base = Math.round(SHIP.baseHp * UPGRADES.hullHp.hpGrowth ** hpLevel) + (this.decks - 1) * UPGRADES.deck.hpPerDeck;
    const { hull } = this.mealMods;
    return hull === 1 ? base : Math.round(base * hull);
  }

  get canBuildDeck() { return this.decks < SHIP.maxDecks; }

  // (x AWAKEN.damage once awakened.)
  heroDamage(id, level = this.heroLevel(id)) {
    const starBonus = PACKS.starDamageBonus[this.heroStarCount(id)];
    return HEROES[id].damage
      * (1 + (level - 1) * UPGRADES.heroLevel.damagePerLevel)
      * (1 + starBonus)
      * (1 + this.heroBonusLevels(id) * PACKS.bonusLevelDamage)
      * (this.isAwakened(id) ? AWAKEN.damage : 1);
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
  // buffed: has one) and from the hero's own level speed. aura: the aura's
  // part alone ({ from: the aura hero, damage, speed }), or null.
  get deckBuffs() {
    const buffs = {};
    const deckOf = (slot) => Math.floor(slot / SHIP.slotsPerDeck);
    const active = this.activeHeroes;
    // Ghostweave Sails: the whole crew attacks faster.
    const sails = this.partEffect('ghostweave_sails');
    // The active meal: crew damage, attack speed and damage to bosses.
    const meal = this.mealMods;
    // A stage's Doldrums: the crew attacks slower.
    const doldrums = this.stageHas('doldrums') ? UNCHARTED.rules.doldrums.attackSpeed : 1;
    for (const { id, slot } of active) {
      // The Abyss Tide: crew damage grows through a dive.
      buffs[slot] = {
        damage: this.tideDamage * meal.damage,
        attackSpeed: this.heroAttackSpeed(id) * meal.attackSpeed * doldrums,
        bossDamage: meal.bossDamage,
        buffed: false,
        aura: null,
      };
      if (sails) buffs[slot].attackSpeed *= 1 + partValue(PARTS.effects.ghostweave_sails.attackSpeedAtMax, sails);
    }
    for (const src of active) {
      const { aura } = HEROES[src.id];
      if (!aura) continue;
      for (const { slot } of active) {
        if (slot === src.slot || deckOf(slot) !== deckOf(src.slot)) continue;
        const b = buffs[slot];
        b.damage *= 1 + this.heroAuraBonus(src.id);
        b.attackSpeed *= 1 + aura.attackSpeedBonus;
        b.buffed = true;
        b.aura ??= { from: src.id, damage: 1, speed: 1 };
        b.aura.damage *= 1 + this.heroAuraBonus(src.id);
        b.aura.speed *= 1 + aura.attackSpeedBonus;
      }
    }
    return buffs;
  }

  waveClearGold(wave = this.scalingWave) {
    return clearBonus(wave);
  }

  // A wave was cleared (an island's or a depth, not a Boss Hunt) at this
  // gold per second of battle: the idle rate moves toward it.
  noteIdleRate(goldPerSecond) {
    this.idleRate = sampleIdleRate(this.idleRate, goldPerSecond);
  }

  // Add gold; returns the amount paid.
  earnGold(amount) {
    this.gold += amount;
    return amount;
  }

  // A finished wave's gold (kills and clear bonus) and battle time (game
  // ms), for expedition rewards; keeps the last few.
  logGold(gold, ms) {
    this.goldLog.push({ gold: Math.max(0, Math.round(gold)), ms: Math.max(0, Math.round(ms)) });
    if (this.goldLog.length > EXPEDITIONS.recentWaves) this.goldLog.splice(0, this.goldLog.length - EXPEDITIONS.recentWaves);
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
    const gold = this.earnGold(this.boostGold(this.waveClearGold()));
    let pearls = this.waveClearPearls();
    if (finale) {
      pearls += finale.pearls;
      this.freeLegendaryChests += finale.legendaryChests;
      this.record.cleared = true;
    }
    this.pearls += pearls;
    this.mealWaveDone();
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

  hullHpCost(level = this.hullHpLevel) { return scaledCost(UPGRADES.hullHp, level); }
  // Deck n + 1's cost (n decks built), or null past the last.
  deckCost(decks = this.decks) { return decks < SHIP.maxDecks ? UPGRADES.deck.costs[decks - 1] : null; }
  heroLevelCost(id, level = this.heroLevel(id)) { return scaledCost(UPGRADES.heroLevel, level - 1); }

  // What a Shipwright buy button buys at buyAmount: { count, cost } levels
  // and their total. costAt(k): the k-th next level's cost (0 = the next),
  // null past the upgrade's cap. '10' buys 10 (or up to the cap) only if all
  // of them are affordable; 'max' as many as gold allows. When nothing can
  // be bought, it's the next level alone ({ count: 1 }), for the price tag;
  // count 0 means the upgrade is maxed.
  bulkPlan(costAt, amount = this.buyAmount) {
    let count = 0;
    let cost = 0;
    const want = amount === 'max' ? MAX_BULK : Number(amount);
    while (count < want) {
      const next = costAt(count);
      if (next == null) break;
      if (amount === 'max' && cost + next > this.gold) break;
      cost += next;
      count++;
    }
    if (count === 0 && costAt(0) != null) return { count: 1, cost: costAt(0) };
    return { count, cost };
  }

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

  // --- Ship parts ---

  materialCount(id) { return this.materials[id] ?? 0; }
  addMaterial(id, n) {
    if (!id || n <= 0) return 0;
    this.materials[id] = this.materialCount(id) + n;
    return n;
  }

  partLevel(id) { return this.parts[id] ?? 0; }
  equippedPart(slot) { return this.equipped[slot] ?? null; }
  isEquipped(id) { return !!id && this.equipped[partOf(id)?.slot] === id; }
  // An equipped part's level (0 if it isn't on the ship): what it does in
  // battle.
  partEffect(id) { return this.isEquipped(id) ? this.partLevel(id) : 0; }
  // { partId: level } of everything on the ship.
  get equippedLevels() {
    return Object.fromEntries(Object.values(this.equipped).filter((id) => this.parts[id]).map((id) => [id, this.parts[id]]));
  }

  // Whether the material has ever dropped: its boss has been beaten (or some
  // is held). Until then the Shipyard shows its parts dark.
  hasFoundMaterial(materialId) {
    const m = materialOf(materialId);
    return !!m && (this.materialCount(materialId) > 0 || this.defeatCount(m.bossKey) > 0);
  }

  // What the part's next level costs ({ material, gold }), or null at max.
  partNextCost(id) { return partCost(id, this.partLevel(id) + 1); }
  canAffordPart(id) {
    const cost = this.partNextCost(id);
    return !!cost && partInGame(id) && this.materialCount(partOf(id).material) >= cost.material && this.gold >= cost.gold;
  }
  // Something in the Shipyard can be crafted or upgraded.
  get anyPartAffordable() { return gameParts().some((p) => this.canAffordPart(p.id)); }

  // Craft the part (level 1) or upgrade it. A part crafted for an empty
  // slot goes straight on.
  upgradePart(id) {
    if (!this.canAffordPart(id)) return false;
    const cost = this.partNextCost(id);
    const part = partOf(id);
    this.gold -= cost.gold;
    this.materials[part.material] -= cost.material;
    this.parts[id] = this.partLevel(id) + 1;
    if (this.parts[id] === 1 && !this.equipped[part.slot]) this.equipped[part.slot] = id;
    return true;
  }

  // Put an owned part on its slot (another there comes off), or take it off.
  equipPart(id, on = true) {
    const part = partOf(id);
    if (!part || !this.parts[id]) return false;
    if (on) this.equipped[part.slot] = id;
    else if (this.equipped[part.slot] === id) delete this.equipped[part.slot];
    return true;
  }

  // Gold from kills, wave clears and hunts, with the Blackbones' Lantern
  // and the active meal.
  get goldMult() {
    const lantern = this.partEffect('blackbones_lantern');
    return (lantern ? 1 + lantern * PARTS.effects.blackbones_lantern.goldPerLevel : 1) * this.mealMods.gold;
  }
  boostGold(amount) {
    const mult = this.goldMult;
    return mult === 1 ? amount : Math.round(amount * mult);
  }

  // A boss was beaten in a wave (not a hunt): its material, more the first
  // time that boss is ever beaten (call after recordDefeat); once per boss
  // per wave, so retrying a lost wave doesn't pay it again. Returns
  // { material, count } or null.
  bossDrop(bossKey) {
    const m = materialOfBoss(bossKey);
    const paid = (this.record.dropsPaid ??= {});
    if (!m || paid[bossKey] >= this.wave) return null;
    paid[bossKey] = this.wave;
    const { perKill, firstKill } = PARTS.drops;
    const count = this.defeatCount(bossKey) <= 1 ? firstKill : perKill;
    this.addMaterial(m.id, count);
    return { material: m.id, count };
  }

  // --- Boss Hunts ---

  // An island's bosses that can be hunted (those of its boss waves), each
  // with whether it's open yet (beaten at least once).
  huntableBosses(islandId) {
    const island = ISLANDS.find((d) => d.id === islandId);
    if (!island?.available) return [];
    return islandContent(island).bosses.map((boss) => ({ boss, open: this.defeatCount(boss) > 0 }));
  }
  hasHunts(islandId) { return this.huntableBosses(islandId).some((h) => h.open); }

  huntLevel(boss) { return this.huntLevels[boss] ?? 1; }
  // Double-material wins left today over this boss.
  huntDoublesLeft(boss, now = Date.now()) {
    const wins = this.huntDay === localDay(now) ? this.huntWins[boss] ?? 0 : 0;
    return Math.max(0, HUNTS.dailyDoubles - wins);
  }

  // What a hunt is fought with: waveOptions' shape, plus wave (the boss's
  // first wave on its island) and hunt { boss, level }.
  huntOptions(boss, islandId) {
    const island = ISLANDS.find((d) => d.id === islandId);
    return {
      wave: enemyFirstWave(boss, island),
      island,
      offset: island.waveOffset,
      finale: null,
      countFactor: 1,
      hunt: { boss, level: this.huntLevel(boss) },
    };
  }

  // A hunt's drop at a level: { material, count } (before the daily double).
  huntDrop(boss, level = this.huntLevel(boss)) {
    return { material: materialOfBoss(boss)?.id ?? null, count: HUNTS.dropBase + Math.floor(level / HUNTS.dropEvery) };
  }

  // The gold a hunt win pays.
  huntGold(boss, islandId) {
    const { wave, offset } = this.huntOptions(boss, islandId);
    return this.boostGold(Math.round(HUNTS.gold * clearBonus(wave + offset)));
  }

  // A hunt won: the boss's material (doubled while today's doubles last), a
  // little gold, and its hunt level goes up. Returns { material, count,
  // doubled, gold, level (the one beaten) }.
  winHunt(boss, islandId, now = Date.now()) {
    const level = this.huntLevel(boss);
    const doubled = this.huntDoublesLeft(boss, now) > 0;
    const drop = this.huntDrop(boss, level);
    const count = drop.count * (doubled ? 2 : 1);
    this.addMaterial(drop.material, count);
    const gold = this.earnGold(this.huntGold(boss, islandId));
    const today = localDay(now);
    if (this.huntDay !== today) {
      this.huntDay = today;
      this.huntWins = {};
    }
    this.huntWins[boss] = Math.min(HUNTS.dailyDoubles, (this.huntWins[boss] ?? 0) + 1);
    this.huntLevels[boss] = level + 1;
    this.mealWaveDone();
    return {
      material: drop.material, count, doubled, gold, level,
    };
  }

  // --- The Abyss ---

  // It opens once its island's finale is won.
  get abyssUnlocked() { return this.isIslandCleared(ABYSS.unlockIsland); }
  // A dive is under way (between depths too).
  get inAbyss() { return !!this.abyss.run; }
  get depth() { return this.abyss.run?.depth ?? 0; }
  // The depths a dive can start at (see Abyss.checkpoints).
  get abyssCheckpoints() { return checkpoints(this.abyss.best); }

  // Whether a dive from depth 1 can skip the shallows (ABYSS.skip: the best
  // depth is deep enough), and whether this one will (the saved setting).
  get canSkipShallows() { return this.abyss.best >= ABYSS.skip.minBest; }
  get skipsShallows() { return this.canSkipShallows && this.abyss.skipShallows; }

  // Start a dive at `from` (1 or a checkpoint) with this seed. A checkpoint
  // pays that depth's gold at once. From depth 1 with Skip the shallows on,
  // the first ABYSS.skip.depths depths are cleared at once: their gold and
  // Tide stacks, no fight. Returns the gold paid (0 from depth 1 without a
  // skip), or null if it can't start there.
  startDive(from = 1, seed = newSeed()) {
    if (!this.abyssUnlocked || this.inAbyss || !this.abyssCheckpoints.includes(from)) return null;
    this.abyss.runs++;
    this.abyss.run = {
      seed, depth: from, from, tide: 0, skipped: 0, gold: 0, materials: {}, damage: {}, dropsPaid: [],
    };
    const run = this.abyss.run;
    let gold = 0;
    if (from > 1) {
      gold = this.earnGold(this.boostGold(depthGold(seed, from)));
    } else if (this.skipsShallows) {
      for (let d = 1; d <= ABYSS.skip.depths; d++) gold += this.earnGold(this.boostGold(depthGold(seed, d)));
      run.skipped = ABYSS.skip.depths;
      run.tide = ABYSS.skip.depths;
      run.depth = ABYSS.skip.depths + 1;
    }
    run.gold += gold;
    return gold;
  }

  // The dive's Abyss Tide: +ABYSS.tide.damage crew damage per depth cleared
  // this dive (1 outside a dive).
  get tideDamage() { return 1 + (this.abyss.run?.tide ?? 0) * ABYSS.tide.damage; }

  // What the current depth is fought with (Abyss.depthOptions).
  // (The active meal's Abyss Angler Bake calms the rising tide.)
  get abyssOptions() {
    return depthOptions(this.abyss.run.seed, this.abyss.run.depth, { growth: this.mealMods.abyssGrowth });
  }

  // Gold earned during the dive (kills), for the end-of-run screen.
  noteDiveGold(n) {
    if (this.abyss.run) this.abyss.run.gold += n;
  }

  // A depth's crew damage (its Captain's Log record), for the dive's top
  // damage dealer.
  noteDiveDamage(record) {
    const run = this.abyss.run;
    if (!run || !record) return;
    for (const c of record.crew) run.damage[c.id] = (run.damage[c.id] ?? 0) + totalDamage(c);
  }

  // The current depth was cleared: its clear bonus, its first-clear
  // milestone (once per save: free chests and Pearls), and on to the next.
  // Returns { depth (the one cleared), gold, milestone (or null) }.
  winDepth() {
    const run = this.abyss.run;
    const { depth } = run;
    const gold = this.earnGold(this.boostGold(depthClearBonus(depth)));
    run.gold += gold;
    let milestone = null;
    if (!this.abyss.milestones.includes(depth)) milestone = milestoneOf(depth);
    if (milestone) {
      this.abyss.milestones.push(depth);
      for (const [tier, n] of Object.entries(milestone.chests)) for (let i = 0; i < n; i++) this.addFreeChest(tier);
      this.pearls += milestone.pearls;
    }
    this.abyss.best = Math.max(this.abyss.best, depth);
    this.mealWaveDone();
    run.depth++;
    run.tide++;
    run.dropsPaid = [];
    return { depth, gold, milestone };
  }

  // The dive is over (the ship sank, or it left): the depth reached is
  // recorded. Returns the end-of-run summary: { depth (reached), from, best,
  // newRecord, gold, materials, mvp ({ id, damage } or null) }.
  endDive() {
    const run = this.abyss.run;
    if (!run) return null;
    const newRecord = run.depth > this.abyss.best;
    this.abyss.best = Math.max(this.abyss.best, run.depth);
    this.abyss.run = null;
    let mvp = null;
    for (const [id, damage] of Object.entries(run.damage)) if (damage > 0 && (!mvp || damage > mvp.damage)) mvp = { id, damage };
    return {
      depth: run.depth, from: run.from, best: this.abyss.best, newRecord, gold: run.gold, materials: run.materials, mvp,
    };
  }

  // A boss beaten in the Abyss: ABYSS.bosses.drops x its usual drop (more the
  // first time it's ever beaten; call after recordDefeat), once per boss per
  // depth. Returns { material, count } or null.
  abyssBossDrop(bossKey) {
    const run = this.abyss.run;
    const m = materialOfBoss(bossKey);
    if (!run || !m || run.dropsPaid.includes(bossKey)) return null;
    run.dropsPaid.push(bossKey);
    const { perKill, firstKill } = PARTS.drops;
    const count = (this.defeatCount(bossKey) <= 1 ? firstKill : perKill) * ABYSS.bosses.drops;
    this.addMaterial(m.id, count);
    run.materials[m.id] = (run.materials[m.id] ?? 0) + count;
    return { material: m.id, count };
  }

  // --- The Uncharted Seas ---

  // They open the first time a dive into the Abyss starts.
  get unchartedUnlocked() { return this.abyss.runs > 0; }

  tickGrog(now = Date.now()) { Uncharted.tickGrog(this.uncharted, now); }
  grogTimeLeft(now = Date.now()) { return Uncharted.grogTimeLeft(this.uncharted, now); }
  get grog() {
    this.tickGrog();
    return this.uncharted.grog;
  }
  addGrog(n) { Uncharted.addGrog(this.uncharted, n); }
  itemCount(id) { return this.uncharted.items[id] ?? 0; }

  // Whether a rule of the stage under way is on (false outside one).
  stageHas(rule) { return !!this.stage?.rules.includes(rule); }

  // Whether a stage can be sailed at a crown: open, and the Grog for it.
  canSailStage(stage, crown, now = Date.now()) {
    Uncharted.tickGrog(this.uncharted, now);
    return Uncharted.isStageOpen(this.uncharted, stage, crown) && this.uncharted.grog >= Uncharted.stageCost(stage, crown);
  }

  // The Muster for a stage: the crew as it is now is kept to put back after
  // (Progress.stage.slotsBefore); the stage's crew rules take off whoever may
  // not sail (a trait rule) and anyone past the crew limit (Skeleton Crew).
  // The stage isn't under way until beginStage.
  musterStage(stage, crown) {
    const rules = Uncharted.stageRules(stage, crown);
    this.stage = {
      id: stage.id, crown, rules, cost: 0, slotsBefore: this.stage?.slotsBefore ?? [...this.slots], started: false,
    };
    let kept = 0;
    this.slots = this.slots.map((id, slot) => {
      if (!id || slot >= this.slotCount) return id;
      if (!this.mayMuster(id) || kept >= this.stageCrewLimit) return null;
      kept++;
      return id;
    });
  }

  // How many crew the stage under way lets sail, and whether one may.
  get stageCrewLimit() {
    return this.stageHas('skeleton_crew') ? UNCHARTED.rules.skeleton_crew.crew : this.slotCount;
  }
  mayMuster(id) {
    for (const rule of ['fighters_only', 'mystics_only']) {
      if (this.stageHas(rule) && traitOf(id) !== UNCHARTED.rules[rule].trait) return false;
    }
    return true;
  }
  // The Muster can set sail: someone on deck, within the crew limit.
  get musterReady() {
    const crew = this.activeHeroes;
    return crew.length > 0 && crew.length <= this.stageCrewLimit && crew.every(({ id }) => this.mayMuster(id));
  }

  // Set sail on the mustered stage: its Grog is spent. Returns the cost, or
  // null if it can't (not open, not enough Grog).
  beginStage(now = Date.now()) {
    const stage = this.stage && Uncharted.stageOf(this.stage.id);
    if (!stage || !Uncharted.isStageOpen(this.uncharted, stage, this.stage.crown)) return null;
    const cost = Uncharted.stageCost(stage, this.stage.crown);
    if (!Uncharted.spendGrog(this.uncharted, cost, now)) return null;
    this.stage.cost = cost;
    this.stage.started = true;
    return cost;
  }

  // The stage under way was won: its clear gold, the drops (Sea Glass,
  // Hearts), a new best crown, and the first clear of it at that crown
  // gives all its Grog back. Returns { gold, glass, heart, refund, first,
  // crown, best (the crown it was before) }.
  winStage(random = Math.random) {
    const { id, crown, cost } = this.stage;
    const stage = Uncharted.stageOf(id);
    const rec = this.uncharted;
    const best = Uncharted.bestCrown(rec, stage);
    const key = `${id}:${crown}`;
    const first = !rec.firstClears.includes(key);
    const firstHeart = first && crown >= 2;
    const drops = Uncharted.rollDrops(stage, crown, { first, firstHeart }, random);
    for (const [c, n] of Object.entries(drops.glass)) rec.items[c] = (rec.items[c] ?? 0) + n;
    rec.items.heart = (rec.items.heart ?? 0) + drops.heart;
    if (first) rec.firstClears.push(key);
    rec.crowns[id] = Math.max(best, crown);
    const refund = first ? cost : 0;
    Uncharted.addGrog(rec, refund);
    const gold = this.earnGold(this.boostGold(Uncharted.stageClearGold(stage)));
    if (!this.stageHas('no_galley')) this.mealWaveDone();
    this.stage.started = false;
    return {
      gold, ...drops, refund, first, crown, best,
    };
  }

  // The stage under way was lost, or left: half its Grog back. Returns the refund.
  loseStage() {
    if (!this.stage?.started) return 0;
    const refund = Uncharted.retreatRefund(this.stage.cost);
    Uncharted.addGrog(this.uncharted, refund);
    this.stage.started = false;
    return refund;
  }

  // Back from the stage to the chart: the crew as it was before the Muster.
  endStage() {
    if (!this.stage) return;
    this.slots = this.stage.slotsBefore.map((id) => (id && this.isOwned(id) && !this.isAway(id) ? id : null));
    this.stage = null;
  }

  // --- Crew Awakening ---

  isAwakened(id) { return this.awakened.includes(id); }
  // What's missing to awaken a crewmate: null if it can be, else
  // 'locked' (the Uncharted Seas aren't open), 'awake', 'level' or 'items'.
  awakenBlock(id) {
    if (!this.unchartedUnlocked) return 'locked';
    if (this.isAwakened(id)) return 'awake';
    if (this.heroLevel(id) < AWAKEN.level) return 'level';
    const cost = Uncharted.awakenCost(id);
    return Object.entries(cost).every(([c, n]) => this.itemCount(c) >= n) ? null : 'items';
  }
  canAwaken(id) { return this.isOwned(id) && this.awakenBlock(id) == null; }

  // Awaken a crewmate (paying its Sea Glass and Hearts). Returns whether it did.
  awaken(id) {
    if (!this.canAwaken(id)) return false;
    for (const [c, n] of Object.entries(Uncharted.awakenCost(id))) this.uncharted.items[c] -= n;
    this.awakened.push(id);
    return true;
  }

  // --- The Galley: merchants, Bait, fish and meals ---

  // Bait comes back on its own up to this (more with the Whaler in the crew).
  get baitCap() {
    const { cap, capWithWhaler, whaler } = FISHING.bait;
    return this.owned.includes(whaler) ? capWithWhaler : cap;
  }

  // Bait back since it was last checked: one per FISHING.bait.regenMs of
  // real time (offline too) up to the cap; at or over the cap the clock
  // waits. The clock going backwards gives none and takes none away.
  tickBait(now = Date.now()) {
    if (this.bait >= this.baitCap || now < this.baitAt) {
      this.baitAt = this.bait >= this.baitCap ? now : Math.min(this.baitAt, now);
      return;
    }
    const n = Math.floor((now - this.baitAt) / FISHING.bait.regenMs);
    this.bait = Math.min(this.baitCap, this.bait + n);
    this.baitAt = this.bait >= this.baitCap ? now : this.baitAt + n * FISHING.bait.regenMs;
  }

  // ms until the next Bait comes back (null at or over the cap).
  baitTimeLeft(now = Date.now()) {
    this.tickBait(now);
    if (this.bait >= this.baitCap) return null;
    return Math.max(0, FISHING.bait.regenMs - (now - this.baitAt));
  }

  // One cast: spends a Bait (the regen clock starts if it was full).
  useBait(now = Date.now()) {
    this.tickBait(now);
    if (this.bait < 1) return false;
    if (this.bait >= this.baitCap) this.baitAt = now;
    this.bait--;
    return true;
  }

  // Bait from merchants and expeditions, which may go over the cap.
  addBait(n) {
    if (n > 0) this.bait += n;
  }

  // A merchant's plunder ({ gold, spice, bait, material: { id, count } or
  // null }), already rolled (Merchants.js): paid, and counted.
  plunder({
    gold = 0, spice = 0, bait = 0, grog = 0, material = null,
  }) {
    this.earnGold(gold);
    this.spice += spice;
    this.addBait(bait);
    this.addGrog(grog);
    if (material) this.addMaterial(material.id, material.count);
    this.merchantsPlundered++;
  }

  // A fish landed: into the hold and the Fish Log; the first of its kind
  // pays FISHING.firstCatchSpice. Returns { isNew, spice }.
  catchFish(id) {
    const isNew = !this.hasCaught(id);
    this.fish[id] = this.fishCount(id) + 1;
    this.fishLog[id] = (this.fishLog[id] ?? 0) + 1;
    this.fishCaught++;
    const spice = isNew ? FISHING.firstCatchSpice : 0;
    this.spice += spice;
    return { isNew, spice };
  }

  // Fish into the hold without catching it (an expedition's).
  addFish(id, n = 1) {
    this.fish[id] = this.fishCount(id) + n;
  }

  fishCount(id) { return this.fish[id] ?? 0; }
  hasCaught(id) { return (this.fishLog[id] ?? 0) > 0; }
  pantryCount(id) { return this.pantry[id] ?? 0; }

  // A recipe shows once each of its fish has been caught.
  isRecipeKnown(mealId) {
    const meal = MEALS.list[mealId];
    return !!meal && mealFish(meal).every(([id]) => this.hasCaught(id));
  }

  // Whether the hold has a meal's fish and Spice.
  hasIngredients(mealId) {
    return Object.entries(MEALS.list[mealId].needs).every(([id, n]) => (id === 'spice' ? this.spice : this.fishCount(id)) >= n);
  }
  canCook(mealId) { return this.isRecipeKnown(mealId) && this.hasIngredients(mealId); }

  // Cook a meal into the Pantry, using up its fish and Spice.
  cook(mealId) {
    if (!this.canCook(mealId)) return false;
    for (const [id, n] of Object.entries(MEALS.list[mealId].needs)) {
      if (id === 'spice') this.spice -= n;
      else this.fish[id] -= n;
    }
    this.pantry[mealId] = this.pantryCount(mealId) + 1;
    return true;
  }

  // How many waves a meal eaten now lasts: its own, plus
  // MEALS.caretakerWaves with a Caretaker on the ship.
  mealWaves(mealId) {
    const caretaker = this.activeHeroes.some(({ id }) => traitOf(id) === MEALS.caretakerTrait);
    return MEALS.list[mealId].waves + (caretaker ? MEALS.caretakerWaves : 0);
  }

  // Eat a meal from the Pantry: it becomes the active meal (replacing any).
  eat(mealId) {
    if (this.pantryCount(mealId) < 1) return false;
    this.pantry[mealId]--;
    this.meal = { id: mealId, wavesLeft: this.mealWaves(mealId) };
    return true;
  }

  // The active meal's effects (Fishing.mealModifiers; all 1 with none, or
  // during a stage with the Empty Galley rule).
  get mealMods() { return mealModifiers(this.stageHas('no_galley') ? null : this.meal); }

  // A wave was cleared (an island wave, an Abyss depth or a Boss Hunt):
  // the active meal has one wave less. Returns whether it just ran out.
  mealWaveDone() {
    if (!this.meal) return false;
    this.meal.wavesLeft--;
    if (this.meal.wavesLeft > 0) return false;
    this.meal = null;
    return true;
  }

  // The battlefield's basic enemy (ENEMIES key: its first formation's
  // first member; in the Abyss, its start island's), for the merchants'
  // plunder floor.
  get basicEnemy() {
    const island = this.inAbyss ? ISLANDS.find((d) => d.id === ABYSS.start.island) : this.island;
    return islandContent(island).formations[0].members[0];
  }

  // --- Packs ---

  get packCost() { return PACKS.cost; }

  // Free chests waiting (a finale's Legendary ones and expeditions').
  get freeChestCount() { return this.freeLegendaryChests + this.freeChests.common + this.freeChests.rare; }
  // The tier of the free chest that opens next, best first, or null.
  get nextFreeChest() {
    if (this.freeLegendaryChests > 0) return 'legendary';
    if (this.freeChests.rare > 0) return 'rare';
    return this.freeChests.common > 0 ? 'common' : null;
  }

  // A free chest of this tier (EXPEDITIONS.chestTiers) for the chest screen.
  addFreeChest(tier) {
    if (tier === 'legendary') this.freeLegendaryChests++;
    else if (tier in this.freeChests) this.freeChests[tier]++;
  }

  // A pack (packs.json id) can be opened: it exists and is unlocked.
  isPackUnlocked(id) {
    const pack = packOf(id);
    return !!pack && (!pack.island || this.isIslandUnlocked(pack.island));
  }
  get unlockedPacks() { return allPacks().filter((p) => this.isPackUnlocked(p.id)).map((p) => p.id); }
  // Packs unlocked along the way (not those open from the start) that the
  // player hasn't looked at in the chest screen yet (the Chests button's
  // dot; the carousel opens on the first), and ones whose "NEW PACK" banner
  // hasn't shown.
  get newPacks() { return this.unlockedPacks.filter((id) => packOf(id).island); }
  get unseenPacks() { return this.newPacks.filter((id) => !this.packsSeen.includes(id)); }
  get unannouncedPacks() { return this.newPacks.filter((id) => !this.packsAnnounced.includes(id)); }
  markPackSeen(id) {
    if (this.isPackUnlocked(id) && !this.packsSeen.includes(id)) this.packsSeen.push(id);
  }
  markPackAnnounced(id) {
    if (!this.packsAnnounced.includes(id)) this.packsAnnounced.push(id);
  }

  // The Abyss blessing: Legendary odds x PACKS.abyssBlessing.legendary in
  // every pack once the Abyss's best depth has reached its depth.
  get abyssBlessed() { return this.abyss.best >= PACKS.abyssBlessing.depth; }

  // The pack's crew owned so far, and its size ("3/6").
  packOwnedCount(id) { return (packOf(id)?.crew ?? []).filter((h) => this.isOwned(h)).length; }

  get canOpenPack() { return this.freeChestCount > 0 || this.pearls >= this.packCost; }
  // "Buy 10" (Pearls only; free chests open one at a time).
  get canOpenBulk() { return this.pearls >= PACKS.bulkCost; }
  canOpenFrom(id) { return this.isPackUnlocked(id) && this.canOpenPack; }
  canOpenBulkFrom(id) { return this.isPackUnlocked(id) && this.canOpenBulk; }

  // A pack's rarity odds: PACKS.rates over the rarities it has crew of (a
  // roll of one it lacks is rolled again, which comes to the same), with the
  // Abyss blessing's Legendary weight when blessed.
  static packRates(id, blessed = false) {
    const crew = packOf(id)?.crew ?? Object.keys(HEROES);
    const present = new Set(crew.map((h) => HEROES[h].rarity));
    const entries = Object.entries(PACKS.rates).filter(([r]) => present.has(r))
      .map(([r, w]) => [r, r === 'legendary' && blessed ? w * PACKS.abyssBlessing.legendary : w]);
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    return entries.map(([rarity, w]) => ({ rarity, chance: w / total }));
  }

  // Packs left until the pity guarantee: a Legendary is certain on this pack
  // number at the latest (1 = the next pack).
  get packsUntilPity() { return PACKS.legendaryPity - this.packsSinceLegendary; }

  // A crewmate from the pack. minRarity: only that rarity or rarer
  // (renormalized), for Rare Chests; forceRarity: that rarity (a Legendary
  // Chest, pity), or the pack's rarest below it if it has none.
  static rollHero(id, random = Math.random, { forceRarity = null, minRarity = null, blessed = false } = {}) {
    const crew = packOf(id)?.crew ?? Object.keys(HEROES);
    const order = Object.keys(RARITY);
    let rates = Progress.packRates(id, blessed);
    let roll = random();
    if (minRarity) {
      const kept = rates.filter((r) => order.indexOf(r.rarity) >= order.indexOf(minRarity));
      if (kept.length) {
        const total = kept.reduce((sum, r) => sum + r.chance, 0);
        rates = kept.map((r) => ({ ...r, chance: r.chance / total }));
      }
    }
    let rarity = rates[rates.length - 1].rarity;
    if (forceRarity) {
      const atMost = rates.filter((r) => order.indexOf(r.rarity) <= order.indexOf(forceRarity));
      rarity = (atMost.length ? atMost : rates).at(-1).rarity;
    } else {
      for (const r of rates) {
        if (roll < r.chance) { rarity = r.rarity; break; }
        roll -= r.chance;
      }
    }
    const pool = crew.filter((h) => HEROES[h].rarity === rarity);
    return pool[Math.floor(random() * pool.length)];
  }

  // Pull one hero from the pack: a free chest first if one is waiting (the
  // best tier first), else spend Pearls. Returns what happened (see pull,
  // plus free: the free chest's tier or null), or null if unaffordable or
  // the pack is locked.
  openPack(id, random = Math.random) {
    if (!this.canOpenFrom(id)) return null;
    const free = this.nextFreeChest;
    if (free === 'legendary') this.freeLegendaryChests--;
    else if (free) this.freeChests[free]--;
    else this.pearls -= this.packCost;
    this.lastPack = id;
    return { ...this.pull(id, random, free), free };
  }

  // "Buy 10": PACKS.bulkCount paid chests from the pack for PACKS.bulkCost
  // Pearls. Returns the pulls in order (see pull), or null if unaffordable.
  openBulk(id, random = Math.random) {
    if (!this.canOpenBulkFrom(id)) return null;
    this.pearls -= PACKS.bulkCost;
    this.lastPack = id;
    return Array.from({ length: PACKS.bulkCount }, () => this.pull(id, random));
  }

  // One chest's hero from the pack: a Legendary from a free Legendary chest
  // or at pity, else rolled (Rare or better from a Rare Chest). tier: a free
  // chest's tier, or null for a bought one. A new hero joins the crew, a
  // duplicate adds a star, and one past max stars adds a Bonus Level.
  // Returns { id, pity, isNew, stars, bonus, bonusLevel, slot }.
  pull(packId, random, tier = null) {
    const pity = tier !== 'legendary' && this.packsUntilPity <= 1;
    const id = Progress.rollHero(packId, random, {
      forceRarity: tier === 'legendary' || pity ? 'legendary' : null,
      minRarity: tier === 'rare' ? 'rare' : null,
      blessed: this.abyssBlessed,
    });
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

// A fresh save's Abyss record (see Progress.abyss).
function newAbyss() {
  return {
    best: 0, milestones: [], runs: 0, revealed: false, skipShallows: true, run: null,
  };
}

// A saved Abyss record, checked like the rest of the save. A dive's seed is
// kept as it is (any 31-bit number).
function abyssFromSave(a, int, knownMaterial) {
  const abyss = newAbyss();
  if (!a || typeof a !== 'object') return abyss;
  abyss.best = int(a.best, 0);
  abyss.runs = int(a.runs, 0);
  abyss.revealed = a.revealed === true;
  abyss.skipShallows = a.skipShallows !== false;
  if (Array.isArray(a.milestones)) {
    abyss.milestones = [...new Set(a.milestones.filter((d) => Number.isInteger(d) && d > 0))];
  }
  const r = a.run;
  if (r && typeof r === 'object' && Number.isFinite(r.seed)) {
    const numbers = (obj, keep) => Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => keep(k)).map(([k, v]) => [k, int(v, 0)]));
    const depth = int(r.depth, 1);
    abyss.run = {
      seed: Math.floor(Math.abs(r.seed)) % 2 ** 31,
      depth,
      from: int(r.from, 1, depth),
      tide: int(r.tide, 0, depth - 1),
      skipped: int(r.skipped, 0, depth - 1),
      gold: int(r.gold, 0),
      materials: numbers(r.materials, knownMaterial),
      damage: numbers(r.damage, (id) => id in HEROES),
      dropsPaid: Array.isArray(r.dropsPaid) ? r.dropsPaid.filter((k) => ENEMIES[k]?.boss) : [],
    };
  }
  return abyss;
}

// A saved Captain's Log record (see BattleStats.finish), checked like the rest
// of the save: unknown crew and enemy types dropped, numbers clamped. null if
// it isn't one.
function logRecordFromSave(r, int) {
  if (!r || typeof r !== 'object' || !Array.isArray(r.crew)) return null;
  const crew = r.crew.filter((c) => c && c.id in HEROES).map((c) => {
    const entry = {
      id: c.id,
      attack: int(c.attack, 0),
      ability: int(c.ability, 0),
      effect: int(c.effect, 0),
      kills: int(c.kills, 0),
      uses: int(c.uses, 0),
    };
    if (c.support != null) entry.support = int(c.support, 0);
    return entry;
  });
  const hull = {};
  for (const [k, v] of Object.entries(r.hull ?? {})) if (k in ENEMIES) hull[k] = int(v, 0);
  return {
    wave: int(r.wave, 1),
    island: ISLANDS.some((d) => d.id === r.island) || r.island === ABYSS.id ? r.island : ISLANDS[0].id,
    won: r.won === true,
    crew,
    hull,
  };
}

// A saved Uncharted Seas record (see Uncharted.newRecord), checked like the
// rest of the save: unknown stages and items dropped, numbers clamped.
function unchartedFromSave(u, int) {
  const rec = Uncharted.newRecord();
  if (!u || typeof u !== 'object') return rec;
  rec.grog = int(u.grog, 0, Infinity, rec.grog);
  if (Number.isFinite(u.grogAt)) rec.grogAt = u.grogAt;
  for (const id of Object.keys(rec.items)) rec.items[id] = int(u.items?.[id], 0);
  for (const [id, crown] of Object.entries(u.crowns ?? {})) {
    if (Uncharted.stageOf(id) && Number.isFinite(crown) && crown >= 1) rec.crowns[id] = int(crown, 1, 3);
  }
  if (Array.isArray(u.firstClears)) {
    rec.firstClears = [...new Set(u.firstClears.filter((k) => typeof k === 'string' && Uncharted.stageOf(k.split(':')[0])))];
  }
  rec.seen = u.seen === true;
  return rec;
}
