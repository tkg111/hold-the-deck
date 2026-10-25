import { MOBILE } from './config.js';
import { isNative } from './native.js';
import { UpdateGate } from './systems/UpdateGate.js';
import { tutorial } from './tutorial/TutorialManager.js';

// The game as an installable app (see vite.config.js for the manifest and
// the service worker): installing from Settings, and new versions.

// --- Installing ---

// Chrome's install prompt, kept for Settings' Install game button (only
// fired when the game can be installed and isn't yet). Caught as early as
// possible: this module loads first.
let installEvent = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installEvent = event;
  });
  window.addEventListener('appinstalled', () => { installEvent = null; });
}

// Running as the installed app (from the home screen).
export const isInstalled = () => window.matchMedia?.('(display-mode: standalone)').matches
  || window.matchMedia?.('(display-mode: fullscreen)').matches
  || navigator.standalone === true;

// iPhone and iPad (iPadOS says it's a Mac, but has touch): no install
// prompt, only Share > Add to Home Screen.
const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// What Settings offers: 'prompt' (the Install game button), 'ios' (how to
// add it to the home screen) or null (installed, or not installable).
export function installOption() {
  if (isInstalled()) return null;
  if (installEvent) return 'prompt';
  return isIos() ? 'ios' : null;
}

// Show the browser's install prompt (the event can only be used once).
export async function promptInstall() {
  const event = installEvent;
  if (!event) return false;
  installEvent = null;
  event.prompt();
  const { outcome } = await event.userChoice.catch(() => ({ outcome: 'dismissed' }));
  return outcome === 'accepted';
}

// --- New versions ---

const UPDATE_LINE = "A new version's in port! Tap to update.";

// Register the service worker (built games only) and, when it has a new
// version waiting, show the Captain's banner once the battle is between
// waves with nothing open; tapping it saves and reloads (UpdateGate: a wave
// started since waits to end). The Android app updates with its APK: a
// worker there would keep serving the old version's cache, so none is
// registered (and one left from an earlier build is removed).
export async function installPwa(game) {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  if (isNative()) {
    const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
    for (const r of regs) r.unregister();
    return;
  }
  const battle = () => game.scene.getScene('GameScene');
  let updateSW = null;
  const gate = new UpdateGate({
    isBusy: () => battle()?.state === 'running',
    save: () => battle()?.progress && battle().save(),
    reload: () => updateSW(true),
  });
  let shown = false;
  const quiet = () => {
    const gs = battle();
    return gs?.progress && gs.state === 'idle' && !gs.modalOpen && !gs.overlayOpen && !gs.awayOpen;
  };
  const tryShow = () => {
    if (!gate.available || shown || !quiet()) return;
    shown = true;
    tutorial.view?.banner({
      text: UPDATE_LINE, face: 'talk0', sticky: true, onTap: () => gate.request(),
    });
  };
  // A tap during a wave: the update happens when it ends. (Scene events
  // outlive restarts.)
  game.events.once('ready', () => battle().events.on('wave-ended', () => gate.settle()));
  const { registerSW } = await import('virtual:pwa-register');
  updateSW = registerSW({
    onNeedRefresh() {
      gate.offer();
      tryShow();
    },
  });
  setInterval(tryShow, MOBILE.updateCheckMs);
}
