import { Capacitor } from '@capacitor/core';

// The Android app (Capacitor, see capacitor.config.json and android/): the
// same build as the website, inside a native shell. Its pages come from the
// APK, so it never needs the service worker.
export const isNative = () => Capacitor.isNativePlatform();
