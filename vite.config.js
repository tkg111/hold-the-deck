import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// The page's colour on launch and the phone's status bar (the title's sky).
const APP_COLOR = '#2a1e4a';

export default defineConfig({
  // Relative base so the build works from a GitHub Pages subpath.
  base: './',
  // Appended to every asset URL (see src/version.js); new on every build.
  define: {
    __ASSET_VERSION__: JSON.stringify(Date.now().toString(36)),
    // package.json's version, for the title screen's label.
    __APP_VERSION__: JSON.stringify(version),
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
  plugins: [
    // Installable, and playable offline after the first visit: the service
    // worker precaches the whole build (code, sprites, sounds, music, fonts).
    // A new version waits until the player taps the Captain's banner
    // (src/pwa.js), so it never reloads mid-wave.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: './',
        name: 'Hold the Deck',
        short_name: 'Hold the Deck',
        description: 'Pirate idle defense: crew your ship and hold the deck against wave after wave.',
        // Relative to the manifest, so they follow the Pages subpath (base).
        start_url: './',
        scope: './',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'landscape',
        background_color: APP_COLOR,
        theme_color: APP_COLOR,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,json,xml,fnt,ogg,mp3,webmanifest}'],
        // Previews and art sources left in public/ aren't loaded by the game.
        globIgnores: ['**/*preview*', '**/storm_and_map/**'],
        // Phaser's bundle is bigger than Workbox's 2 MB default.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // Asset URLs carry ?v=<build> (src/version.js); the precache's own
        // revisions do that job here, so the same file matches either way.
        ignoreURLParametersMatching: [/^v$/],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
