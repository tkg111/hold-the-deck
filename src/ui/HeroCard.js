import { HEROES, PACKS, RARITY } from '../config.js';
import { describeHero } from './HeroPicker.js';

const BASE_W = 190;
const BASE_H = 250;
const TEXT = { fontFamily: 'sans-serif', color: '#ffffff' };

// A hero card as a Container centered on (x, y). Sizes and fonts are multiplied
// by `scale` (rather than scaling the container) so text stays crisp.
//   stars:      number to show a 5-star row, or null to hide it
//   level:      number to show "Lv N", or null to hide it
//   silhouette: draw an unknown, not-yet-collected hero
export function createHeroCard(scene, x, y, id, { scale = 1, stars = null, level = null, silhouette = false } = {}) {
  const s = (n) => n * scale;
  const px = (n) => `${Math.round(n * scale)}px`;
  const w = s(BASE_W);
  const h = s(BASE_H);
  const def = HEROES[id];
  const rarity = RARITY[def.rarity];
  const card = scene.add.container(x, y);

  if (silhouette) {
    card.add([
      scene.add.rectangle(0, 0, w, h, 0x1c2128).setStrokeStyle(s(4), 0x37474f),
      scene.add.rectangle(0, -h / 2 + s(18), w, s(36), 0x37474f),
      scene.add.text(0, -h / 2 + s(18), '???', { ...TEXT, fontSize: px(15), fontStyle: 'bold', color: '#90a4ae' })
        .setOrigin(0.5),
      scene.add.rectangle(0, s(-32), s(52), s(76), 0x000000).setStrokeStyle(s(3), 0x000000),
      scene.add.text(0, s(30), '???', { ...TEXT, fontSize: px(20), fontStyle: 'bold', color: '#78909c' })
        .setOrigin(0.5),
      scene.add.text(0, s(58), 'Not collected yet', { ...TEXT, fontSize: px(12), color: '#607d8b' })
        .setOrigin(0.5, 0),
    ]);
    return card;
  }

  card.add([
    scene.add.rectangle(0, 0, w, h, 0xfdf6e3).setStrokeStyle(s(5), rarity.color),
    scene.add.rectangle(0, -h / 2 + s(18), w, s(36), rarity.color),
    scene.add.text(0, -h / 2 + s(18), rarity.label.toUpperCase(), { ...TEXT, fontSize: px(15), fontStyle: 'bold' })
      .setOrigin(0.5),
    scene.add.rectangle(0, s(-32), s(52), s(76), def.color).setStrokeStyle(s(3), 0x1b1b1b),
    scene.add.text(0, s(22), def.name, { ...TEXT, fontSize: px(18), fontStyle: 'bold', color: '#3e2723' })
      .setOrigin(0.5),
  ]);
  let textY = s(40);
  if (level != null) {
    card.add(scene.add.text(0, textY, `Lv ${level}`, { ...TEXT, fontSize: px(13), color: '#6d4c41', fontStyle: 'bold' })
      .setOrigin(0.5, 0));
    textY += s(18);
  }
  card.add(scene.add.text(0, textY + s(2), describeHero(def), {
    ...TEXT, fontSize: px(11), color: '#5d4037', align: 'center', wordWrap: { width: w - s(24) },
  }).setOrigin(0.5, 0));

  if (stars != null) {
    const row = '★'.repeat(stars) + '☆'.repeat(PACKS.maxStars - stars);
    card.add(scene.add.text(0, h / 2 - s(20), row, { ...TEXT, fontSize: px(18), color: '#f9a825' }).setOrigin(0.5));
  }
  return card;
}

export const HERO_CARD_SIZE = { width: BASE_W, height: BASE_H };
