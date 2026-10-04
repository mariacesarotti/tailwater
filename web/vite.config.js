import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: '/tailwater/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        sculpt: resolve(import.meta.dirname, 'sculpt.html'),
      },
    },
  },
});