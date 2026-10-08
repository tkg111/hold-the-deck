import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from a GitHub Pages subpath.
  base: './',
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
