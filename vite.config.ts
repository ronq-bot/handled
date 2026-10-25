import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  // Keep Vite from picking up a PostCSS config from a parent directory.
  css: { postcss: {} },
  build: { outDir: 'dist', target: 'es2020' },
});
