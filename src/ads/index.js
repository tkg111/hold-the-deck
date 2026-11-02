import { ADS } from '../config.js';
import { audio } from '../audio/Audio.js';
import { isNative } from '../native.js';
import { admobProvider } from './admob.js';
import { mockProvider } from './mock.js';
import { webProvider } from './web.js';

// Rewarded ads: one service, ads.showRewarded(placement) -> Promise<boolean>,
// true only when an ad was watched to the end (then, and only then, the
// caller grants the reward). Placements: 'speed4x' and 'auto' (ADS.passes).
// The game only calls it from a button the player tapped that says the
// reward first. Providers:
//   mock:  dev builds (and ?mockads on the live site): a 5-second "AD"
//          overlay with a countdown, then Close (?adfail: no ad loads).
//   admob: the Android app, @capacitor-community/admob with ADS.admob's
//          (test) IDs.
//   web:   the website (GitHub Pages): no ads; the reward is granted at
//          once, so testers aren't held up.
// After a call, ads.lastError says why it was false: 'unavailable' (no ad
// loaded or it failed to show), 'cooldown' (ADS.cooldownMs since the last
// ad hasn't passed; ads.cooldownLeft() says how long), 'closed' (closed
// before the end) or 'busy' (one already showing).

const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();

function pickProvider() {
  if (import.meta.env?.DEV || params.has('mockads')) return mockProvider({ fail: params.has('adfail') });
  if (isNative()) return admobProvider();
  return webProvider();
}

// The service over a provider ({ name, free, show(placement) ->
// Promise<'rewarded' | 'closed' | 'unavailable'> }), with the clock for the
// cooldown (now).
export function createAds(provider, { now = () => Date.now() } = {}) {
  let lastAt = -Infinity;
  let showing = false;
  const service = {
    provider,
    // No ads here: the reward comes at once (the website).
    get free() { return !!provider.free; },
    lastError: null,
    // ms until another ad may be shown.
    cooldownLeft() {
      return provider.free ? 0 : Math.max(0, lastAt + ADS.cooldownMs - now());
    },
    async showRewarded(placement) {
      service.lastError = null;
      if (!ADS.passes[placement]) throw new Error(`Unknown ad placement: ${placement}`);
      if (showing) {
        service.lastError = 'busy';
        return false;
      }
      if (service.cooldownLeft() > 0) {
        service.lastError = 'cooldown';
        return false;
      }
      showing = true;
      if (!provider.free) audio.hold?.('ad', true);
      let result;
      try {
        result = await provider.show(placement);
      } catch {
        result = 'unavailable';
      } finally {
        showing = false;
        if (!provider.free) audio.hold?.('ad', false);
      }
      if (result !== 'unavailable' && !provider.free) lastAt = now();
      if (result === 'rewarded') return true;
      service.lastError = result;
      return false;
    },
  };
  return service;
}

export const ads = createAds(pickProvider());
