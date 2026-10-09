import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from a GitHub Pages subpath.
  base: './',
  // Appended to every asset URL (see src/version.js); new on every build.
  define: {
    __ASSET_VERSION__: JSON.stringify(Date.now().toString(36)),
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
