# Kampung Defense — Design Doc

A Grow Castle-style idle defense web game. Players defend a Malaysian kampung stilt house from waves of folklore creatures, using heroes unlocked from packs.

Passion project — no real money, no ads, no timers. Everything is earned through play and should feel generous.

## Tech

- **Engine:** Phaser 3 + Vite (JavaScript)
- **Hosting:** GitHub Pages
- **Saving:** browser localStorage (auto-save)
- **Art (v0.1):** colored rectangles / placeholder shapes only. Real pixel art (Piskel) comes later.

## Core Loop

1. Player presses **Start Wave**.
2. Enemies spawn on the right and walk left toward the house.
3. Heroes on the house auto-attack.
4. **Wave cleared:** earn gold (+ Ang Pow on milestone waves) and advance to the next wave.
5. **House HP hits 0:** wave fails, wave number does NOT advance. House HP is restored; player can upgrade and retry. No other penalty.
6. Between waves: upgrade screen + pack button.

Waves are endless and scale in difficulty.

## The House

- Starts with **1 floor, 2 hero slots**.
- Build up to **3 floors** in v0.1. Each new floor adds 2 slots (max 6).
- Upgradeable **house HP**.
- Heroes are assigned to slots by the player; only slotted heroes fight.

## Enemies (v0.1)

| Enemy | Role | Behaviour |
|---|---|---|
| **Jerangkung** | Basic | Walks to the house and attacks it. Most of every wave. |
| **Toyol** | Fast thief | Fast, low HP. On reaching the house, steals a % of gold instead of dealing damage, then disappears. |
| **Hantu Galah** | Boss | Appears every 10 waves. Very high HP, slow, hits the house hard. |

## Heroes (v0.1)

All heroes are ranged and attack from the house.

| Hero | Rarity | Attack | Effect |
|---|---|---|---|
| **Budak Lastik** | Common | Fast, low damage | None. Free starter hero. |
| **Mak Cik Selipar** | Common | Medium speed/damage | Chance to stun |
| **Nelayan** | Rare | Slow, area | Net slows all enemies in the area |
| **Bomoh** | Epic | Medium | Curse: cursed enemies take bonus damage from all heroes |

Heroes have:
- **Level:** raised with gold. Increases damage.
- **Stars:** raised by duplicate pulls from packs. Each star gives a bigger % stat boost.

## Currencies

- **Gold:** earned per kill and per wave cleared. Spent on house HP, building floors, hero levels.
- **Ang Pow:** earned on milestone waves (e.g. every 5 waves) and boss kills. Spent on packs.

## Packs

- One pack type, bought with Ang Pow.
- Each pack gives 1 hero.
- Starting drop rates (tune during playtesting): Common 50%, Rare 30%, Epic 20%.
  (Legendary tier added later; rates get rebalanced then.)
- **New hero:** unlocked and added to the roster.
- **Duplicate:** +1 star for that hero.
- Simple card-flip reveal, glow color based on rarity.
- Should be affordable roughly every few waves.

## Starting Numbers

All placeholders, meant to be tuned once playable. Keep balance values in one config file so they're easy to tweak.

## v0.1 Build Order

Each step should leave the game playable.

1. **Core combat:** house with HP, Budak Lastik auto-shooting, Jerangkung waves, wave win/lose.
2. **Gold + upgrade screen:** between-wave screen with house HP, build floor, hero level.
3. **Enemy variety:** Toyol and Hantu Galah boss waves.
4. **Hero roster:** all 4 heroes with their effects, assigning heroes to floor slots.
5. **Packs:** Ang Pow currency, pack opening, duplicate star-ups.
6. **Save/load + deploy:** localStorage auto-save, GitHub Pages deployment.

## Later (not in v0.1)

- **Prestige: "Pindah Kampung."** Reset waves and house upgrades for permanent currency (*Semangat*) that buys permanent bonuses. Heroes and pack progress are kept.
- Active hero skills
- More enemies: Pontianak (flying, only some heroes can hit), Penanggal (floating head, high damage, low HP)
- Legendary heroes: Pendekar Silat, Tok Penghulu (buffs heroes on his floor)
- Pack pity counter
- Sound and music
- Save export/import
- Real pixel art
