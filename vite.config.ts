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
      '/logout': 'http://127.0.0.1:8000',
    },
  },
  build: {
    outDir: 'app/static/vue',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Séparer les bibliothèques lourdes, sans agréger les composants des
        // routes lazy dans un bloc UI qui les chargerait dès le démarrage.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Chart.js est nettement plus lourd que les primitives UI : le garder
            // dans un chunk propre evite de le charger sur les routes sans graphe.
            if (id.includes('/node_modules/chart.js/')) return 'charts';
            if (id.includes('/node_modules/zod/')) return 'settings-validation';
            if (id.includes('@lucide')) return 'icons';
            if (/\/node_modules\/(vue|@vue|vue-router|pinia)\//.test(id)) return 'vendor';
            return undefined;
          }
          // Laisser les composants de route dans leur graphe lazy : un bloc UI
          // global tirait les graphiques et les fiches dans le démarrage.
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    // Les dates s'affichent et se regroupent dans le fuseau du navigateur : les tests
    // calendaires (changements d'heure) doivent tourner dans un fuseau qui en a un,
    // quelle que soit la machine ou le runner CI.
    env: { TZ: 'Europe/Paris' },
    include: ['frontend/src/**/*.{test,spec}.{js,ts}'],
    globals: false,
    setupFiles: ['frontend/src/testSetup.js'],
  },
}));
