import {
  AdMob, AdmobConsentStatus, RewardAdPluginEvents,
} from '@capacitor-community/admob';
import { ADS } from '../config.js';

// The Android app's ad provider: AdMob rewarded ads through
// @capacitor-community/admob, with ADS.admob's IDs (Google's test IDs until
// the game has its own). The SDK starts on the first ad asked for. An ad
// counts as watched once AdMob says the reward was earned (Rewarded) and
// the ad has been closed (Dismissed); closed before that, or failing to
// load or show, it doesn't.
export function admobProvider() {
  let started = null;
  const start = () => {
    started ??= (async () => {
      await AdMob.initialize({ initializeForTesting: ADS.admob.testing });
      await consent();
    })().catch((err) => {
      started = null;
      throw err;
    });
    return started;
  };
  return {
    name: 'admob',
    free: false,
    async show() {
      await start();
      let earned = false;
      const handles = [];
      const done = new Promise((resolve) => {
        const on = (event, fn) => AdMob.addListener(event, fn).then((h) => handles.push(h));
        on(RewardAdPluginEvents.Rewarded, () => { earned = true; });
        on(RewardAdPluginEvents.Dismissed, () => resolve(earned ? 'rewarded' : 'closed'));
        on(RewardAdPluginEvents.FailedToShow, () => resolve('unavailable'));
      });
      try {
        await AdMob.prepareRewardVideoAd({ adId: ADS.admob.rewarded, isTesting: ADS.admob.testing });
        // (It resolves only once the reward is earned, so don't wait on it.)
        AdMob.showRewardVideoAd().catch(() => {});
        return await done;
      } catch {
        return 'unavailable';
      } finally {
        for (const h of handles) h.remove();
      }
    },
  };
}

// UMP consent (GDPR): ask for the consent info and show Google's form when
// it's required.
// TODO(release): this is a stub. Before any release, finish it with a real
// AdMob account: set up the GDPR message (Privacy & messaging) for the
// app, check the form shows for EEA/UK users (requestConsentInfo with
// debugGeography to test), only request ads when consent allows
// (canRequestAds), and add a "Privacy options" entry in Settings when
// privacyOptionsRequirementStatus is REQUIRED (AdMob.showPrivacyOptionsForm).
async function consent() {
  try {
    const info = await AdMob.requestConsentInfo();
    if (info.isConsentFormAvailable && info.status === AdmobConsentStatus.REQUIRED) await AdMob.showConsentForm();
  } catch {
    // No consent info (offline, no message set up yet): carry on with test ads.
  }
}
