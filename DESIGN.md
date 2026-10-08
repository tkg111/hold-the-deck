# Kampung Defense — Design Doc

A Grow Castle-style idle defense web game. Players defend a Malaysian kampung stilt house from waves of folklore creatures, using heroes unlocked from packs.

Passion project — no real money, no ads, no timers. Everything is earned through play and should feel generous.

## Tech

- **Engine:** Phaser 3 + Vite (JavaScript)
- **Hosting:** GitHub Pages
- **Saving:** browser localStorage (auto-save), versioned so old saves can be migrated
- **Art (v0.1):** colored rectangles / placeholder shapes only. Real pixel art (Piskel) comes later.

## Core Loop

1. Player presses **Start Wave**. House HP is refilled to full before every wave.
2. Enemies spawn on the right and walk left toward the house.
3. Heroes on the house auto-attack.
4. **Wave cleared:** earn gold and Ang Pow (see Currencies) and advance to the next wave.
5. **House HP hits 0:** wave fails, wave number does NOT advance. Gold earned from kills during the attempt is kept. Player can upgrade and retry. No other penalty.
6. Between waves: upgrade screen, hero slot assignment, pack button.

Waves are endless and scale in difficulty.

## The House

- Starts with **1 floor, 2 hero slots**.
- Build up to **3 floors** in v0.1. Each new floor adds 2 slots (max 6) and **+50 max HP**, so a floor is useful even before there are heroes to fill it.
- Upgradeable **house HP** (+25 max HP per level).
- Heroes are assigned to slots by the player between waves (click a slot, pick an owned hero; picking a hero already placed elsewhere swaps them). Only slotted heroes fight.

## Enemies (v0.1)

| Enemy | Role | Behaviour |
|---|---|---|
| **Jerangkung** | Basic | Walks to the house and attacks it. Most of every wave. |
| **Toyol** | Fast thief | Fast, low HP. On reaching the house, steals a % of gold instead of dealing damage, then disappears. |
| **Hantu Galah** | Boss | Appears every 10 waves with a reduced escort. Very high HP, slow, hits the house hard. **Status resist:** stun and slow last half as long on it, so it can't be stun-locked. |

## Heroes (v0.1)

All heroes are ranged and attack from the house.

| Hero | Rarity | Attack | Effect |
|---|---|---|---|
| **Budak Lastik** | Common | Fast, low damage | None. Free starter hero. |
| **Mak Cik Selipar** | Common | Medium speed/damage | 25% chance to stun for 1s (no movement or attacks) |
| **Nelayan** | Rare | Slow, area | Net slows all enemies in the area by 50% for 2.5s (movement and attack speed) |
| **Bomoh** | Epic | Medium | Curse: cursed enemies take +30% damage from all heroes for 4s. Prefers targets that aren't cursed yet. |

Status effects are shown on the enemy: yellow circling stars (stunned), blue net (slowed), pulsing purple aura (cursed).

Heroes have:
- **Level:** raised with gold. +20% base damage per level.
- **Stars:** raised by duplicate pulls from packs, max 5. Each star adds a bigger damage bonus than the last: total bonus +10% / +25% / +45% / +70% / +100% at 1–5 stars.

## Currencies

- **Gold:** earned per kill and per wave cleared. Spent on house HP, building floors, hero levels. Toyol steal a share of it.
- **Ang Pow:** spent on packs. Earned from:
  - **Start:** 3, enough to open the first pack right away.
  - **Every wave clear:** +1.
  - **Milestone waves** (every 5th): +5 on top.
  - **Boss kills:** +5, once per boss wave (killing the boss and then losing the wave doesn't pay it again on the retry).

## Packs

- One pack type, bought with Ang Pow.
- Each pack gives 1 hero.
- Starting drop rates (tune during playtesting): Common 50%, Rare 30%, Epic 20%.
  (Legendary tier added later; rates get rebalanced then.)
- Costs 3 Ang Pow. Rates are renormalized over rarities that actually have heroes, so an empty tier never breaks the odds.
- **New hero:** unlocked, added to the roster, and automatically placed in the first free slot if there is one.
- **Duplicate:** +1 star for that hero. A duplicate of a 5-star hero refunds 1 Ang Pow instead.

### Opening a pack

1. **Build-up:** the red envelope shakes harder and glows brighter. Rarer pulls build up longer and shake harder (Common 0.7s / Rare 1.3s / Epic 2.0s). The glow starts envelope-gold and shifts to the rarity colour over the last 45% of the build-up, so the player gets a hint just before the reveal. A synthesized rattle-and-rising-hum plays over it.
2. **Flip:** the card flips (whoosh sound) to the hero's card.
3. **Reveal:** a chime that gets longer and higher with rarity; the card glows in its rarity colour. New heroes also get a sparkle sound and a **confetti burst** (40 / 90 / 160 pieces for Common / Rare / Epic).
4. **New-hero splash:** the first time a hero is pulled, a big intro card appears over rotating light rays: "NEW HERO!", the card with name and rarity, and the hero's one-line **Manglish catchphrase** (stored per hero in config). Click to continue. Duplicates skip the splash.

- Should be affordable roughly every few waves. With the current numbers it is faster than that: 10 waves pay 25 Ang Pow (10 per-wave + 10 milestone + 5 boss), about 8 packs, so tune `PACKS.cost` or the rewards if pulls feel too frequent.

## Collection Book

- Opened from the **Collection** button between waves.
- Shows every hero in the game with an "N/M collected" count.
- Owned heroes appear as their card with level and stars. Unowned heroes are dark silhouettes with "???" for the name, so the player can see how many are left to find without spoiling who they are.

## Sound

- All sound effects are synthesized with the Web Audio API; there are no audio files.
- Current effects: pack build-up, card flip, reveal chime (scales with rarity), new-hero sparkle, UI clicks.
- **Sound: On/Off** toggle on the main screen (usable mid-wave), saved with progress.

## Starting Numbers

All placeholders, meant to be tuned once playable. Every balance value lives in `src/config.js`; the numbers quoted in this doc are the current values there, and the config wins if they ever disagree.

## v0.1 Build Order

Each step should leave the game playable.

1. **Core combat:** house with HP, Budak Lastik auto-shooting, Jerangkung waves, wave win/lose.
2. **Gold + upgrade screen:** between-wave screen with house HP, build floor, hero level.
3. **Enemy variety:** Toyol and Hantu Galah boss waves.
4. **Hero roster:** all 4 heroes with their effects, assigning heroes to floor slots.
5. **Packs:** Ang Pow currency, pack opening, duplicate star-ups.
6. **Save/load + deploy:** localStorage auto-save, GitHub Pages deployment.

## Saving

- Auto-saves after every wave ends, every upgrade, every pack opened and every slot change, plus when the page is hidden or closed.
- Saves carry a version number. When the save format changes (e.g. prestige), bump the version and add a migration from the old one so existing players keep their progress.
- Loading is defensive: out-of-range or unknown values are clamped or dropped, and an unreadable save is kept aside as a backup instead of being lost.
- **Reset progress** button (between waves) wipes the save after a confirmation.

## Later (not in v0.1)

- **Prestige: "Pindah Kampung."** Reset waves and house upgrades for permanent currency (*Semangat*) that buys permanent bonuses. Heroes and pack progress are kept.
- Active hero skills
- More enemies: Pontianak (flying, only some heroes can hit), Penanggal (floating head, high damage, low HP)
- Legendary heroes: Pendekar Silat, Tok Penghulu (buffs heroes on his floor)
- Pack pity counter
- Music (sound effects exist; no background music yet)
- Save export/import
- Real pixel art
