import { HEROES, PACKS, RARITY, SPRITES } from '../config.js';
import { cssColor } from './format.js';
import { describeHero } from './HeroPicker.js';
import { onParchment, outlined, panel, px, starRow, subText, text, UI } from './kit.js';

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
//   level:      number to show "LV N", or null to hide it
//   silhouette: an unknown, not-yet-collected hero: wood card, black sprite
export function createHeroCard(scene, x, y, id, {
  size = 'large', stars = null, level = null, silhouette = false,
} = {}) {
  const S = SIZES[size];
  const def = HEROES[id];
  const rarity = RARITY[def.rarity];
  const w = px(S.w);
  const h = px(S.h);
  const top = -h / 2;
  const card = scene.add.container(x, y);

  card.add(panel(scene, -w / 2, top, w, h, silhouette ? 'wood' : 'parchment'));
  card.add(panel(scene, -w / 2, top, w, px(S.plate), 'wood'));
  card.add(text(scene, 0, top + px(S.plate / 2), silhouette ? '???' : rarity.label.toUpperCase(), {
    font: 'small', ...outlined({ color: silhouette ? UI.colors.subText : rarityColorOnWood(def.rarity) }),
  }).setOrigin(0.5));

  // Sprite standing on a line below the plate.
  const feetY = top + px(S.plate + 2) + px(32 * S.spriteScale);
  card.add(heroPortrait(scene, id, feetY, S.spriteScale, silhouette));

  let ty = feetY + px(1);
  card.add(text(scene, 0, ty, silhouette ? '???' : def.name, silhouette ? outlined() : onParchment())
    .setOrigin(0.5, 0));
  ty += px(15);
  if (silhouette) {
    card.add(text(scene, 0, ty + px(2), 'NOT FOUND YET', subText({ color: UI.colors.text })).setOrigin(0.5, 0));
    return card;
  }
  if (stars != null) {
    card.add(starRow(scene, 0, ty + px(3), stars, PACKS.maxStars));
    ty += px(8);
  }
  if (level != null) {
    card.add(text(scene, 0, ty, `LV ${level}`, subText()).setOrigin(0.5, 0));
    ty += px(10);
  }
  if (S.effect) {
    card.add(text(scene, 0, ty + px(1), describeHero(def).toUpperCase(),
      subText({ align: 'center', wrap: w - px(10) })).setOrigin(0.5, 0));
  }
  return card;
}

// Rarity colours are picked for dark backgrounds, which the wood plate is.
const rarityColorOnWood = (rarity) => cssColor(RARITY[rarity].color);

// The hero's single sprite (or a rectangle in their colour without one),
// feet at feetY. Black for a silhouette.
function heroPortrait(scene, id, feetY, scale, silhouette) {
  const sprite = SPRITES.heroes[id];
  if (!sprite) {
    return scene.add.rectangle(0, feetY, px(16 * scale), px(26 * scale), silhouette ? 0x000000 : HEROES[id].color)
      .setOrigin(0.5, 1);
  }
  const image = scene.add.image(0, feetY, sprite.key).setOrigin(0.5, 1).setScale(px(scale));
  if (silhouette) image.setTintFill(0x000000);
  return image;
}

export const HERO_CARD_SIZE = {
  large: { width: px(SIZES.large.w), height: px(SIZES.large.h) },
  small: { width: px(SIZES.small.w), height: px(SIZES.small.h) },
};
