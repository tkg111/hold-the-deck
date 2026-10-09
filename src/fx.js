import { fxKey } from './sprites.js';

// Effect sprites from public/sprites/fx/ (see fx.json), drawn at 1x.

// Projectiles and impacts draw over the scene and its overlays; UI is higher.
export const FX_DEPTH = 5;

// A sprite of the effect `name` at (x, y), playing its animation if it has one
// (looping or once, as fx.json says).
export function fxSprite(scene, name, x, y) {
  const key = fxKey(name);
  const sprite = scene.add.sprite(x, y, key, 0);
  if (scene.anims.exists(key)) sprite.play(key);
  return sprite;
}

// A one-shot effect (an impact) at (x, y) that removes itself when done.
export function playFx(scene, name, x, y, depth = FX_DEPTH) {
  const sprite = fxSprite(scene, name, x, y).setDepth(depth);
  if (sprite.anims.isPlaying) sprite.once('animationcomplete', () => sprite.destroy());
  else scene.time.delayedCall(100, () => sprite.destroy());
  return sprite;
}

// Frame size of an effect sheet, e.g. to size what it covers.
export function fxSize(scene, name) {
  const frame = scene.textures.getFrame(fxKey(name), 0);
  return { width: frame.width, height: frame.height };
}
