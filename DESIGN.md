# Hold the Deck — Design Doc

A Grow Castle-style idle defense web game. Players defend a pirate ship on the open sea from waves of drowned sailors and sea monsters, using a crew of heroes found in treasure chests.

(Originally "Kampung Defense", set in a Malaysian kampung; reskinned to pirates with identical mechanics and renamed. The browser save key still uses the old name, `kampung-defense/save`, so existing saves keep loading.)

Passion project — no real money, no ads, no timers. Everything is earned through play and should feel generous.

## Tech

- **Engine:** Phaser 3 + Vite (JavaScript)
- **Hosting:** GitHub Pages
- **Saving:** browser localStorage (auto-save), versioned so old saves can be migrated
- **Resolution:** the base resolution is **480x270** art pixels, shown at the largest whole-number scale that fits the window (re-picked when the window or browser zoom changes), centered on a dark page. Text and UI use finer layout units (two per art pixel) so they stay readable.
- **Art:** pixel-art sprites in `public/sprites/`, drawn with Phaser's `pixelArt` setting (nearest-neighbour, whole-pixel positions) and all scaled by the same whole number (**2x**) so pixels stay square. Every hero and enemy has a sprite, as does the ship (one per deck count). Anything added later without art falls back to a coloured rectangle.
- **Battle scene:** `bg.png` (sky, sea and a palm island on the right) behind everything and `fg_sheet.png` (near water and island foliage, 3 frames looping at 3 fps) in front, positioned and layered as `layout.json` describes. Draw order: background, ship, crew, enemies, The Kraken (and its splash), foreground, ship railing layer; slot markers, labels, HP bars, projectiles and UI go on top.
- **Positions (layout.json):** the ship's top-left is at `shipPos`. Walking enemies enter at `enemySpawnX` off the island's beach and follow the lane: their feet y is interpolated between the lane points as they walk, from the sand down into the water. They stop when their front edge reaches `shipContactX`.
- **Ship sprites:** `ship_stage1/2/3.png` (160x160) show the ship with 1, 2 or 3 decks built; the one matching the current deck count is shown. Heroes are drawn between it and the matching `ship_stageN_front.png` railing layer, so they stand behind the railings. Hero slot positions come from `ship_slots.json` (each deck's 2 slots as centre x and feet y in sprite pixels). Where two slots on a deck are close together, the second hero's name label sits higher so the labels don't overlap. Empty slots show a frame and a "+".
- **Character sprites:** heroes, the Drowned Sailor and the Thief Monkey are 32x32 with the feet on the bottom row; they stand on their slot (heroes) or the lane (enemies). The Kraken is 64x64. Rectangle placeholders stand the same way.
- **Animation:** in battle, characters are animated from `<name>_sheet.png`, with frame sizes, frame lists and fps from `animations.json`. Crewmates loop "idle" and play "attack" each time they fire, then return to idle; each one's idle starts on a frame staggered by slot so the crew doesn't bob in sync. The Drowned Sailor and Thief Monkey loop "walk" while moving and stand still otherwise. The Kraken loops "idle" and plays "attack" each time it hits the ship. Animations slow down with the enemy when slowed and freeze while stunned. Characters without an animation fall back to their single PNG (a little lunge or squash when they attack).
- **UI kit:** `public/sprites/ui/` holds 9-slice wood and parchment panels, gold and wood buttons (normal / hover / pressed / disabled images, used for those states), a bar frame and a 12px icon sheet; `ui.json` gives the fonts, slice sizes, icon order and colours. Mock-ups: `ui_mock_battle.png` and `ui_mock_between_waves.png` in the project root.
- **Fonts:** Jersey 10 at 16px (main) and Silkscreen at 8px (small), loaded from Google Fonts before the game starts. Text is drawn at exactly those sizes (or 2x for the splash title), one texel per art pixel with anti-aliasing thresholded away, then scaled up like the sprites, so it is as crisp as the art.
- **Hero cards** (chest reveal, new-crewmate splash, Crew Roster): parchment under a wood plate naming the rarity, the hero's single `<name>.png` at 2x, name, pixel stars, level and (on the large card) effect. Heroes not collected yet are a wood card with a black silhouette of their sprite and "???".
- **Crew faces:** the Shipwright and hero picker show each hero's face, cropped from their single sprite.

## Core Loop

1. Player presses **Start Wave**. Hull HP is refilled to full before every wave.
2. Enemies spawn on the right and walk left toward the ship.
3. Heroes on the ship auto-attack.
4. **Wave cleared:** earn gold and Pearls (see Currencies) and advance to the next wave.
5. **Hull HP hits 0:** wave fails, wave number does NOT advance. Gold earned from kills during the attempt is kept. Player can upgrade and retry. No other penalty.
6. Between waves: upgrade screen, hero slot assignment, treasure chests.

Waves are endless and scale in difficulty.

## The Ship

- Starts with **1 deck, 2 hero slots**.
- Build up to **3 decks** in v0.1. Each new deck adds 2 slots (max 6) and **+50 max HP**, so a deck is useful even before there are heroes to fill it.
- Upgradeable **hull HP** (+25 max HP per level).
- Heroes are assigned to slots by the player between waves (click a slot, pick an owned hero; picking a hero already placed elsewhere swaps them). Only slotted heroes fight.

## Enemies (v0.1)

| Enemy | Role | Behaviour |
|---|---|---|
| **Drowned Sailor** | Basic | Walks to the ship and attacks it. Most of every wave. |
| **Thief Monkey** | Fast thief | Fast, low HP. On reaching the ship, steals a % of gold instead of dealing damage, then disappears. |
| **The Kraken** | Boss | Appears every 10 waves with a reduced escort. Rises out of the sea in front of the ship (layout.json's `kraken.rise`: over 2.5s, with a splash at the waterline) and can't be targeted or hit until it has fully risen. Then it glides left at its normal speed to `kraken.advance.toX` and attacks from there. Very high HP, slow, hits the ship hard. **Status resist:** stun and slow last half as long on it, so it can't be stun-locked. |

## Heroes

All heroes are ranged and attack from the ship, except The Captain, who supports. If a shot's target dies while it is in flight, the shot switches to the nearest living enemy (a lobbed cannonball bends its arc to land on it); shots only fizzle when no enemies are left.

| Hero | Rarity | Attack | Effect |
|---|---|---|---|
| **Cabin Boy** | Common | Fast, low damage | None. Free starter hero. |
| **Ship's Cook** | Common | Medium speed/damage | 25% chance to stun for 1s (no movement or attacks) |
| **Net Thrower** | Rare | Slow, area | Net slows all enemies in the area by 50% for 2.5s (movement and attack speed) |
| **Voodoo Priestess** | Epic | Medium | Curse: cursed enemies take +30% damage from all heroes for 4s. Prefers targets that aren't cursed yet. |
| **Grog Brewer** | Rare | Fast flasks of grog | Poison: deals 75% of the hit's damage per second for 4s. Re-poisoning refreshes the timer and keeps the stronger tick; curse boosts poison too. Prefers targets that aren't poisoned yet. |
| **Harpooner** | Rare | Slow, piercing | The harpoon flies to the front of the enemy line, then skims along it for 300px, hitting up to 6 enemies once each. |
| **Cannoneer** | Epic | Very slow, lobbed | A cannonball arcs (1s flight) to where the target will be when it lands, then hits everything within a large area. |
| **The Duelist** | Legendary | Heavy single hits | 35% chance to crit for 2.5x damage ("CRIT!" pops up). Strongest against tough enemies and bosses. |
| **The Captain** | Legendary | Doesn't attack | Buffs the other hero on his deck: +50% damage (+4% per level, scaled by his stars) and +30% attack speed. Gold glow on him and on buffed heroes. |

Status effects are shown on the enemy: yellow circling stars (stunned), blue net (slowed), pulsing purple aura (cursed), green tint with rising bubbles and a green HP bar (poisoned).

Rarities: Common, Rare, Epic, **Legendary**. Each hero has a placeholder pirate catchphrase in config.

Heroes have:
- **Level:** raised with gold. +20% base damage per level.
- **Stars:** raised by duplicate pulls from packs, max 5. Each star adds a bigger damage bonus than the last: total bonus +10% / +25% / +45% / +70% / +100% at 1–5 stars.

## Currencies

- **Gold:** earned per kill and per wave cleared. Spent on hull HP, building decks, hero levels. Thief Monkeys steal a share of it.
- **Pearls:** spent on treasure chests. Earned from:
  - **Start:** 3, enough to open the first chest right away.
  - **Every wave clear:** +1.
  - **Milestone waves** (every 5th): +5 on top.
  - **Boss kills:** +5, once per boss wave (killing the boss and then losing the wave doesn't pay it again on the retry).

## Treasure Chests

(Called "packs" in the code.)

- One chest type, bought with Pearls.
- Each chest gives 1 hero.
- Drop rates: Common 45%, Rare 30%, Epic 18%, Legendary 7%. Within a rarity, each hero is equally likely.
- **Pity:** a Legendary is guaranteed within 30 chests. The counter resets on any Legendary (natural or guaranteed) and is shown in the chest screen ("Legendary guaranteed within N chests"). It only updates after the reveal so it never spoils a natural Legendary.
- Costs 3 Pearls. Rates are renormalized over rarities that actually have heroes, so an empty tier never breaks the odds.
- **New hero:** unlocked, added to the roster, and automatically placed in the first free slot if there is one.
- **Duplicate:** +1 star for that hero. A duplicate of a 5-star hero refunds 1 Pearl instead.

### Opening a chest

1. **Build-up:** the treasure chest (the kit's chest icon at 6x) rattles harder (it hops) and glows brighter. Rarer pulls build up longer and shake harder (Common 0.7s / Rare 1.3s / Epic 2.0s / Legendary 2.9s). The glow, and light leaking out of the chest, start white and shift to the rarity colour over the last 45% of the build-up, so the player gets a hint just before the reveal. A synthesized rattle-and-rising-hum plays over it; the hum rises higher for rarer pulls.
2. **Open:** with a whoosh, rays of light in the rarity colour spill out, and the hero's card rises out of the chest.
3. **Reveal:** a chime that gets longer and higher with rarity (Legendary adds a sustained chord and a warm full-screen flash); the card glows in its rarity colour. New heroes also get a sparkle sound and a **confetti burst** (40 / 90 / 160 / 280 pieces for Common / Rare / Epic / Legendary).
4. **New-hero splash:** the first time a hero is pulled, a big intro card appears over rotating light rays: "NEW CREWMATE!" ("NEW LEGENDARY CREWMATE!" for Legendaries), the card with name and rarity, and the hero's one-line **pirate catchphrase** (stored per hero in config). Click to continue. Duplicates skip the splash.

- Should be affordable roughly every few waves. With the current numbers it is faster than that: 10 waves pay 25 Pearls (10 per-wave + 10 milestone + 5 boss), about 8 chests, so tune `PACKS.cost` or the rewards if pulls feel too frequent.

## Prestige: New Voyage

- **Unlocks at wave 20.** The "New Voyage" button (top of the main screen, between waves) opens the prestige screen at any time; setting sail is locked until wave 20, the Renown shop is always open. The button pulses and shows the Renown on offer once a new voyage is unlocked.
- **A new voyage resets:** wave (to 1), gold, hull HP upgrades, decks (to 1), hero levels (all to Lv 1). Boss Pearls can be earned again.
- **A new voyage keeps:** owned heroes, stars, collection, hero slot assignments (heroes on higher decks return when those decks are rebuilt), Pearls, Legendary pity progress, Renown and shop levels, settings.
- **A new voyage earns** (based on the wave reached this run):
  - **Renown** = floor(10 × (wave / 20)^1.5): 10 at wave 20, 18 at wave 30, 28 at wave 40.
  - **Pearls** lump = floor(wave / 2): 10 at wave 20.
  - The screen shows what setting sail now earns, and what pushing 10 more waves would earn instead.
- **Confirmation screen** previews exactly what's lost (each value with before → after, every levelled hero), kept and earned before anything happens.
- Tracks voyages made and best wave ever reached.

### Renown shop

Permanent bonuses bought with Renown. Cost at level L = round(base × growth^L).

| Bonus | Effect per level | Base cost | Growth | Max |
|---|---|---|---|---|
| Fearsome Crew | +10% all hero damage | 5 | 1.5× | — |
| Plunder | +10% gold from kills and wave clears | 5 | 1.5× | — |
| Reinforced Hull | +10% hull max HP | 4 | 1.5× | — |
| Pearl Broker | Chests cost 1 less Pearl | 20 | 2.5× | 2 (chests never cost less than 1) |

Bonus gold carries fractions between kills, so +10% on small kill rewards still adds up.

## Crew Roster (collection book)

- Opened from the **Crew** button between waves.
- Shows every hero in the game as small cards, five to a row, grouped by rarity, with an "N/M FOUND" count beside the title plate.
- Owned heroes appear as their card with level and stars. Unowned heroes are black silhouettes with "???" for the name, so the player can see how many are left to find without spoiling who they are.

## Sound

- All sound effects are synthesized with the Web Audio API; there are no audio files.
- Current effects: chest rattle, chest opening, reveal chime (scales with rarity), new-hero sparkle, UI clicks.
- **Sound: On/Off** toggle on the main screen (usable mid-wave), saved with progress.

## Starting Numbers

All placeholders, meant to be tuned once playable. Every balance value lives in `src/config.js`; the numbers quoted in this doc are the current values there, and the config wins if they ever disagree.

## v0.1 Build Order

Each step should leave the game playable. (Built under the kampung theme; names here use the pirate reskin.)

1. **Core combat:** ship with HP, Cabin Boy auto-shooting, Drowned Sailor waves, wave win/lose.
2. **Gold + upgrade screen:** between-wave screen with hull HP, build deck, hero level.
3. **Enemy variety:** Thief Monkey and The Kraken boss waves.
4. **Hero roster:** all 4 heroes with their effects, assigning heroes to deck slots.
5. **Packs:** Pearls currency, pack opening, duplicate star-ups.
6. **Save/load + deploy:** localStorage auto-save, GitHub Pages deployment.

## Saving

- Auto-saves after every wave ends, every upgrade, every chest opened and every slot change, plus when the page is hidden or closed.
- Saves carry a version number (currently 5: v2 added the mute setting, v3 the Legendary pity counter, v4 prestige, v5 the pirate reskin, which renamed every saved field and hero ID without changing any values). When the save format changes, bump the version and add a migration from the old one so existing players keep their progress.
- Loading is defensive: out-of-range or unknown values are clamped or dropped, and an unreadable save is kept aside as a backup instead of being lost.
- **Reset progress** button (between waves) wipes the save after a confirmation.

## Between-wave UI

Layout follows `ui_mock_battle.png` and `ui_mock_between_waves.png`.

- **Always:** a wood plaque with the wave (red "BOSS" on boss waves) and a hull bar top-left; a wood plaque with gold and Pearls top-right, with a settings button (gear: Reset progress, with a confirmation, between waves only) and a sound toggle under it. Short messages (wave cleared, ship sunk, the Kraken rises) appear on a wood plaque under the top bar. Crew have no name labels on the ship.
- **During a wave:** an enemies-left bar at top-centre ("N ENEMIES LEFT", the fill shrinking as the wave is beaten), and a speed button bottom-right showing the current speed (x1 / x2); clicking it toggles. At x2 everything in the battle runs twice as fast: movement, attacks, spawns, animations and effects. The speed is remembered for the rest of the session (not saved), and between waves the game always runs at normal speed. The between-wave panel and buttons are hidden.
- **Shipwright** (between waves only): a parchment panel under a wood title plate with rows for Hull (level, HP per level), Build deck (decks built) and each hero on the ship (face, level, damage or The Captain's buff), each with a gold buy button showing the gold cost (grey when unaffordable, MAX when maxed). Five rows show at a time; with more, arrows by the title plate and the mouse wheel scroll it.
- **Hero picker:** click a ship slot to see every owned hero in the same panel (face, rarity, level, stars and where they're placed), plus "Leave empty"; it replaces the Shipwright while open.
- **Bottom bar** (between waves): **SET SAIL!** (starts the wave), **Chests** (with a red dot when a chest is affordable), **Crew** (the Crew Roster) and **Voyage** (New Voyage, with a red dot once a new voyage is available).
- The New Voyage screen and confirmation, and the reset confirmation, use the same parchment panels, wood plates and buttons.

## Later (not in v0.1)

- Active hero skills
- More enemies: Cursed Gulls (flying, only some heroes can hit), Floating Skulls (high damage, low HP)
- Music (sound effects exist; no background music yet)
- Save export/import
