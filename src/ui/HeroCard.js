import { HEROES, PACKS, RARITY, SPRITES, UI_KIT } from '../config.js';
import { cssColor } from './format.js';
import { describeHero } from './HeroPicker.js';
import { antiAirIcon, dark, hitsFlyers, light, panel, starRow, subText, text, UI } from './kit.js';

// Card sizes in art pixels. 'large' is the chest reveal and new-crewmate
// splash; 'small' fits ten to a screen in the Crew Roster (no effect text).
const SIZES = {
  large: { w: 112, h: 158, plate: 16, spriteScale: 2, effect: true },
  small: { w: 88, h: 116, plate: 14, spriteScale: 2, effect: false },
};

// A hero card as a Container centred on (x, y): parchment under a wood plate
// naming the rarity, the hero's single sprite at a whole-number scale, name,
// stars, level and effect.
//   size:       'large' or 'small'
//   stars:      number to show a row of pixel stars, or null to hide it
//   bonus:      Bonus Levels, shown as "+N" after the stars (0: nothing)
//   level:      number to show "LV N", or null to hide it
//   silhouette: an unknown, not-yet-collected hero: wood card, black sprite
export function createHeroCard(scene, x, y, id, {
  size = 'large', stars = null, bonus = 0, level = null, silhouette = false,
} = {}) {
  const S = SIZES[size];
  const def = HEROES[id];
  const rarity = RARITY[def.rarity];
  const w = S.w;
  const h = S.h;
  const top = -h / 2;
  const card = scene.add.container(x, y);

  card.add(panel(scene, -w / 2, top, w, h, silhouette ? 'wood' : 'parchment'));
  card.add(panel(scene, -w / 2, top, w, S.plate, 'wood'));
  card.add(text(scene, 0, top + (S.plate / 2), silhouette ? '???' : rarity.label.toUpperCase(), {
    font: 'small', ...light({ color: silhouette ? UI.colors.subText : rarityColorOnWood(def.rarity) }),
  }).setOrigin(0.5));

  // Sprite standing on a line below the plate.
  const feetY = top + (S.plate + 2) + (32 * S.spriteScale);
  card.add(heroPortrait(scene, id, feetY, S.spriteScale, silhouette));
  // Anti-air crew: a mark in the top-right corner under the plate.
  if (!silhouette && hitsFlyers(def)) card.add(antiAirIcon(scene, w / 2 - 8, top + S.plate + 7));

  let ty = feetY + 1;
  card.add(text(scene, 0, ty, silhouette ? '???' : def.name, silhouette ? light() : dark())
    .setOrigin(0.5, 0));
  ty += 15;
  if (silhouette) {
    card.add(text(scene, 0, ty + 2, 'NOT FOUND YET', light({ font: 'small' })).setOrigin(0.5, 0));
    return card;
  }
  if (stars != null) {
    // With Bonus Levels the stars shift left to make room for "+N".
    const plus = bonus > 0 ? text(scene, 0, ty, `+${bonus}`, subText({ color: UI_KIT.starColor })) : null;
    const shift = plus ? Math.ceil((plus.inkWidth + 2) / 2) : 0;
    card.add(starRow(scene, -shift, ty + 3, stars, PACKS.maxStars));
    if (plus) card.add(plus.setPosition(Math.round(-shift + STAR_ROW_HALF + 2), ty));
    ty += 8;
  }
  if (level != null) {
    card.add(text(scene, 0, ty, `LV ${level}`, subText()).setOrigin(0.5, 0));
    ty += 10;
  }
  if (S.effect) {
    card.add(text(scene, 0, ty + 1, describeHero(def).toUpperCase(),
      subText({ align: 'center', wrap: w - 10 })).setOrigin(0.5, 0));
  }
  return card;
}

// Half the width of a full row of pixel stars (see starRow in kit.js).
const STAR_ROW_HALF = Math.ceil((PACKS.maxStars * 5 + (PACKS.maxStars - 1)) / 2);

// Rarity colours are picked for dark backgrounds, which the wood plate is.
const rarityColorOnWood = (rarity) => cssColor(RARITY[rarity].color);

// The hero's single sprite (or a rectangle in their colour without one),
// feet at feetY. Black for a silhouette.
function heroPortrait(scene, id, feetY, scale, silhouette) {
  const sprite = SPRITES.heroes[id];
  if (!sprite) {
    return scene.add.rectangle(0, feetY, (16 * scale), (26 * scale), silhouette ? 0x000000 : HEROES[id].color)
      .setOrigin(0.5, 1);
  }
  const image = scene.add.image(0, feetY, sprite.key).setOrigin(0.5, 1).setScale(scale);
  if (silhouette) image.setTintFill(0x000000);
  return image;
}

export const HERO_CARD_SIZE = {
  large: { width: SIZES.large.w, height: SIZES.large.h },
  small: { width: SIZES.small.w, height: SIZES.small.h },
};
