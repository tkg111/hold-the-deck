import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { SplashScreen } from '@capacitor/splash-screen';
import { audio } from './audio/Audio.js';
import { handleBack } from './ui/back.js';

// The Android app (Capacitor, see capacitor.config.json and android/): the
// same build as the website, inside a native shell. Its pages come from the
// APK, so it never needs the service worker.
export const isNative = () => Capacitor.isNativePlatform();

// Running as an app (the Android app, or installed from the browser and
// opened from the home screen): already fullscreen, so no fullscreen button.
export const isApp = () => isNative()
  || !!window.matchMedia?.('(display-mode: fullscreen)').matches
  || !!window.matchMedia?.('(display-mode: standalone)').matches;

// The app's own events: Android's back button (src/ui/back.js; on the
// title screen it leaves), and going to the background and back ('app-pause'
// and 'app-resume' on the game: the battle saves and marks when it was last
// seen, then pays While you were away; the sound stops meanwhile).
export function installApp(game, tutorial) {
  if (!isNative()) return;
  App.addListener('backButton', () => {
    if (!handleBack(game, tutorial)) App.exitApp();
  });
  App.addListener('pause', () => {
    audio.hold('app-paused', true);
    game.events.emit('app-pause');
  });
  App.addListener('resume', () => {
    audio.hold('app-paused', false);
    game.events.emit('app-resume');
  });
}

// Close the app (Leave port?); nothing on the web.
export function exitApp() {
  if (isNative()) App.exitApp();
}

// The launch splash (capacitor.config.json: it waits for this), hidden once
// the title screen is up.
export function hideSplash() {
  if (isNative()) SplashScreen.hide().catch(() => {});
}

// --- Haptics ---

// The Settings' Vibration (Progress.vibration), set by the battle.
let vibration = true;
export function setVibration(on) { vibration = on; }

// A buzz, in the Android app only (and with Vibration on): 'light' (a
// button press), 'medium' (a boss arrives, the hull breaks) or 'success'
// (a fish caught, a chest opened). Never waits, never throws.
export function haptic(kind) {
  if (!vibration || !isNative()) return;
  const done = kind === 'success'
    ? Haptics.notification({ type: NotificationType.Success })
    : Haptics.impact({ style: kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
  done.catch(() => {});
}
