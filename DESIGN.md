# Hold the Deck — Design Doc

A Grow Castle-style idle defense web game. Players defend a pirate ship on the open sea from waves of drowned sailors and sea monsters, using a crew of heroes found in treasure chests.

(Originally "Kampung Defense", set in a Malaysian kampung; reskinned to pirates with identical mechanics and renamed. The browser save key still uses the old name, `kampung-defense/save`, so existing saves keep loading.)

Passion project — no real money, no ads, no timers. Everything is earned through play and should feel generous.

## Tech

- **Engine:** Phaser 3 + Vite (JavaScript)
- **Hosting:** GitHub Pages. Every asset URL (sprites, sheets, fonts and the JSON data files) carries the build's version (`?v=...`, new on each build), so after a deploy browsers don't mix cached old data files with the new code (Pages caches files for 10 minutes). An effect sheet that still fails to load is simply not drawn (with a console warning) rather than showing Phaser's missing-texture box.
- **Saving:** browser localStorage (auto-save), versioned so old saves can be migrated
- **Resolution:** the base resolution is **480x270** pixels, shown at the largest whole-number scale at which 480x270 still fits the window. The view then fills the window: it is the window size divided by that scale (never smaller than 480x270), so a window that isn't an exact multiple shows more of the world instead of empty borders (e.g. 1280x720 is scale 2 with a 640x360 view). Scale and view are re-picked whenever the window, fullscreen state or browser zoom changes. Everything (sprites, UI and text) is drawn at 1x in those pixels and every object is drawn on whole pixels (`roundPixels`).
- **Fullscreen:** a button next to the sound toggle switches the page to fullscreen and back (its icon shows which); Esc also leaves. It is hidden where the browser doesn't support fullscreen (e.g. iPhone Safari).
- **Art:** pixel-art sprites in `public/sprites/`, drawn with Phaser's `pixelArt` setting (nearest-neighbour, whole-pixel positions) at 1x in the base resolution, so pixels stay square. Every hero and enemy has a sprite, as does the ship (one per deck count). Anything added later without art falls back to a coloured rectangle.
- **Battle scene:** `bg.png` (sky, sea and a palm island on the right) behind everything and `fg_sheet.png` (near water and island foliage, 3 frames looping at 3 fps) in front, positioned and layered as `layout.json` describes. The battlefield is a fixed 480x270 world: every gameplay position (ship, crew, spawn point, lane, `shipContactX`, the Kraken's rising spot, the Siren's rock, the Ghost Galleon, flight heights) is its `layout.json` value at any window size or aspect ratio, so walking distances, crew ranges and shot travel never change with the screen. In a bigger view that world sits flush with the view's bottom-right corner (the island at the right edge): extra width is open sea behind the ship and extra height is sky, and nothing spawns or walks there. Left of `bg.png` the sea and sky (and the near water around and behind the ship) are the left 288 columns of `bg.png` / `fg_sheet.png`, repeated mirror-wise so the seams match; above it the sky bands continue upward, each one darker by the same step as the top two bands of `bg.png`, up to 5 extra bands, then the last colour carries on to the top. Resizing the window mid-wave only re-lays the backdrop and HUD. Draw order: background, ship, crew, enemies (the Siren among them, her rock under the near water, and boarding boats), The Kraken and the Ghost Galleon (and the Kraken's splash), foreground, ship railing layer, flying enemies; slot markers, labels, HP bars, projectiles and UI go on top.
- **Positions (layout.json):** the ship's top-left is at `shipPos`. Walking enemies enter at `enemySpawnX` off the island's beach and follow the lane: their feet y is interpolated between the lane points as they walk, from the sand down into the water. They stop when their front edge reaches `shipContactX`.
- **Ship sprites:** `ship_stage1/2/3.png` (160x160) show the ship with 1, 2 or 3 decks built; the one matching the current deck count is shown. Heroes are drawn between it and the matching `ship_stageN_front.png` railing layer, so they stand behind the railings. Hero slot positions come from `ship_slots.json` (each deck's 2 slots as centre x and feet y in sprite pixels). Where two slots on a deck are close together, the second hero's name label sits higher so the labels don't overlap. Empty slots show a frame and a "+".
- **Character sprites:** heroes and every enemy but four are 32x32 with the feet on the bottom row, all facing left; they stand on their slot (heroes) or the lane (enemies). The Kraken is 64x64, the Siren 48x48 (on her rock), the Ghost Galleon 96x80 and a boarding boat 32x20 (its bottom on `layout.boardingBoat.waterlineY`, not the lane). Each enemy's hit box is its visible body (`width` / `height` in config), measured from its art. The newer enemies (Iron Crab, Storm Harpy, Keg Runner, Barnacle Knight, Siren, boarding boat) only have sheets, no single PNG. Rectangle placeholders stand the same way.
- **Effect sprites:** every projectile, impact, status mark and ability effect is a sheet in `public/sprites/fx/`, drawn at 1x; `fx.json` gives each one's frame size, frame count, fps, whether it loops or plays once (one-shot effects hold their last frame) and what it's for. Shots are drawn flying right: the harpoon, whale harpoon and Duelist's blade arc turn to their flight angle, and the spinning ones (frying pan, grog bottle, stew pot, grog barrel) just loop their animation. Lobbed shots (cannonball, grog bottle, frying pan, stew pot, grog barrel) fly in an arc to where the target will be; the rest fly straight. Where a shot hits, its impact plays: an explosion for cannonballs, a grog splash for bottles (and the Grog Barrel), a hit spark for everything else. Every hit (except poison ticks) flashes the enemy white for 60ms. Enemy effects: a Keg Runner's blast is the explosion at 2x size, a Barnacle Knight's shield breaking plays `shield_break` where the shield was, the Siren's `siren_note` floats from her to the crewmate it stuns, and the Ghost Galleon's `ghost_cannonball`s arc from its gun ports to the hull and explode there. Crew effects: the parrot, scalpel (turned to its flight) and spinning ghost cutlass fly like the others; the Sharpshooter's `musket_shot` leaves the musket's tip (`muzzle` in config) with a `muzzle_flash` there; the Storm Caller's chain is instant: `lightning_seg` laid end to end along each link (turned to it, flickering, shown 0.2s) and `lightning_hit` on each enemy.
- **Animation:** in battle, characters are animated from `<name>_sheet.png`, with frame sizes, frame lists and fps from `animations.json` (crew) and `animations_new_enemies.json` (enemies, plus the Ghost Galleon's `gunPorts`). Crewmates loop "idle" and play "attack" each time they fire, then return to idle; each one's idle starts on a frame staggered by slot so the crew doesn't bob in sync. The Drowned Sailor, Thief Monkey, Iron Crab and Keg Runner loop "walk" while moving and stand still otherwise; the Barnacle Knight walks with "walk_shield" until its shield breaks, then "walk_noshield". The Storm Harpy loops "fly" the whole time, showing "dive" while it dives. The Siren loops "idle" and plays "sing" while she sings. The Kraken loops "idle" and plays "attack" each time it hits the ship. The Ghost Galleon plays "emerge" once, loops "idle", plays "fire" with each volley and "sink" when beaten; boarding boats loop "row". A crewmate scared by Haunt turns to face the island while fleeing. Animations slow down with the enemy when slowed (and speed up while the Siren hastes it) and freeze while stunned. Characters without an animation fall back to their single PNG (a little lunge or squash when they attack).
- **UI kit:** `public/sprites/ui/` holds 9-slice wood and parchment panels, gold and wood buttons (normal / hover / pressed / disabled images, used for those states), a bar frame and a 12px icon sheet; `ui.json` gives the slice sizes, icon order and colours. Mock-ups: `ui_mock_battle.png` and `ui_mock_between_waves.png` in the project root, and in `mockups/` the Wanted Board, new-enemy alert, finale (`ui_mock_finale.png`) and world map (`ui_mock_world_map.png`).
- **Fonts:** all text is bitmap text from `public/sprites/ui/fonts/`, never scaled and positioned on whole pixels (centred text included), so it is as crisp as the art. Pre-coloured fonts by background:
  - **main_light** (16px, cream with a dark outline): on wood panels and wood buttons, and over the scene. Coloured text (red warnings, rarity names, gold amounts) tints it; the outline stays dark.
  - **main_dark**: on parchment and gold buttons.
  - **small_light** (8px): small text over the scene and on bars. **small_dark**: small text on parchment.
  - **big_light** (32px): SET SAIL!, wave banners, the chest reveal's result line and the new-crewmate title.
- **Hero cards** (chest reveal, new-crewmate splash, Crew Roster): parchment under a wood plate naming the rarity, the hero's single `<name>.png` at 2x (the only scaled art), name, pixel stars (with "+N" after them for Bonus Levels), level and (on the large card) effect. Heroes not collected yet are a wood card with a black silhouette of their sprite and "???".
- **Crew faces:** the Shipwright, hero picker and ability bar show each hero's face, cropped from their single sprite.

## Core Loop

1. Player presses **Start Wave**. Hull HP is refilled to full before every wave.
2. Enemies spawn on the right in formations and come left toward the ship.
3. Heroes on the ship auto-attack.
4. **Wave cleared:** earn gold and Pearls (see Currencies) and advance to the next wave.
5. **Hull HP hits 0:** wave fails, wave number does NOT advance. Gold earned from kills during the attempt is kept. Player can upgrade and retry. No other penalty.
6. Between waves: upgrade screen, hero slot assignment, treasure chests.

Waves scale in difficulty (see Waves). The voyage is split into islands of 50 waves, each ending in a finale (see Islands); a cleared island's waves go on endlessly.

## The Ship

- Starts with **1 deck, 2 hero slots**.
- Build up to **3 decks** in v0.1. Each new deck adds 2 slots (max 6) and **+50 max HP**, so a deck is useful even before there are heroes to fill it.
- Upgradeable **hull HP**, compounding: max HP is 120 x 1.07^level, plus 50 per deck built. Each level costs 20 x 1.15^level gold.
- Heroes are assigned to slots by the player between waves (click a slot, pick an owned hero; picking a hero already placed elsewhere swaps them). Only slotted heroes fight.

## Enemies

| Enemy | From wave | Role | Behaviour |
|---|---|---|---|
| **Drowned Sailor** | 1 | Basic | Walks to the ship and attacks it. Most of every early wave. |
| **Thief Monkey** | 3 | Fast thief | Fast, low HP. On reaching the ship, steals 5% of gold instead of dealing damage, then disappears. |
| **Iron Crab** | 6 | Slow tank | Slow, lots of HP, and **armour**: it shrugs off 60% of every hit (at every wave, Elites too), down to 1 damage. Poison, the bonus damage from a curse (Voodoo Priestess, Hex), the Sharpshooter (and Deadeye), the Cannoneer's cannonballs, Broadside and Whale Harpoon get through it in full. |
| **Storm Harpy** | 8 | Flyer | Flies in at a random height between `layout.harpyFlightY`'s min and max (140–175), then **dives** (from 70px out) at the top deck and attacks the hull from a spot off its frontmost slot (each harpy picks a spot up to 8px off it, so they don't stack). While airborne only **anti-air** crew can hit it: Cabin Boy, Harpooner, Voodoo Priestess and The Duelist. **Nets ground it:** a Net Thrower's net (his shots and Big Net) drops it to the lane for as long as the net's slow lasts, where anyone can hit it and it can't move or attack; then it climbs back up. |
| **Keg Runner** | 10 | Suicide runner | Fast and fragile. On reaching the ship it blows up for **12% of the hull's max HP** (22% for an Elite), not scaled by the wave, and is gone, with no gold. Killed first, its keg explodes where it fell (the explosion at 2x size and a camera shake), hitting every enemy on the lane within 40px for 40 x the wave's HP multiplier (over shields, and it can set off other kegs). |
| **Barnacle Knight** | 14 | Shield | Its shield (60 x the wave's HP multiplier, shown as a grey bar over its HP bar) blocks every straight shot until the shield's HP is gone; then `shield_break` plays and it walks on without it. **Lobbed** attacks go over the shield and hit it directly: Ship's Cook, Grog Brewer, Cannoneer, Hot Stew, Grog Barrel and Broadside (and Keg Runner blasts). Status effects from blocked shots still land. |
| **Siren** | 16 | Support | Joins every 3rd wave from 16 (16, 19, 22…, never a boss wave), a quarter of the way through it: she fades in on her rock at `layout.siren` and never moves. Every 6s (the first 2.5s after she appears) she plays "sing" and sends a `siren_note` to a random crewmate on the ship: it stuns them for 1.5s (no attacks, stun stars over their head), and every other enemy within 110px of her moves and attacks 50% faster for 4s. Stunning or slowing her delays her song. She must be killed to clear the wave. An "A SIREN SINGS!" banner warns at the start of her waves. |
| **The Kraken** | 10 | Boss | Appears on waves 10, 30, 50… (taking turns with the Ghost Galleon) with a reduced escort. Rises out of the sea in front of the ship (layout.json's `kraken.rise`: over 2.5s, with a splash at the waterline) and can't be targeted or hit until it has fully risen. Then it glides left at its normal speed to `kraken.advance.toX` and attacks from there. 400 HP (scaled), slow, hits the ship hard. **Status resist:** stun and slow last half as long on it (and Haunt and Tidal Wave), so it can't be stun-locked. Never Elite. |
| **The Ghost Galleon** | 20 | Boss | Appears on waves 20, 40… with a reduced escort, 30% of the way through. It plays "emerge" at `layout.ghostGalleon` (rising bow-first out of the water, 2.5s, can't be targeted or hit meanwhile), then sits there and never moves. 1.5s after emerging and every 5s after, it plays "fire" and lobs a ghost cannonball from each of its 4 gun ports (`gunPorts` in `animations_new_enemies.json`) at a random spot on the hull (4 damage each, scaled like any enemy damage). 4s after emerging and every 9s after, it launches a **boarding boat**. 450 HP (scaled), status resist like The Kraken; Haunt and Tidal Wave don't move it. When beaten it plays "sink" and fades out. Never Elite. |
| *Boarding boat* | – | Minion | Launched by the Ghost Galleon from its bow; rows left on the waterline like a ground enemy (30 HP, slow, scaled with the wave). On reaching the ship its crew board for **15% of the hull's max HP** (25% for an Elite), once, and it's gone, with no gold. Killed first, it pays 3 gold (scaled). Anyone can hit it, and Haunt and Tidal Wave move it. It has no Wanted poster and its defeats don't count. |

### Elites

From wave 20 any enemy but the boss can spawn as an **Elite**: tinted gold, 3x HP (and 3x shield), 3x gold. The chance per enemy is 8% at wave 20, +0.4% per wave after, up to 30%.

## Waves

- **Formations:** a wave is built from formations (`FORMATIONS` in config), picked at random by weight from the ones unlocked so far, until it holds at least 5 enemies + 2.5 per wave after the first. A formation's first wave always includes it, so each new enemy is introduced on schedule. Formations come 1.4s apart (0.02s less each wave, down to 0.7s); members of one enter 0.35s apart. In an **escorted** formation the others keep at least 16px behind the leader while it walks, and are free once it dies or reaches the ship: Keg Runners shelter behind a Barnacle Knight's shield or an Iron Crab, Thief Monkeys behind a Drowned Sailor.

  | From | Formation |
  |---|---|
  | 1 | a Drowned Sailor |
  | 2 | three Drowned Sailors |
  | 3 | a Thief Monkey |
  | 4 | escorted: a Drowned Sailor, two Thief Monkeys |
  | 6 | escorted: an Iron Crab, two Drowned Sailors |
  | 8 | two Storm Harpies |
  | 10 | two Keg Runners |
  | 12 | escorted: an Iron Crab, two Keg Runners |
  | 14 | escorted: a Barnacle Knight, two Keg Runners |
  | 15 | escorted: two Barnacle Knights, two Drowned Sailors |
  | 18 | escorted: a Barnacle Knight, an Iron Crab, two Storm Harpies |

- **Same line-up on a retry:** the formations, their order and which enemies are Elite come from a generator seeded by the wave number, so retrying a wave meets the same line-up (and the flyer warning below knows what's coming).
- **Boss waves** (every 10th): 65% of the usual enemies, with the boss entering 30% of the way through (an island's finale wave is built differently; see Islands). The bosses take turns (`WAVES.bosses`): The Kraken on waves 10, 30, 50…, The Ghost Galleon on 20, 40…. The wave's banner names it ("THE KRAKEN RISES!" / "THE GHOST GALLEON!").
- **Scaling** (n = wave - 1): enemy HP x (1 + 0.5n + 0.012n²), about 6.5x at wave 10, 15x at wave 20, 39x at wave 40 and 72x at wave 60 (it used to be 1 + 0.2n); enemy damage x 1.04ⁿ (about 1.4x at wave 10, 2.1x at 20, 6.6x at 49); kill gold and the wave-clear bonus x 1.07ⁿ. Keg Runners and boarding boats don't use the damage multiplier: they hit for a share of the hull.
- **Endless grace:** after an island's finale is beaten, its next 10 waves bring fewer enemies (and Elites), 50% of the usual count on the first one, rising evenly toward the full count, so Endless doesn't open with a spike.
- **Flyer warning:** pressing SET SAIL! for a wave with Storm Harpies when nobody on the ship can hit flyers (no anti-air crew and no Net Thrower) asks first: "Flyers ahead!", with Cancel / Set sail.

### Balance simulation

`npm run sim [-- runs maxWave]` plays the game headless from a fresh save (the real battle code, with Phaser stubbed out; see `scripts/sim/`). A bot opens every affordable chest (Buy 10 whenever it can), puts its best crew on the ship (The Captain beside the strongest, someone anti-air from wave 8) and either spends all its gold after every wave (**greedy**) or only after losing one (**lazy**: its waves between losses show how often upgrades are needed). `SIM_CONFIG` takes JSON merged into config, for trying numbers. The bot plays Skull Cove from wave 1; winning wave 50 clears it (reward included) and it carries on in Endless mode. The numbers were last tuned with it in the rebalance described in `BALANCE_REPORT.md` (5 seeds per bot, up to wave 60):
- **Greedy** clears Skull Cove in 4 of 5 runs, taking 53–66 attempts (3–16 lost waves); the fifth stalls on wave 49 (18 Storm Harpies and a Siren). The roster is complete around wave 39–50.
- **Lazy** also clears it in 4 of 5 runs, in 57–62 attempts; the fifth stalls at The Kraken on wave 30. One run that cleared it then stalls on Endless wave 52 (an Elite Siren hasting 16 Keg Runners).
- Losses come almost entirely from Storm Harpies and leaking Keg Runners, worst on Kraken waves (10, 30) and Siren waves. Boss kills take about 20–35s, the finale's Galleon up to about 50s. Chest luck still moves a run a lot.

## Heroes

All heroes are ranged and attack from the ship, except The Captain, who supports. If a shot's target dies while it is in flight, the shot switches to the nearest living enemy it can hit (a lobbed cannonball bends its arc to land on it); shots only fizzle when no enemies are left.

**Anti-air:** the Cabin Boy, Parrot Keeper, Harpooner, Voodoo Priestess, The Duelist and the Storm Caller can hit Storm Harpies in the air; the rest only hit enemies on the lane (their area hits skip harpies overhead). The Net Thrower can't hurt a harpy in the air either, but aims at them (preferring ones still flying), because his net grounds them. Anti-air crew and the Net Thrower carry a small blue mark (an up-arrow in a ring) in the top-right corner of their card and after their name in the hero picker, and their effect line says "hits flyers" / "nets ground flyers".

| Hero | Rarity | Attack | Effect |
|---|---|---|---|
| **Cabin Boy** | Common | Fast, low damage | +1% attack speed per level above 1 (up to +50%). Free starter hero. |
| **Ship's Cook** | Common | Medium speed/damage, lobbed frying pan | 25% chance to stun for 1s (no movement or attacks) |
| **Net Thrower** | Rare | Slow (10 damage every 1.8s), area | Net slows all enemies in the area by 50% for 2.5s (movement and attack speed) |
| **Voodoo Priestess** | Epic | Medium | Curse: cursed enemies take +30% damage from all heroes for 4s. Prefers targets that aren't cursed yet. |
| **Grog Brewer** | Rare | Fast lobbed bottles of grog (5 damage) | Poison: deals 75% of the hit's damage per second for 4s. Re-poisoning refreshes the timer and keeps the stronger tick; curse boosts poison too. Prefers targets that aren't poisoned yet. |
| **Harpooner** | Rare | Slow, piercing | The harpoon flies to the front of the enemy line, then skims along it for 150px, hitting up to 6 enemies once each. |
| **Cannoneer** | Epic | Very slow, lobbed | A cannonball arcs (1s flight) to where the target will be when it lands, then hits everything within a large area. Its explosions **ignore armour**. |
| **The Duelist** | Legendary | Heavy single hits (24 damage) | 30% chance to crit for 2.2x damage ("CRIT!" pops up). Strongest against tough enemies and bosses. |
| **Parrot Keeper** | Common | Fast-ish, sends a parrot | Anti-air: 4x damage against flyers. |
| **Ship's Doctor** | Rare | Scalpel throws (7 damage, spinning to its flight angle) | None; his worth is Patch Up. |
| **Sharpshooter** | Epic | Slow, heavy, long range (430px), very fast musket shot | Aims at the enemy **furthest** from the ship in range; **ignores armour**. Shots leave the musket's tip with a muzzle flash. |
| **Ghost Pirate** | Epic | Medium, spinning ghost cutlass | Passes **through shields**: hits a Barnacle Knight directly. |
| **Storm Caller** | Legendary | Chain lightning, instant (28 damage) | Hits the target, then jumps to the nearest enemy not yet hit within 80px, up to 3 enemies, each jump at 80% of the last hit. Anti-air. |
| **The Captain** | Legendary | Doesn't attack | Buffs the other hero on his deck: +40% damage, +2% per level above 1 and +5% per star, up to +100%; and +30% attack speed. Buffed heroes stand on a gold buff ring; he stands on a still one dimmed to 60%, marking him as the buff's source (an animated one like everyone's during All Hands!). |

Status effects are shown on the enemy with sprites: a net draped over a slowed enemy (the same 32x32 box as its sprite), poison bubbles over a poisoned one, and stun stars and then the curse mark stacked above the HP bar (above the name on The Kraken). The HP bar also turns purple while cursed and green while poisoned.

### Abilities

Every crewmate has one active ability, used during waves from the ability bar (or keys 1–6) and then on cooldown.

| Crewmate | Ability | Effect | Cooldown |
|---|---|---|---|
| Cabin Boy | **Rapid Fire** | Triple attack speed for 4s | 15s |
| Ship's Cook | **Hot Stew** | Lobs a pot at the thickest crowd; everything within 45px is stunned for 2s | 18s |
| Net Thrower | **Big Net** | A huge net drops over the lane: every enemy on screen is slowed 50% for 5s | 20s |
| Grog Brewer | **Grog Barrel** | Throws a barrel just ahead of the leading enemy, leaving a poison puddle (as wide as its 64px sprite) on the lane for 6s. Enemies in it are poisoned for 2.5x the Brewer's damage per second (lingering 0.5s after they leave) | 18s |
| Harpooner | **Whale Harpoon** | A giant harpoon skims the whole lane from the ship to the far edge, hitting every enemy once for 5x the Harpooner's damage, through armour. A light camera shake (0.3s) as it's thrown | 20s |
| Voodoo Priestess | **Hex** | She casts (0.3s), then curses every enemy on screen: +50% damage taken from everything for 6s | 25s |
| Cannoneer | **Broadside** | 6 cannonballs fall one after another (0.16s apart) at spots spread evenly along the lane; each hits everything within 40px for 2x the Cannoneer's damage, through armour, with a light camera shake | 25s |
| The Duelist | **Lunge** | His next 5 shots go at the toughest enemy (most HP left) and are all crits; his attack is ready at once | 22s |
| The Captain | **All Hands!** | Whole crew +50% attack speed for 6s | 30s |
| Parrot Keeper | **Flock** | A parrot homes on every flyer on screen (in the air or netted) for 4x his damage; 6 more fly across the sky for show. Needs a flyer on screen | 16s |
| Ship's Doctor | **Patch Up** | Repairs 15% of max hull HP; 5 heal crosses rise over the hull and "+N HP" floats up. Needs the hull below full (with Auto: missing at least 15%, so none is wasted); no enemy needed | 24s |
| Sharpshooter | **Deadeye** | `deadeye_mark` on the toughest enemy he can hit (most HP left) while he aims for 1s, then one musket shot (with muzzle flash and a light shake) for 10x his damage, ignoring armour and shields | 22s |
| Ghost Pirate | **Haunt** | Every ground enemy that walks (not flyers, the Siren or the Ghost Galleon) flees back toward the island for 3s at its own pace, turned around, with `fear_mark` over it; scared enemies don't attack | 24s |
| Storm Caller | **Tidal Wave** | `tidal_wave` (72px wide) rolls right along the lane from the ship to the far edge; every walker it reaches takes 2x his damage and is pushed 110px back toward the island (never past where it came in). Pushing works even on stunned enemies | 28s |

- **Scaling:** damage from abilities is a multiple of the crewmate's own damage, so it grows with level and stars like their attacks do. Durations (and the Hot Stew stun) are multiplied by 1 + 2% per level above 1 + 10% per star, up to 2x. Speed boosts stack multiplicatively (Rapid Fire during All Hands! is 4.5x).
- **Using them:** every ability is ready at the start of each wave. An ability only fires with an enemy to use it on: any targetable enemy on screen, or for the attack speed boosts (Rapid Fire, All Hands!) one within 350px of the crewmate. Pressing one that can't fire plays a dull blip and keeps it ready. Stun and slow from abilities are halved on The Kraken like any other.
- **Flyers:** only Rapid Fire, Big Net, Hex, Lunge, All Hands! and Flock reach (and count) Storm Harpies in the air; Big Net grounds them like the Net Thrower's shots. Hot Stew, Grog Barrel, Whale Harpoon, Broadside, Deadeye, Haunt and Tidal Wave work on the lane only.
- **Siren stuns:** a crewmate stunned by the Siren's note can still use their ability.
- **Auto:** a toggle at the end of the ability bar fires every ability as soon as it is ready and has a target. Saved with progress (save v7).
- **Feedback:** the ability name floats up from the crewmate in its colour, with a synthesized sound per ability (blips, a whoosh and clang, a net swish, a barrel crash and glugs, a ringing harpoon, an eerie hex, cannon booms on each impact, a sword "shing", a bugle call). Effects: Rapid Fire's streaks behind the Cabin Boy and All Hands!' sparkles over each crewmate while they last; the stew pot and grog barrel spin through the air and splash (stew splash, grog splash); Big Net drops from above the view onto the lane (tiled along it), lies there while the slow lasts and fades out as it ends; the poison puddle lies on the lane while it lasts and fades out; the whale harpoon skims the lane, turned to its slope, with a hit spark on each enemy; Hex plays its cast on the Priestess (centred on her, its ring at her feet), then a hex burst on each enemy as the curse lands, and the curse mark once the burst is over; a gold buff ring loops under the feet of every boosted crewmate (Rapid Fire, All Hands!, The Captain's deck buff), and The Captain always stands on a still, 60%-dimmed one as the buff's source; a target marker loops on the enemy the Duelist's next Lunge shot will hit (the toughest) while crits remain; Broadside's cannonballs drop onto the lane and explode; each Lunge crit flashes a cross on the target.

Rarities: Common, Rare, Epic, **Legendary**. Each hero has a placeholder pirate catchphrase in config.

Heroes have:
- **Level:** raised with gold. +20% base damage per level.
- **Stars:** raised by duplicate pulls from packs, max 5. Each star adds a bigger damage bonus than the last: total bonus +10% / +25% / +45% / +70% / +100% at 1–5 stars.
- **Bonus Levels:** a duplicate of a 5-star hero gives +1 Bonus Level: +5% damage each, on top of level and stars, with no cap. Shown as "+N" after the stars (cards, hero picker).

## Currencies

- **Gold:** earned per kill and per wave cleared (10 + 4 per wave after the first, x 1.07ⁿ like kill gold). Spent on hull HP, building decks, hero levels. Thief Monkeys steal a share of it.
- **Pearls:** spent on treasure chests. Earned from:
  - **Start:** 3, enough to open the first chest right away.
  - **Every wave clear:** +1.
  - **Milestone waves** (every 5th): +3 on top.
  - **Boss kills:** +5, once per boss wave (killing the boss and then losing the wave doesn't pay it again on the retry).
  - **Bounties** (Wanted Board): 10 / 25 / 50 for defeating 25 / 250 / 1,000 of one enemy type.
  - **Island finales:** 40 on top of the wave's own, plus a free Legendary chest (Skull Cove).

## Treasure Chests

(Called "packs" in the code.)

- One chest type, bought with Pearls.
- Each chest gives 1 hero.
- Drop rates: Common 45%, Rare 30%, Epic 18%, Legendary 7%. Within a rarity, each hero is equally likely.
- **Free Legendary chests:** an island's finale reward. While one is waiting the open button says "Open FREE" (no Pearls) and the pity line says how many are waiting; it opens before any paid chest, always gives a Legendary (resetting the pity counter like any Legendary), and the Chests button's red dot shows.
- **Pity:** a Legendary is guaranteed within 30 chests. The counter resets on any Legendary (natural or guaranteed) and is shown in the chest screen ("Legendary guaranteed within N chests"). It only updates after the reveal so it never spoils a natural Legendary.
- Costs 5 Pearls, or **Buy 10** for 45. Rates are renormalized over rarities that actually have heroes, so an empty tier never breaks the odds.
- **New hero:** unlocked, added to the roster, and automatically placed in the first free slot if there is one.
- **Duplicate:** +1 star for that hero. A duplicate of a 5-star hero gives +1 Bonus Level instead ("+1 BONUS LEVEL!").

### Opening a chest

1. **Build-up:** the treasure chest (the kit's chest icon at 6x) rattles harder (it hops) and glows brighter. Rarer pulls build up longer and shake harder (Common 0.7s / Rare 1.3s / Epic 2.0s / Legendary 2.9s). The glow, and light leaking out of the chest, start white and shift to the rarity colour over the last 45% of the build-up, so the player gets a hint just before the reveal. A synthesized rattle-and-rising-hum plays over it; the hum rises higher for rarer pulls.
2. **Open:** with a whoosh, rays of light in the rarity colour spill out, and the hero's card rises out of the chest.
3. **Reveal:** a chime that gets longer and higher with rarity (Legendary adds a sustained chord and a warm full-screen flash); the card glows in its rarity colour. New heroes also get a sparkle sound and a **confetti burst** (40 / 90 / 160 / 280 pieces for Common / Rare / Epic / Legendary).
4. **New-hero splash:** the first time a hero is pulled, a big intro card appears over rotating light rays: "NEW CREWMATE!" ("NEW LEGENDARY CREWMATE!" for Legendaries), the card with name and rarity, and the hero's one-line **pirate catchphrase** (stored per hero in config). Click to continue. Duplicates skip the splash.

- **Buy 10** (the button between Open and Done): opens 10 paid chests at once for 45 Pearls (a free Legendary chest still opens on its own). There's no build-up: the 10 pulls appear as a grid of small parchment tiles where the chest stood (rarity stripe, face, short name, rarity, and NEW! / N STARS / BONUS +N), with the best rarity's chime (and the Legendary flash), a "N NEW CREWMATES!" line, and then the new-crewmate splash for each new hero in turn.
- Pacing: a full roster takes about 80 chests (median; 47–140 for 80% of players), and the Pearl income is set so it comes together around waves 40–55. Most of the income is wave clears and bounties: 10 waves pay about 21 Pearls before bounties (10 per-wave + 6 milestone + 5 boss).

## Islands

The voyage is split into **islands** of 50 waves each (`ISLANDS` in config, in `map/map.json`'s order). The game so far is Island 1, **Skull Cove**. The ship (decks, hull), crew, upgrades, gold and Pearls carry over between islands; each island keeps its own wave counter, best wave (the highest it has cleared) and boss-Pearl record.

- **Later islands start harder:** enemy HP, damage, kill gold, wave-clear gold and the Elite chance on an island are those of wave + its `waveOffset` (Skull Cove 0, Ember Isle 30, Frostbite Reef 60, Fogbound Isle 90), while new enemies, formations, Sirens and bosses arrive on the usual waves. The wave line-up is seeded by the wave and the offset.
- **Unlocking:** Island 1 is always open; each later island opens when the one before it is cleared, if it's `available`. Islands 2–4 (Ember Isle, Frostbite Reef, Fogbound Isle) are placeholders for now: they show on the map but stay locked.
- **Endless mode:** once an island's finale is beaten, its waves go on past 50 as an endless voyage (bosses every 10th wave as usual). Cleared islands can be sailed back to from the map at any time; their counter carries on where it was.

### The finale: Wrath of Skull Cove (wave 50)

Matches `mockups/ui_mock_finale.png`.

- **Storm:** setting sail on wave 50 brings in the storm from `storm/storm.json`, fading in over 1.2s: a dark blue tint over the battle, `storm_clouds.png` along the top of the view (tiled across wider views), `rain_sheet.png` tiled over the whole view (4 frames at 12 fps), and a lightning bolt at a random x in the sky every 4–8s (the first sooner) with a 0.1s white flash and a thunder crack. It sits over the battle but under projectiles and the HUD, runs on real time, and fades out when the wave ends.
- **Banner:** "WRATH OF SKULL COVE" with "WAVE 50 - FINAL BATTLE" under it, held for 3s.
- **The bosses:** the Ghost Galleon emerges 1.5s in; 20s later The Kraken surfaces in front of it. Each has 150% of its usual HP for the wave. A full wave's worth of regular formations trickles in alongside (100% of the wave's usual count), a group every 3.2s from 5s in.
- **Enrage:** when one boss dies the other **enrages** ("THE KRAKEN ENRAGES!" / "THE GHOST GALLEON ENRAGES!"): tinted red and attacking 1.6x as fast (The Kraken's hits; the Galleon's volleys and boats), its animations sped up to match. If the Galleon falls before The Kraken has surfaced, The Kraken arrives enraged.
- **Beating it:** the storm clears and a "SKULL COVE CLEARED!" banner (held 4.5s) shows the reward: the wave's usual Pearls plus **40 Pearls** and **a free Legendary chest** (waiting in the chest screen), and the **world map unlocks**. Losing it just clears the storm; the next try brings it back.
- The boss Pearls (+5) are paid once, for whichever boss dies first.

### World map

Opened from the **Map** button in the bottom bar (left of SET SAIL!), which appears once an island is cleared, with a red dot until the map is first opened. Matches `mockups/ui_mock_world_map.png`: `map_bg.png` under a "THE CURSED SEAS" wood plate and an X button (top-left) to close.

- **Islands** at their `map.json` spots with their name under them (`labelOffsetY`). Cleared islands fly `flag_cleared.png` (at `flagOffset`) and say "CLEARED" in green. Locked ones are drawn greyscale at 45% with a "?" on them and "???" for a name, and can't be selected.
- **Route** (`map.json`'s points, one leg per pair of neighbouring islands): legs to an unlocked island are solid red dots, the rest dotted ink.
- **Ship token** (`ship_token_sheet.png`, 2 frames at 2 fps) beside the current island, bobbing 1px.
- **Island card:** clicking an unlocked island rings it with gold dots and shows its parchment card: name, "ISLAND n - WAVES 1-50" (or "ENDLESS" once cleared), hazard, boss, best wave ("-" if none) and the wave it's at, with **SET SAIL!**, which sails there (with a "SAILING TO …" banner) and closes the map. The current island is selected when the map opens.

## No prestige

There is no prestige or reset loop: progress is one long voyage across the islands. (A "New Voyage" prestige with a Renown currency and a Renown shop existed up to save v5 and was removed. Loading an older save drops it and pays back all Renown, held plus everything spent on shop levels, at **2 Pearls per Renown**; a voyage at wave 20 paid 10 Renown, so that is worth about 20 Pearls, roughly 6 chests.)

## Crew Roster (collection book)

- Opened from the **Crew** button between waves.
- Shows every hero in the game as small cards, five to a row and ten to a page, grouped by rarity, with an "N/M FOUND" count beside the title plate. With more than ten heroes, arrows either side of the title plate turn the page.
- Owned heroes appear as their card with level and stars (and "+N" Bonus Levels). Clicking one shows it as a large card beside an Ability panel (name, cooldown, effect at its current level and stars); click anywhere to close. Unowned heroes are black silhouettes with "???" for the name, so the player can see how many are left to find without spoiling who they are.

## Wanted Board (enemy book)

- Opened from the **Wanted** button between waves (in the bottom bar where Voyage used to be; its icon is `icon_wanted.png`). A red dot on the button means a poster that hasn't been opened yet.
- Art in `public/sprites/ui/wanted/`; poster positions (enemy box, stamp spot, selection frame offset) come from its `wanted.json`.
- **Posters:** one per enemy type (not boarding boats), four to a row in the order they first appear, with an "N/M FOUND" count beside the title plate. A met type's poster is `poster.png` with frame 0 of its sheet in the enemy box (the bottom 30 rows of a 32x32 portrait, so feet show); The Kraken, the Siren and the Ghost Galleon (its skull bow) use a 32x32 crop of frame 0 (`face` in config). The highest bounty earned shows as a bronze / silver / gold stamp, and a red dot marks a poster not opened yet. Types not met yet are `poster_unknown.png` and can't be opened.
- **Details page** (parchment, right): clicking a poster frames it (`poster_select.png`), marks it seen and shows its page: name on a wood plate, its portrait at 2x, trait chips (icon + label: Boss, Flying, Armoured, Shielded, Explodes, Support, by what the enemy does), HP / speed / damage at the current wave (from the wave's multipliers; "-" for none; "12% HULL" and the like for Keg Runners) and its first wave, a one-line description (`description` in config), "Weak to" with the faces and short names of the crew good against it (`weakTo` in config), and the bounty: the three stamps (dim until paid), defeats so far, and a bar to the next tier. A legend under the posters lists the bounty tiers.
- **Meeting a new type:** the first time an enemy type spawns, its poster unlocks and a "NEW ENEMY!" alert shows at the top centre for 3s (its poster, name and description on a wood plaque, fading in and out), without pausing the game. Several in a row queue up. It runs on real time, so it lasts as long at x2 speed.
- **Defeats and bounties:** every kill of a type counts (Elites too; Keg Runners blowing up on the hull and Thief Monkeys getting away don't). Reaching 25 / 250 / 1,000 defeats pays 10 / 25 / 50 Pearls at once, with a small toast under the wave plaque (the stamp, the type and count, and the Pearls) that fades after 2.5s; toasts stack.

## Sound

- All sound effects are synthesized with the Web Audio API; there are no audio files.
- Current effects: chest rattle, chest opening, reveal chime (scales with rarity), new-hero sparkle, UI clicks, one per ability (squawks for Flock, chimes for Patch Up, a rising whine for Deadeye, a ghostly wail for Haunt, rushing water for Tidal Wave) plus pot, barrel and cannonball impacts, Keg Runner blasts and Ghost Galleon volleys (the cannonball boom), a Barnacle Knight's shield breaking (a crack and a clang) and the Siren's song (a soft three-note phrase).
- The finale's lightning adds a thunder crack and rumble, and clearing an island plays the Legendary reveal chime.
- **Sound: On/Off** toggle on the main screen (usable mid-wave), saved with progress.

## Starting Numbers

Every balance value lives in `src/config.js`; the numbers quoted in this doc are the current values there, and the config wins if they ever disagree. Wave scaling, enemy stats and upgrade costs were tuned with the balance simulation (see Waves): along with the steeper HP curve, hero level costs grow x1.22 per level (was x1.25). The rebalance in `BALANCE_REPORT.md` set the rest: The Kraken 400 HP and The Ghost Galleon 450 (hits of 12 and 4 per cannonball), enemy damage x1.04 per wave, a compounding hull, share-of-hull Keg Runners and boats, percentage armour, and the crew changes above.

## v0.1 Build Order

Each step should leave the game playable. (Built under the kampung theme; names here use the pirate reskin.)

1. **Core combat:** ship with HP, Cabin Boy auto-shooting, Drowned Sailor waves, wave win/lose.
2. **Gold + upgrade screen:** between-wave screen with hull HP, build deck, hero level.
3. **Enemy variety:** Thief Monkey and The Kraken boss waves.
4. **Hero roster:** all 4 heroes with their effects, assigning heroes to deck slots.
5. **Packs:** Pearls currency, pack opening, duplicate star-ups.
6. **Save/load + deploy:** localStorage auto-save, GitHub Pages deployment.

## Saving

- Auto-saves after every wave ends, every upgrade, every chest opened, every slot change and on closing the Wanted Board, plus when the page is hidden or closed.
- Saves carry a version number (currently 10: v2 added the mute setting, v3 the Legendary pity counter, v4 prestige, v5 the pirate reskin, which renamed every saved field and hero ID without changing any values, v6 removed prestige and converted Renown to Pearls, v7 the ability bar's Auto toggle, v8 the Wanted Board: enemy types met, posters opened, defeats and bounties paid per type, v9 islands: the current island and each visited island's wave, best wave, cleared flag and boss-Pearl record, plus whether the map has been opened and free Legendary chests waiting, v10 Bonus Levels per hero, starting at 0). Loading a v7 save marks every enemy type whose first wave the player has already passed as met, with its poster already seen (so an old save doesn't light up with "new" posters); defeats start counting from zero. Loading a v8 save makes its progress Skull Cove's: a save at wave 50 or below keeps its wave; one past wave 50 goes back to wave 50 so the player still fights the finale (and gets its reward), with the wave it had reached kept as its best wave, and after beating the finale it carries on from there. When the save format changes, bump the version and add a migration from the old one so existing players keep their progress.
- Loading is defensive: out-of-range or unknown values are clamped or dropped, and an unreadable save is kept aside as a backup instead of being lost.
- **Reset progress** button (between waves) wipes the save after a confirmation.

## Between-wave UI

Layout follows `ui_mock_battle.png` and `ui_mock_between_waves.png`.

- **Anchoring:** the HUD is laid out in the 480x270 base and each group sticks to its part of a bigger view: the wave/hull plaque to the top-left corner, the gold/Pearls plaque and its buttons to the top-right, the enemies-left bar to the top centre, the Shipwright (and hero picker) to the right, and the bottom button bar (and speed button) to the bottom-right, under the Shipwright, and the dev buttons (development builds) to the bottom-left. Overlays (Chests, Crew Roster, confirmations) stay centred with their dark backdrop covering the whole view.
- **Always:** a wood plaque with the wave (red "BOSS" on boss waves) and a hull bar top-left; a wood plaque with gold and Pearls top-right, with a settings button (gear: Reset progress, with a confirmation, between waves only), a sound toggle and a fullscreen toggle under it. Short messages (WAVE N CLEARED!, SHIP SUNK!, THE KRAKEN RISES!) appear in the big font on a wood plaque over the sky, some with a small detail line (gold and Pearls earned). Crew have no name labels on the ship.
- **During a wave:** an enemies-left bar at top-centre ("N ENEMIES LEFT", the fill shrinking as the wave is beaten); the **ability bar** at the bottom centre: a 26px wood button per crewmate on the ship, in slot order, with their face (cropped from their sprite), their key number (1–6) in the corner, a dark clockwise cooldown sweep over the face with the seconds left, and a pulsing 2px gold glow when ready, then the **AUTO** toggle (gold text and glow when on); and a speed button bottom-right showing the current speed (x1 / x2); clicking it toggles. At x2 everything in the battle runs twice as fast: movement, attacks, spawns, animations and effects. The speed is remembered for the rest of the session (not saved), and between waves the game always runs at normal speed. The between-wave panel and buttons are hidden.
- **Timing:** the battle runs in fixed steps of 1/240 s of game time (`SIM` in config): each frame's real time (counted as at most 0.1s, so a backgrounded tab doesn't teleport enemies) times the battle speed is spent in as many whole steps as fit, the rest carried to the next frame. Movement, attacks, cooldowns, spawns and ability effects all advance per step, so a wave plays out exactly the same at 30, 60 or 144 fps and at any battle speed. (Purely visual things, such as animations, tweens, NEW ENEMY! alerts and the storm, follow the frame clock.)
- **Dev tools (development builds only):** in the bottom-left corner of the view: "DEV ALL HEROES", "+10 PRL" and "+10 WAVE" between waves, and "DEV: AUTO-CONTINUE" (always shown). With auto-continue on, 2s after a wave is cleared the next one starts by itself, and 2s after a loss the wave is retried (Flyers ahead! is skipped). Pressing any other button (except the speed and ability buttons) or a ship slot pauses it, shown as PAUSED, until a wave is started by hand with SET SAIL!. Turning it on between waves starts the 2s countdown straight away. The speed button also cycles through x4 in development builds (`DEV` in config). None of this is in production builds.
- **Shipwright** (between waves only): a parchment panel under a wood title plate with rows for Hull (level, HP the next level adds), Build deck (decks built) and each hero on the ship (face, level, damage or The Captain's buff), each with a gold buy button showing the gold cost (grey when unaffordable, MAX when maxed). Five rows show at a time; with more, arrows by the title plate and the mouse wheel scroll it.
- **Hero picker:** click a ship slot to see every owned hero (face, rarity, level, stars and Bonus Levels and where they're placed, then their ability's name, cooldown and effect, with durations at their current level and stars), plus "Leave empty"; it replaces the Shipwright while open. It is wider than the Shipwright (260px, reaching left over the sea) with taller rows, four at a time.
- **Bottom bar** (between waves): **Map** (once an island is cleared; red dot until the map is first opened), **SET SAIL!** (starts the wave), **Chests** (with a red dot when a chest is affordable), **Crew** (the Crew Roster) and **Wanted** (the Wanted Board, with a red dot when a poster hasn't been opened).
- The reset confirmation uses the same parchment panels, wood plates and buttons.

## Later (not in v0.1)

- More enemies: Floating Skulls (high damage, low HP)
- Music (sound effects exist; no background music yet)
- Save export/import
