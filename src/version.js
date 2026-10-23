// Every asset URL carries the build's version (set in vite.config.js), so
// after a deploy browsers fetch the new data files and sheets instead of
// mixing cached old ones (GitHub Pages caches for 10 minutes) with new code.
// eslint-disable-next-line no-undef
export const ASSET_VERSION = __ASSET_VERSION__;

export const versioned = (url) => `${url}${url.includes('?') ? '&' : '?'}v=${ASSET_VERSION}`;

// package.json's version (the title screen shows it).
// eslint-disable-next-line no-undef
export const APP_VERSION = __APP_VERSION__;
