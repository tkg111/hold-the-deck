# Balance Report — Hold the Deck

Snapshot of the balance numbers in `src/config.js` (as of commit `dbfb012`),
plus an auto-play simulation of Skull Cove from a fresh save. No code was
changed for this report.

**How the numbers were made**

- Tables 1–3 come straight from `config.js` and the formulas in
  `Progress.js` / `WaveManager.js`, computed by script (not by hand).
- Section 4 runs the real battle code (waves, enemies, crew, abilities,
  Progress) headless through the existing `scripts/sim/` harness, with an
  extra instrumented driver kept outside the repo. The bot opens every chest it can
  afford, puts its best crew on the ship (Captain beside the strongest
  attacker, anti-air from wave 8), and keeps Auto abilities on. Five seeds
  (1000–1004) per policy:
  - **greedy**: spends all gold after every wave (deck first if crew are waiting).
  - **lazy**: only spends after a lost wave.
- "Crew DPS" is **sheet DPS**: damage × deck buffs × expected crit ÷ attack
  interval, single target. It leaves out splash, chain, pierce, poison and
  abilities, so the crew's real output is higher. Effective DPS is the
  "HP ÷ DPS" column compared with the wave's real length.

---

## 1. Enemies

### Wave scaling (all enemies)

| Formula | Value |
|---|---|
| Enemy count | `5 + (wave − 1) × 2.5`, boss waves × 0.5 |
| HP multiplier | `1 + 0.5n + 0.012n²`, n = wave − 1 (also shield HP, keg blast) |
| Damage multiplier | `1.08ⁿ` (also **armour**) |
| Kill-gold multiplier | `1.07ⁿ` |
| Spawn interval | `1400 − 20n` ms, min 700 (members of a formation 350 ms apart) |
| Elite chance | from wave 20: `8% + 0.4%/wave`, max 30%; Elites have 3× HP/shield, 3× gold |

| Wave | HP × | Damage × | Gold × | Enemies (non-boss) | Spawn interval | Elite chance |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1.00 | 1.00 | 1.00 | 5 | 1400 | 0% |
| 5 | 3.19 | 1.36 | 1.31 | 15 | 1320 | 0% |
| 10 | 6.47 | 2.00 | 1.84 | 28 | 1220 | 0% |
| 20 | 14.83 | 4.32 | 3.62 | 53 | 1020 | 8% |
| 30 | 25.59 | 9.32 | 7.11 | 78 | 820 | 12% |
| 40 | 38.75 | 20.12 | 13.99 | 103 | 700 | 16% |
| 50 | 54.31 | 43.43 | 27.53 | 128 | 700 | 20% |
| 60 | 72.27 | 93.76 | 54.16 | 153 | 700 | 24% |

Note that damage overtakes HP growth at about wave 45, and by wave 60 it's 30% higher.

### Base stats

| Enemy | HP | Speed (px/s) | Dmg / hit | Attack interval (ms) | Base DPS on hull | Gold | First wave | Special |
|---|---:|---:|---:|---:|---:|---:|---:|---|
| Drowned Sailor | 20 | 22.5 | 5 | 1000 | 5.0 | 2 | 1 | — |
| Thief Monkey | 8 | 65 | 0 | — | 0 | 3 | 3 | Steals 5% of current gold at the ship, then leaves |
| Iron Crab | 60 | 12 | 8 | 1200 | 6.7 | 6 | 6 | Armour 4 (×damage mult), min 1 dmg per hit |
| Storm Harpy | 22 | 30 | 6 | 1100 | 5.5 | 5 | 8 | Flies: only anti-air (or a net) can hit it; dives at the top deck |
| Keg Runner | 12 | 55 | **30 once** | — | — | 4 | 10 | Explodes on hull; killed early, blasts enemies in r40 for 40 (×HP mult) |
| Barnacle Knight | 50 | 16 | 10 | 1100 | 9.1 | 8 | 14 | Shield 60 HP (×HP mult) blocks straight shots; lobs, poison and Ghost Pirate pass |
| Siren | 100 | 0 | 0 | — | 0 | 20 | 16 (every 3rd wave, not boss waves) | Every 6 s: stuns a random crewmate 1.5 s; 1.5× haste to enemies within 110 px for 4 s |
| The Kraken (boss) | 160 | 9 | 12 | 1500 | 8.0 | 50 | 10 (then 30, 50…) | Can't be hit while rising (2.5 s); stun/slow ×0.5 |
| The Ghost Galleon (boss) | 150 | 0 | 4 per ball | 4 balls / 5 s | 3.2 | 50 | 20 (then 40, 60…) | Can't be hit while rising (2.5 s); launches a Boarding Boat every 9 s; stun/slow ×0.5 |
| Boarding Boat (minion) | 30 | 18 | **15 once** | — | — | 3 | 20 | Boards for its damage, then gone; no bounty count |

### Scaled values at key waves

| Wave | Sailor HP / hit | Crab HP / armour | Harpy HP / hit | Keg HP / hull dmg | Knight HP + shield | Boss HP | Boss dmg |
|---:|---|---|---|---|---|---|---|
| 1 | 20 / 5 | — | — | — | — | — | — |
| 10 | 129 / 10 | 388 / 8 | 142 / 12 | 78 / 60 | — | **Kraken 1,036** | 24 / hit |
| 20 | 297 / 22 | 890 / 17 | 326 / 26 | 178 / 129 | 742 + 890 | **Galleon 2,225** | 17 / ball (+ boats 445 HP, 65 dmg) |
| 30 | 512 / 47 | 1,536 / 37 | 563 / 56 | 307 / 280 | 1,280 + 1,536 | **Kraken 4,095** | 112 / hit |
| 40 | 775 / 101 | 2,325 / 80 | 853 / 121 | 465 / 603 | 1,938 + 2,325 | **Galleon 5,813** | 81 / ball (+ boats 1,163 HP, 302 dmg) |
| 49 | 1,053 / 201 | 3,159 / 161 | 1,158 / 241 | 632 / **1,206** | 2,632 + 3,159 | — | — |
| 50 (finale) | 1,086 / 217 | 3,259 / 174 | 1,195 / 261 | 652 / 1,303 | 2,716 + 3,259 | **Galleon 5,703 + Kraken 6,083** (0.7× HP) | Galleon 174 / ball, Kraken 521 / hit; the survivor enrages (×1.6 speed) |

Elites triple the HP (and shield) shown here.

Finale (wave 50): Galleon at 1.5 s, Kraken 20 s later, plus a trickle of 0.3× the
normal enemy count, one group every 3.2 s from 5 s. Pays 60 Pearls + 1 free
Legendary chest.

---

## 2. Crew

### Scaling rules

- **Damage** = `base × (1 + 0.2 × (level − 1)) × (1 + starBonus)`;
  star bonus by stars 0–5: `0, +10%, +25%, +45%, +70%, +100%`.
  → Lv 10 = 2.8×, Lv 25 = 5.8×, 5★ = 2×. Levels are uncapped.
- **Ability durations / stun** × `min(2, 1 + 0.02 × (level − 1) + 0.1 × stars)`.
  Ability damage is a multiple of the hero's current damage, so it scales like damage.
- **The Captain** (aura): the other crewmate on his deck gets
  `+(50% + 4%/level) × (1 + starBonus)` damage and +30% attack speed.

### Stats and DPS

DPS = sheet DPS (crit expectation included; splash, chains, poison and abilities not included).

| Crewmate | Rarity | Dmg | Interval (ms) | Range | Targeting / special | DPS Lv1 0★ | Lv1 5★ | Lv10 0★ | Lv10 5★ | Lv25 0★ | Lv25 5★ |
|---|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|
| Cabin Boy | Common | 5 | 450 | 350 | Nearest; anti-air | 11.1 | 22.2 | 31.1 | 62.2 | 64.4 | 129 |
| Ship's Cook | Common | 9 | 900 | 325 | Lob (over shields); 25% stun 1 s | 10.0 | 20.0 | 28.0 | 56.0 | 58.0 | 116 |
| Parrot Keeper | Common | 5 | 750 | 340 | Anti-air; 2.5× vs flyers (16.7 DPS vs flyers at Lv1) | 6.7 | 13.3 | 18.7 | 37.3 | 38.7 | 77.3 |
| Net Thrower | Rare | 6 | 2200 | 300 | Area r37.5; 50% slow 2.5 s; grounds flyers | 2.7 | 5.5 | 7.6 | 15.3 | 15.8 | 31.6 |
| Grog Brewer | Rare | 4 | 900 | 360 | Lob; poison 0.75× dmg/s for 4 s (ignores armour/shield); prefers unpoisoned | 4.4 | 8.9 | 12.4 | 24.9 | 25.8 | 51.6 |
| Harpooner | Rare | 8 | 1700 | 325 | Pierces up to 6 enemies over 150 px; anti-air | 4.7 | 9.4 | 13.2 | 26.4 | 27.3 | 54.6 |
| Ship's Doctor | Rare | 4 | 1000 | 320 | Nearest (support via ability) | 4.0 | 8.0 | 11.2 | 22.4 | 23.2 | 46.4 |
| Voodoo Priestess | Epic | 8 | 1100 | 325 | Curse +30% dmg taken 4 s; prefers uncursed; anti-air | 7.3 | 14.5 | 20.4 | 40.7 | 42.2 | 84.4 |
| Cannoneer | Epic | 24 | 3200 | 325 | Lob, area r47.5 | 7.5 | 15.0 | 21.0 | 42.0 | 43.5 | 87.0 |
| Sharpshooter | Epic | 26 | 2100 | **430** | Furthest enemy; ignores armour | 12.4 | 24.8 | 34.7 | 69.3 | 71.8 | 144 |
| Ghost Pirate | Epic | 13 | 1100 | 330 | Passes shields | 11.8 | 23.6 | 33.1 | 66.2 | 68.5 | 137 |
| **The Duelist** | Legendary | 40 | 1300 | 340 | 35% crit ×2.5; anti-air | **46.9** | **93.8** | **131** | **263** | **272** | **544** |
| The Captain | Legendary | 0 | — | — | Aura on deck-mate (damage bonus shown) | +50% | +100% | +86% | +172% | +146% | +292% |
| Storm Caller | Legendary | 20 | 1500 | 340 | Chain to 3 (80 px jumps, ×0.8 each; 2.4× total if 3 hit); anti-air | 13.3 | 26.7 | 37.3 | 74.7 | 77.3 | 155 |

### Abilities

Duration multiplier at Lv1/Lv10/Lv25: **1.00 / 1.18 / 1.48** at 0★, **1.50 / 1.68 / 1.98** at 5★ (cap 2.0).

| Crewmate | Ability | Cooldown | Numbers (base) | Scales with |
|---|---|---:|---|---|
| Cabin Boy | Rapid Fire | 15 s | 3× attack speed for 4 s | duration |
| Ship's Cook | Hot Stew | 18 s | Stun everything in r45 for 2 s (bosses 1 s) | stun |
| Net Thrower | Big Net | 20 s | 50% slow on every enemy (air too) for 5 s | duration |
| Grog Brewer | Grog Barrel | 18 s | 64 px puddle, 2.5× dmg/s for 6 s | dmg, duration |
| Harpooner | Whale Harpoon | 20 s | 5× dmg to every ground enemy | dmg |
| Voodoo Priestess | Hex | 25 s | +50% dmg taken, all enemies (air too), 6 s | duration |
| Cannoneer | Broadside | 25 s | 6 balls × 2× dmg, r40, spread along the lane | dmg |
| The Duelist | Lunge | 22 s | Next 5 hits on toughest enemy are guaranteed crits (12.5× base hit total) | dmg |
| The Captain | All Hands! | 30 s | Whole crew 1.5× attack speed 6 s | duration |
| Parrot Keeper | Flock | 16 s | 4× dmg to every flyer (needs a flyer) | dmg |
| Ship's Doctor | Patch Up | 24 s | Heal 15% max hull (needs damage) | — |
| Sharpshooter | Deadeye | 22 s | 1 s aim, then 10× dmg on toughest, ignores armour and shields | dmg |
| Ghost Pirate | Haunt | 24 s | Ground walkers flee backwards for 3 s | duration |
| Storm Caller | Tidal Wave | 28 s | Push ground walkers back 110 px, 2× dmg | dmg |

---

## 3. Economy

### Gold

| Source | Wave 1 | Wave 10 | Wave 25 | Wave 50 |
|---|---:|---:|---:|---:|
| Drowned Sailor kill | 2 | 4 | 10 | 55 |
| Thief Monkey kill | 3 | 6 | 15 | 83 |
| Iron Crab kill | 6 | 11 | 30 | 165 |
| Storm Harpy kill | 5 | 9 | 25 | 138 |
| Keg Runner kill | 4 | 7 | 20 | 110 |
| Barnacle Knight kill | 8 | 15 | 41 | 220 |
| Siren kill | 20 | 37 | 101 | 551 |
| Boss kill (Kraken / Galleon) | 50 | 92 | 254 | 1,376 |
| **Wave clear bonus** `10 + 4(w−1)` | 10 | 46 | 106 | 206 |

Elites pay 3×. Kill gold is kept on a lost wave. Thief Monkeys take 5% of
current gold each. Starting gold: 0.

### Pearls (spent on chests)

| Source | Amount | Simulated total by wave 50 |
|---|---|---:|
| Starting Pearls | 3 | 3 |
| Every wave clear | 1 | 50 |
| Every 5th wave clear (bonus) | +5 | 50 |
| First kill of a boss wave's boss | 5 | 25 |
| Finale (wave 50) | 60 + 1 free Legendary chest | 60 |
| Wanted bounties per enemy type | 10 / 100 / 500 defeats → 10 / 25 / 50 | **320** |
| Max-star duplicate refund | 1 per chest | 134 |

Bounties are 63% of all Pearls earned by wave 50 (all seeds agree within one Pearl).

### Chests

- Cost **3 Pearls**. Legendary pity: guaranteed within 30 chests.
- A new hero drops into the first free slot. Duplicates add a star (max 5), and after that they refund 1 Pearl.

| Rarity | Chance | Heroes | Per-hero chance |
|---|---:|---:|---:|
| Common | 45% | 3 (Cabin Boy, Cook, Parrot Keeper) | 15.0% |
| Rare | 30% | 4 (Net Thrower, Grog, Harpooner, Doctor) | 7.5% |
| Epic | 18% | 4 (Voodoo, Cannoneer, Sharpshooter, Ghost) | 4.5% |
| Legendary | 7% | 3 (Duelist, Captain, Storm Caller) | 2.3% |

The full roster at 5★ is 14 × 6 = 84 useful pulls.

### Upgrade costs (gold)

Formula: `round(baseCost × growth^L)`. Hull: base 20, ×1.25, +25 HP per level.
Crew level: base 15, ×1.22, +20% base damage per level. Decks: deck 2 = 100,
deck 3 = 300, +50 hull HP and +2 slots each.

| Level L | Hull: next level costs | Hull: total to reach L | Hull max HP at L (1 deck / 3 decks) | Crew: next level costs | Crew: total to reach L |
|---:|---:|---:|---:|---:|---:|
| 1 | 25 | 20 | 125 / 225 | 15 | 0 |
| 10 | 186 | 664 | 350 / 450 | 90 | 339 |
| 25 | 5,294 | 21,095 | 725 / 825 | 1,773 | 7,990 |
| 50 | 1,401,298 | 5,605,114 | 1,350 / 1,450 | 255,695 | 1,162,183 |

---

## 4. Simulation (fresh save, Skull Cove waves 1–50)

**Every checkpoint wave the brief asks for (10, 20, 30, 40, 50) is a boss
wave.** Boss waves bring half the normal escort, so they are much easier than
the waves around them. The tables also show the wave before each one
(9, 19, 29, 39, 49), which is the real difficulty at that point.

### Greedy bot (spends everything after each wave), average of 5 seeds

| Wave | Attempts (min–max) | Total attempts so far | Gold from the clearing attempt | Total gold earned so far | Crew sheet DPS (min–max) | Total enemy HP in wave | HP ÷ DPS (s) | Wave length (s) | Hull max HP | Sum of enemy hits* | Hull dmg taken (avg / max) |
|---:|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---|
| 5 | 1–1 | 5 | 73 | 232 | 44 (26–74) | 884 | 20 | 18 | 150 | 88 | 0 / 0 |
| 9 | 1–1 | 9 | 174 | 768 | 93 (64–182) | 3,386 | 36 | 29 | 200 | 244 | 2 / 11 |
| **10** | 1–1 | 10 | 212 | 980 | 117 (75–215) | 2,459 | 21 | 19 | 210 | 334 | 67 / 168 |
| 19 | 1–1 | 19 | 808 | 5,326 | 480 (261–725) | 23,310 | 49 | 33 | 380 | 2,346 | 0 / 0 |
| **20** | 1–1 | 20 | 767 | 6,094 | 513 (277–789) | 22,669 | 44 | 27 | 400 | 1,416 | 24 / 35 |
| 29 | 1–1 | 30 | 2,418 | 23,022 | 1,323 (1,051–1,828) | 66,911 | 51 | 48 | 560 | 5,927 | 0 / 0 |
| **30** | 1–1 | 31 | 1,808 | 24,830 | 1,471 (1,158–1,838) | 40,393 | 27 | 30 | 575 | 3,811 | 0 / 0 |
| 39 | 1–1 | 40 | 6,446 | 68,223 | 2,127 (1,729–2,603) | 142,694 | 67 | 60 | 675 | 18,178 | 0 / 0 |
| **40** | 1–1 | 41 | 4,500 | 72,724 | 2,151 (1,734–2,678) | 87,657 | 41 | 31 | 700 | 14,141 | 64 / 80 |
| 49 | 1–2 | 50 | 18,688 | 190,522 | 3,003 (2,427–3,291) | 301,254 | 100 | 66 | 795 | 44,594 | 330 / 483 |
| **50** | 1–1 | 51 | 7,556 | 198,078 | 3,073 (2,468–3,419) | 70,007 | 23 | 62 | 795 | 15,200 | 0 / 0 |

\* Sum of every spawned enemy's damage per hit (a keg or boat counts its one blast). It shows how much damage could reach the hull if nothing were killed.

- All 5 greedy runs reached wave 51 (Skull Cove cleared). Total losses across the 5 runs:
  4 (wave 28 ×2 in two runs, 43 ×1, 49 ×1). That's about 36 minutes of battle at 1× speed per run.
- Final ship: hull level 23–25, 3 decks, crew around Lv 31–32. The crew is usually
  Duelist, Captain, Storm Caller, Sharpshooter, Ghost Pirate and Voodoo or Cannoneer, mostly at 5★.
- By wave 50 every run had opened about 214 chests and owned all 14 heroes,
  which it did between waves 21 and 40.
  134 of those chests were max-star duplicates.

### Lazy bot (spends only after a loss), average of 5 seeds

| Wave | Attempts (min–max) | Total attempts so far | Total gold earned so far | Crew sheet DPS | HP ÷ DPS (s) | Hull max HP | Hull dmg taken (avg / max) |
|---:|---|---:|---:|---:|---:|---:|---|
| 5 | 1–2 | 5 | 237 | 29 | 30 | 110 | 4 / 20 |
| 9 | 1–2 | 10 | 828 | 58 | 58 | 160 | 43 / 104 |
| 10 | 1–3 | 12 | 1,052 | 92 | 27 | 195 | 127 / 192 |
| 19 | 1–2 | 22 | 5,575 | 356 | 65 | 360 | 43 / 216 |
| 20 | 1–1 | 23 | 6,353 | 356 | 65 | 360 | 81 / 233 |
| 29 | 1–1 | 34 | 23,464 | 1,087 | 62 | 525 | 0 / 0 |
| 30 | 1–1 | 35 | 25,272 | 1,098 | 37 | 525 | 0 / 0 |
| 39 | 1–2 | 44 | 69,893 | 1,397 | 102 | 580 | 0 / 0 |
| 40 | 1–1 | 45 | 74,418 | 1,397 | 63 | 580 | 112 / 241 |
| 49 | **1–8** | 57 | 211,621 | 2,996 | 101 | 770 | 579 / 724 |
| 50 | 1–1 | 58 | 219,177 | 2,996 | 23 | 770 | 0 / 0 |

All 5 lazy runs also cleared wave 50, taking 56–65 attempts in total.

### Where it gets stuck

Hull damage on every lost attempt (both bots, 10 runs), grouped by what dealt it:

| Wave | Losses | Main cause of hull damage |
|---:|---:|---|
| 5–9 | 6 | Drowned Sailors / first Harpies (lazy bot with only 1 deck) |
| 10 | 5 | **Keg Runners** (760 of 850 dmg). The Kraken did only 90. |
| 13, 16, 19 | 4 | Keg Runners + Harpies |
| 18, 25, 27, 39 | 6 | **Storm Harpies** (incl. Elite Harpies) |
| 28 | 8 | **Keg Runners** (2,040), then Knights / Elite Sailors |
| 36, 43 | 6 | **Keg Runners** (2,975) |
| 49 | 12 | **Storm Harpies** (9,299 of 9,325); the wave has 18 Harpies + a Siren |

- Nearly every loss comes from **Keg Runners or Storm Harpies**. Losses also
  cluster on **Siren waves** (16, 19, 25, 28, 43 and 49 are all Siren waves).
- Bosses were never the main cause of a loss (the Kraken dealt 90 damage across all lost attempts). They die in seconds.
- Ships don't wear down over a wave. They take almost nothing, or one leak sinks them:
  greedy runs averaged 0 hull damage on 6 of the 11 checkpoint waves.
- **Past the finale (Endless, greedy, 3 seeds):** wave 51 is a sudden spike.
  It has 439k HP, 38 Keg Runners and 27 Elites, against 70k HP for the finale,
  and the bot needed 7–14 attempts. After that the hard wall is at **wave 77–79**
  (15 losses in a row). There, enemy damage is 347× while HP is only 108×.

---

## 5. The five biggest balance problems

### 1. Pearls are far too generous, mainly through bounties, so the gacha runs out by mid-game

- **Evidence:** 508 Pearls by wave 50, 320 of them from Wanted bounties.
  The bot opens about 214 chests. It owns every hero by wave 21–40 and has the
  whole roster at 5★ by wave 56–66. 134 chests (about 400 Pearls) were dead
  duplicates that each refunded 1 Pearl. Chests stop mattering long before the island ends.
- **Suggested fix:**
  - Cut bounties to about 3 / 8 / 15 Pearls, or raise the defeat thresholds to 25 / 250 / 1,000.
  - Raise chest cost to 5 Pearls. Optionally add a 10-chest price break.
  - Replace the max-star refund with something worth having, such as shards
    that convert into a chosen hero's star, or gold.
  - Target: the full roster around wave 40–50, and 5★ on everything well into Endless.

### 2. Enemy damage grows exponentially but the hull grows linearly, so hull upgrades are pointless and fights are pass/fail

- **Evidence:** Damage ×1.08 per wave (43× by wave 50), but the hull only gets
  +25 HP per level. That's about 795 HP at wave 50 after about 17k gold on hull upgrades.
  A single Keg Runner reaching the ship does 759 at wave 43 and 1,206 at wave 49,
  which is more than the whole hull. Bots that won took 0 hull damage on most
  waves, and the losses are sudden one-shots. Hull levels, the Doctor's Patch Up
  and the Siren's chip pressure barely matter.
- **Suggested fix:**
  - Lower `damageGrowth` to about 0.045 (7.9× at wave 50), or make hull HP per
    level a percentage (for example +8% compounding).
  - Make Keg Runner and Boarding Boat damage a share of max hull (about 20–25%)
    instead of a scaled flat number, so a leak hurts without being an instant loss.

### 3. Armour scales with the *damage* multiplier, so most of the crew deals 1 damage to Iron Crabs mid-game

- **Evidence:** Crab armour is `4 × 1.08ⁿ`: 37 at wave 30, 80 at 40, 161 at 49
  (Elite crabs have 9.5k HP). A Lv 31 5★ Cabin Boy, Parrot Keeper, Voodoo
  Priestess, Harpooner or Doctor hits for 56–112, so every hit becomes 1 damage.
  A Ghost Pirate does 21. Only the Sharpshooter (ignores armour), Duelist,
  Storm Caller and Cannoneer can hurt crabs. That quietly pushes players onto
  epics and legendaries, and keeps commons and rares off the ship.
- **Suggested fix:**
  - Make armour a percentage reduction (for example crabs take 50% less, with
    Sharpshooter and poison ignoring it).
  - Or scale armour with `sqrt(hpMultiplier)` instead of the damage multiplier.

### 4. Boss waves and the finale are the easiest waves, and the climax is an anticlimax

- **Evidence:** With `bossEscortFactor` 0.5, waves 10/20/30/40 have 60–70% of
  the HP of the wave before them (wave 39: 143k, wave 40: 88k). The finale
  (wave 50) has **70k HP against 301k on wave 49**. It was never lost in 10
  runs, and the hull took 0 damage. The bosses die in seconds:
  Kraken 6.1k HP at wave 50 against about 3k sheet DPS.
  Then wave 51 (439k HP) is the hardest wave so far.
- **Suggested fix:**
  - Raise `bossEscortFactor` to about 0.8.
  - Raise boss base HP about 3× (Kraken 160 → 500, Galleon 150 → 450) so a
    boss is a real share of its wave.
  - For the finale, raise `hpFactor` 0.7 → 2.0 and `trickle` 0.3 → 0.7, so wave 50 is the peak of the island.
  - Ease Endless back in, for example a short HP grace for waves 51–55.

### 5. Rarity power gap: the Duelist is 4× any other attacker; commons and rares have no late role

- **Evidence:** Sheet DPS at the same level and stars: Duelist 46.9, then
  Storm Caller 13.3, Sharpshooter 12.4, Ghost Pirate 11.8, Cabin Boy 11.1,
  down to Net Thrower 2.7 and Doctor 4.0. Every level and star multiplies these
  base gaps, so a 5★ Lv 25 Duelist (544 DPS) beats the next three attackers
  combined. Storm Caller, also Legendary, is barely above two epics. On top of
  problem 3, the endgame crew is always the same 6.
- **Suggested fix:**
  - Cut the Duelist to about 22 damage (26 DPS), or lower his crit to 25% ×2.
  - Raise Net Thrower to 10 dmg / 1,800 ms and Doctor to 7 dmg.
  - Give Storm Caller 26 damage.
  - Give commons a scaling niche, for example Cabin Boy getting +1% attack
    speed per level, or Parrot Keeper's flyer bonus at 4× (Harpies did nearly all the damage in the 12 losses on wave 49).

### Also worth a look

- **Wave clear gold** is linear (206 at wave 50) while kill gold grows 7% a
  wave, so the clear bonus falls from about a third of a wave's gold at wave 5 to about 1% at wave 49.
  Scaling it with `1.07ⁿ` would keep clearing a wave rewarding.
- **Thief Monkeys** barely matter for a player who spends gold every wave
  (0–511 gold stolen per greedy run).
- **Siren waves** are where the lazy bot stalls. The haste on Harpies and kegs
  is the danger, not the crew stun. That's fine as a mechanic, but worth
  keeping in mind when retuning problem 2.


---

## 6. Rebalance

I applied the requested changes, then tuned them with the sim for four rounds,
plus one run to confirm the final numbers. Every number lives in `src/config.js`.
"Before" and "after" are both measured the same way: the same 5 seeds
(1000–1004) × both bots, played to wave 60. The only bot change is that it uses
Buy 10 whenever it can afford it. "Before" was re-run on the old code, so its
figures differ slightly from section 4, which stopped at wave 50 and measured a
few things differently.

### Results against the targets

| Target | Before | After | Met? |
|---|---|---|---|
| Greedy: 8–15 losses on Skull Cove | 0, 2, 0, 0, 4 | 8, 16, 15, 3, and one run stuck at wave 49 (22 losses) | **Partly** (2 of 5 runs in range, 1 just over) |
| Greedy: never more than 4 attempts on a wave | max 1–3 | max 4, 8, 11, 3, and 15 on the stuck run | **No** (2 of 5 runs) |
| Lazy: clears in 70–100 attempts | 56–65 | 57–62 (4 runs); one stuck at wave 30 | **No** (too few attempts) |
| Typical waves 10–49: hull takes 10–40% | greedy median 0%, mean 3%; 3 of 36 waves in range | greedy median 9%, mean 16%; 11 of 36 waves in range (lazy: 8% / 18%, 9 of 36) | **Partly** |
| Each boss wave at least as hard as the wave before | Boss waves had 60–70% of the HP of the wave before; finale 70k vs 301k | Measured by greedy hull damage and attempts, waves 10, 20 and 30 are harder than the wave before and 40 is level. By total HP, 10, 20 and 50 are bigger, while 30 and 40 are 13–23% smaller | **Partly** |
| Finale in the top 3 hardest waves | #22 by HP, #50 by hull damage | **#1 by HP** (326k); #8 by hull damage (greedy), #4 (lazy); never needs a retry | **Partly** |
| Each boss takes 20–45 s to kill | Kraken 2–17 s, Galleon 1–10 s, finale 0–3 s | Kraken w10 21–32 s, Galleon w20 19–37 s, Kraken w30 19–25 s, Galleon w40 24–37 s; finale: Galleon 20–51 s, Kraken 14–31 s | **Mostly** (a few just outside) |
| Full roster around wave 40–55 | waves 15–40 (mostly 20–28) | greedy 39, 50, 41, 42, 39; lazy 43, 50, 18 (lucky pulls), and two runs at 13 of 14 by wave 60 | **Mostly** |
| No crewmate over 2× the next best (same level and stars) | 3.5× (Duelist 46.9 vs Storm Caller 13.3) | **1.35×** (Duelist 25.1 vs Storm Caller 18.7) at every level and star count | **Yes** |
| Endless 51–60: no wave needs more attempts than the finale | greedy max 8–15 (wave 51 a wall in 2 runs); lazy 3–15 | greedy 1 (every run); lazy 2, 2, 2, and 15 in one run (wave 52) | **Greedy yes, lazy no** |

### What couldn't hit its target, and why

- **Pearls vs the roster target.** With the requested Pearl numbers (bounties
  2 / 5 / 10, every-5th-wave +3, chests 5 Pearls) the bot had 3–11 heroes by
  wave 50. A full roster takes a median of **80 chests** (10% of players need
  47 or fewer, 10% need 140 or more), about 360 Pearls at the Buy 10 price, and
  those numbers pay about 120 Pearls by wave 47. I raised the bounty payouts
  back to **10 / 25 / 50** and kept your new thresholds (25 / 250 / 1,000),
  chest price, Buy 10 price, milestone and finale numbers. That puts the roster
  at about wave 40–50.
- **Lazy bot clears in too few attempts.** Under the new economy it matters
  little *when* gold is spent. A hull that compounds rewards saving up, and
  hull-share kegs don't punish a bot that hasn't bought hull. So the lazy bot
  loses about as often as the greedy one (7–12 losses). To get 70–100 attempts
  for lazy while keeping greedy at 8–15 losses, spending late would need to
  cost more, for example interest-free saving being weaker. None of the numbers
  in the brief control that.
- **Spikes still decide the losses.** Nearly every remaining loss comes from
  waves with many Storm Harpies (49: 18 Harpies and a Siren; 18, 21, 25) or
  Keg Runners sheltering behind Barnacle Knights (28, 30). The seeded wave
  line-ups make these the same waves on every retry, so a crew that lacks
  anti-air can take 8–15 tries. That's why the "max 4 attempts" and some
  "10–40% hull damage" targets miss: ordinary waves are still easy-ish while a
  few hard ones are very hard. Narrowing that gap needs formation weights or
  Harpy stats, which weren't on the list.
- **The finale has the most HP but isn't the most dangerous.** The bot usually
  meets it with 5★ legendaries, and both bosses come in front of the crew where
  every shot reaches them, so it never needed a retry. Raising `hpFactor`
  further pushes the Galleon's kill time past 45 s (it was 51–60 s at 1.8 with
  500 HP), so I stopped at 1.5.
- **Kraken waves are the hardest regular waves** (hull damage 81–85% for
  greedy), not just "at least as hard". The Kraken hits the hull for 12 ×
  damage multiplier every 1.5 s, and its hit damage wasn't on the list. Its HP is set so it dies in 20–30 s.
- **Endless wave 52** stopped one lazy run: it has an Elite Siren hasting 16
  Keg Runners even at the 55% grace count. Grace now spans 10 waves (51–60)
  instead of 5 and starts at 50%, which fixed the greedy bot's wave-51 wall
  but not this line-up.

### Final numbers (changed from before)

| Area | Setting | Before | After | Brief asked for |
|---|---|---|---|---|
| Pearls | Bounty thresholds | 10 / 100 / 500 | 25 / 250 / 1,000 | same |
| | Bounty payouts | 10 / 25 / 50 | **10 / 25 / 50** | 2 / 5 / 10 |
| | Every-5th-wave bonus | +5 | +3 | same |
| | Finale Pearls | 60 (+1 Legendary chest) | 40 (+1 Legendary chest) | same |
| | Chest cost | 3 | 5 | same |
| | Buy 10 | — | 45 | same |
| | Duplicates past 5★ | +1 Pearl | +1 Bonus Level (+5% damage, uncapped, "+N" on cards) | same |
| Damage vs hull | Enemy damage growth | 1.08ⁿ | **1.04ⁿ** | 1.045ⁿ |
| | Hull HP | 100 + 25/level | 120 × 1.07^level (+50 per deck) | same |
| | Hull cost growth | ×1.25 | **×1.15** | start ~×1.18, tune |
| | Keg Runner on the hull | 30 × damage mult | **12%** of max hull (Elite **22%**) | 20% (35%) |
| | Boarding Boat on the hull | 15 × damage mult | 15% of max hull (Elite 25%) | same |
| | Wave-clear gold | 10 + 4(w−1) | (10 + 4(w−1)) × 1.07ⁿ | same |
| Armour | Iron Crab | flat 4 × damage mult | 60% reduction, min 1; ignored by Sharpshooter, poison, curse bonus, Cannoneer, Broadside, Whale Harpoon | same |
| Bosses | Boss escort | 0.5 | **0.65** | 0.85 |
| | Kraken base HP | 160 | **400** | 600 |
| | Galleon base HP | 150 | **450** | 500 |
| | Finale `hpFactor` / trickle | 0.7 / 0.3 | **1.5 / 1.0** | 1.8 / 0.7 |
| | Endless grace | — | **10 waves**, 50% of the count (and Elite chance) rising to 100% | waves 51–55 |
| Crew | Duelist | 40 dmg, 35% ×2.5 | 24 dmg, 30% ×2.2 | same |
| | Captain aura | (50% + 4%/lv) × star bonus | 40% + 2%/lv + 5%/star, max +100% | same |
| | Storm Caller / Net Thrower / Doctor / Grog | 20 / 6 per 2.2 s / 4 / 4 | 28 / 10 per 1.8 s / 7 / 5 | same |
| | Parrot Keeper vs flyers | 2.5× | 4× | same |
| | Cabin Boy | — | +1% attack speed per level, max +50% | same |

Bold marks a number I tuned away from the brief. Tuning went:

1. Exactly as briefed: walls at the waves 10 and 30 Krakens and the finale, and 3–11 heroes by wave 50.
2. Bounty payouts 10 / 25 / 50, Kraken 450, finale 1.2.
3. Escort 0.65, Kraken 400, finale 1.5 and trickle 0.85, grace from 50%.
4. Keg Runner 12% / 22%, damage growth 0.04, hull cost ×1.15. This was the best round.
5. Escort 0.55, Galleon 450, trickle 1.0, hull cost ×1.17, grace 10 waves.
   Greedy runs stalled at waves 25–30 on Harpies, so I reverted escort and hull cost.

The final run is round 4 plus round 5's changes that only touch waves 20, 40, 50 and Endless.

### Crew sheet DPS after the change

Expected crits and the Cabin Boy's level speed are included; deck buffs are not.

| Crewmate | Lv1 0★ | Lv1 5★ | Lv10 0★ | Lv10 5★ | Lv25 0★ | Lv25 5★ |
|---|---:|---:|---:|---:|---:|---:|
| The Duelist | 25.1 | 50.2 | 70.3 | 140.6 | 145.6 | 291.2 |
| Storm Caller | 18.7 | 37.3 | 52.3 | 104.5 | 108.3 | 216.5 |
| Sharpshooter | 12.4 | 24.8 | 34.7 | 69.3 | 71.8 | 143.6 |
| Ghost Pirate | 11.8 | 23.6 | 33.1 | 66.2 | 68.5 | 137.1 |
| Cabin Boy | 11.1 | 22.2 | 33.9 | 67.8 | 79.9 | 159.8 |
| Ship's Cook | 10.0 | 20.0 | 28.0 | 56.0 | 58.0 | 116.0 |
| Cannoneer | 7.5 | 15.0 | 21.0 | 42.0 | 43.5 | 87.0 |
| Voodoo Priestess | 7.3 | 14.5 | 20.4 | 40.7 | 42.2 | 84.4 |
| Ship's Doctor | 7.0 | 14.0 | 19.6 | 39.2 | 40.6 | 81.2 |
| Parrot Keeper (×4 vs flyers) | 6.7 | 13.3 | 18.7 | 37.3 | 38.7 | 77.3 |
| Net Thrower | 5.6 | 11.1 | 15.6 | 31.1 | 32.2 | 64.4 |
| Grog Brewer (+poison) | 5.6 | 11.1 | 15.6 | 31.1 | 32.2 | 64.4 |
| Harpooner (pierces) | 4.7 | 9.4 | 13.2 | 26.4 | 27.3 | 54.6 |
| The Captain (aura) | +40% | +65% | +58% | +83% | +88% | +100% |
