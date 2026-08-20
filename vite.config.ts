import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ command }) => ({
  // En dev, le serveur Vite sert directement les pages (pas de proxy FastAPI en amont
  // pour la navigation) : une base '/vue/' y casse toute navigation directe vers une
  // route (ex. http://localhost:5173/vf-upgrades) puisque vue-router utilise
  // createWebHistory('/') et ne trouve rien sous ce prefixe -> retombe sur le
  // catch-all et redirige vers /discover. En prod, FastAPI sert l'app a la racine
  // (voir serve_spa dans app/main.py) et reserve /vue/ aux seuls assets hashes
  // references par l'index.html deja servi -- la base doit donc y rester '/vue/'.
  base: command === 'build' ? '/vue/' : '/',
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./frontend/src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/login': 'http://127.0.0.1:8000',
      '/logout': 'http://127.0.0.1:8000',
    },
  },
  build: {
    outDir: 'app/static/vue',
    emptyOutDir: true,
  },
  test: {
    environment: 'jsdom',
    include: ['frontend/src/**/*.{test,spec}.{js,ts}'],
    globals: false,
    setupFiles: ['frontend/src/testSetup.js'],
  },
}));
