import { initMusic, preloadMusic } from './Music.js';
import { sfx } from './Sfx.js';

// Queue the music and sound effects (after preloadSprites, whose loader hook
// versions every URL). Already-loaded keys are skipped, so every scene that
// might load first can call it. The loader's path is put back after: files
// queued later (the sprite sheets animations.json lists) still use it.
export function preloadAudio(scene) {
  const { path } = scene.load;
  scene.load.setPath(import.meta.env.BASE_URL);
  sfx.preload(scene);
  preloadMusic(scene);
  scene.load.setPath(path);
}

// Hand what loaded to the synth and the sound effects (decoded in the
// background).
export function initAudio(scene) {
  initMusic(scene);
  sfx.decode(scene);
}
