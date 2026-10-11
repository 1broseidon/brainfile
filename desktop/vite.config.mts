import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [svelte({ configFile: fileURLToPath(new URL('./svelte.config.mjs', import.meta.url)) })],
  server: { port: 5199, strictPort: true },
  build: { outDir: '../../dist', emptyOutDir: true, target: 'chrome140' },
});
