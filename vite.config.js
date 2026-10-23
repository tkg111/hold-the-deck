import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

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
});
