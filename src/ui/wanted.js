import { ENEMIES, UI_KIT, WANTED } from '../config.js';
import { sheetKey } from '../sprites.js';
import { hexColor, UI, WANTED_JSON_KEY, wantedKey } from './kit.js';

// Wanted Board pieces shared by the board (WantedScene) and the battle's
// "NEW ENEMY!" alert: posters, enemy portraits and trait chips.

// Traits shown as chips (icon + label), in this order, by what an enemy does.
const TRAITS = [
  { key: 'boss', label: 'BOSS', has: (def) => def.boss },
  { key: 'flying', label: 'FLYING', has: (def) => def.flies },
  { key: 'armoured', label: 'ARMOURED', has: (def) => def.armor },
  { key: 'shielded', label: 'SHIELDED', has: (def) => def.shield },
  { key: 'explodes', label: 'EXPLODES', has: (def) => def.blast },
  { key: 'support', label: 'SUPPORT', has: (def) => def.song },
];

export const traitsOf = (def) => TRAITS.filter((t) => t.has(def));
export const traitIconKey = (trait) => wantedKey(`trait_${trait.key}`);

// Poster layout from wanted.json: size, where the enemy goes (enemyAt,
// enemyBox), the stamp's spot and the selection frame's offset.
export function wantedLayout(scene) {
  const json = scene.cache.json.get(WANTED_JSON_KEY);
  const [w, h] = json.poster.size;
  const [ex, ey] = json.poster.enemyAt;
  const [bw, bh] = json.poster.enemyBox;
  const [sx, sy] = json.poster.stampAt;
  const [ox, oy] = json.select.offset;
  return { width: w, height: h, enemyX: ex, enemyY: ey, boxW: bw, boxH: bh, stampX: sx, stampY: sy, selectX: ox, selectY: oy };
}

// Frame 0 of the enemy's sheet as two extra frames on its texture: 'wanted_face'
// (32x32: the whole frame, or for bigger sprites the crop at def.face) and
// 'wanted_poster' (the poster's box, the face's bottom rows so feet show).
function portraitFrames(scene, id) {
  const def = ENEMIES[id];
  const key = sheetKey(def.sprite);
  if (!scene.textures.exists(key)) return null;
  const texture = scene.textures.get(key);
  if (!texture.has('wanted_face')) {
    const { boxW, boxH } = wantedLayout(scene);
    const base = texture.get(0);
    const fx = base.cutX + (def.face?.x ?? 0);
    const fy = base.cutY + (def.face?.y ?? 0);
    const first = texture.firstFrame;
    texture.add('wanted_face', base.sourceIndex, fx, fy, 32, 32);
    texture.add('wanted_poster', base.sourceIndex, fx, fy + 32 - boxH, boxW, boxH);
    texture.firstFrame = first;  // adding frames mustn't change the default
  }
  return key;
}

// The enemy's 32x32 portrait (face) at scale, top-left at (x, y); a block
// in its colour if its sheet is missing.
export function enemyPortrait(scene, x, y, id, scale = 1) {
  const key = portraitFrames(scene, id);
  if (!key) return scene.add.rectangle(x, y, 32 * scale, 32 * scale, ENEMIES[id].color).setOrigin(0);
  return scene.add.image(x, y, key, 'wanted_face').setOrigin(0).setScale(scale);
}

// The poster's picture of the enemy (its box, 32x30), top-left at (x, y),
// for small rows (the Captain's Log); a block in its colour if its sheet is
// missing.
export function enemyThumb(scene, x, y, id) {
  const key = portraitFrames(scene, id);
  const { boxW, boxH } = wantedLayout(scene);
  if (!key) return scene.add.rectangle(x, y, boxW, boxH, ENEMIES[id].color).setOrigin(0);
  return scene.add.image(x, y, key, 'wanted_poster').setOrigin(0);
}

// A poster as a container with its top-left at (x, y): poster.png with the
// enemy drawn in its box and the highest bounty stamp earned, or
// poster_unknown.png for a type not met yet. unseen: a red dot (not opened).
export function createPoster(scene, x, y, id, progress, { unseen = false } = {}) {
  const L = wantedLayout(scene);
  const poster = scene.add.container(x, y);
  if (!progress.isDiscovered(id)) {
    poster.add(scene.add.image(0, 0, wantedKey('poster_unknown')).setOrigin(0));
    return poster;
  }
  poster.add(scene.add.image(0, 0, wantedKey('poster')).setOrigin(0));
  const key = portraitFrames(scene, id);
  poster.add(key
    ? scene.add.image(L.enemyX, L.enemyY, key, 'wanted_poster').setOrigin(0)
    : scene.add.rectangle(L.enemyX, L.enemyY, L.boxW, L.boxH, ENEMIES[id].color).setOrigin(0));
  const tier = progress.bountyTier(id);
  if (tier > 0) {
    poster.add(scene.add.image(L.stampX, L.stampY, wantedKey(`stamp_${WANTED.bounties[tier - 1].tier}`)).setOrigin(0));
  }
  if (unseen) {
    poster.add(scene.add.circle(WANTED.unseenDot.x, WANTED.unseenDot.y, UI_KIT.dotRadius, hexColor(UI.colors.warn))
      .setStrokeStyle(1, hexColor(UI.colors.textOnParchment)));
  }
  return poster;
}
