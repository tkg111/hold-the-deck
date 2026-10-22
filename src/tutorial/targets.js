import Phaser from 'phaser';

// Spotlight targets (TutorialManager.registerTarget): a game object, or
// { scene, bounds(), shown() } for something that isn't one object (the
// crew on deck, a row of buttons). These find where one is and whether it
// can be tapped: it and every container it's in visible, not a disabled
// button, and its scene up.

const sceneUp = (scene) => {
  const status = scene?.sys.settings.status;
  return status === Phaser.Scenes.RUNNING || status === Phaser.Scenes.PAUSED;
};

function objectShown(obj) {
  if (!obj?.scene || !obj.active || !sceneUp(obj.scene)) return false;
  for (let o = obj; o; o = o.parentContainer) {
    if (!o.visible || o.alpha === 0) return false;
    if (o.enabled === false) return false;   // a disabled Button
  }
  return true;
}

export function targetShown(target) {
  if (!target) return false;
  if (target.bounds) return sceneUp(target.scene) && (target.shown?.() ?? true) && !!target.bounds();
  return objectShown(target);
}

// The target's rectangle in its scene's world, and that scene (null if
// it isn't shown).
export function targetRect(target) {
  if (!targetShown(target)) return null;
  if (target.bounds) return { rect: target.bounds(), scene: target.scene };
  return { rect: target.getBounds(), scene: target.scene };
}

// The union of some objects' bounds (the visible ones), or null.
export function unionBounds(objects) {
  let out = null;
  for (const o of objects) {
    if (!objectShown(o)) continue;
    const b = o.getBounds();
    out = out ? Phaser.Geom.Rectangle.Union(out, b, out) : b;
  }
  return out;
}
