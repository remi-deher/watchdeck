import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const SHARED_MEDIA = [
  'MediaCardShell',
  'MediaPosterCard',
  'MediaPosterCollection',
  'MediaGrid',
  'MediaRail',
];

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
    rollupOptions: {
      output: {
        // Rollup isole par defaut chaque module partage entre deux routes lazy dans
        // son propre chunk : on se retrouvait avec une trentaine de fichiers de
        // moins de 2 Ko (une icone, un composable) payant chacun un aller-retour
        // complet avant le premier paint. On regroupe les socles reellement
        // communs -- runtime, icones, briques UI, cartes media -- pour ramener la
        // cascade a quelques requetes.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@lucide')) return 'icons';
            if (/\/node_modules\/(vue|@vue|vue-router|pinia)\//.test(id)) return 'vendor';
            return undefined;
          }
          if (id.includes('/frontend/src/components/ui/')) return 'ui';
          if (id.includes('/frontend/src/composables/')) return 'ui';
          // Uniquement les primitives media reellement partagees entre routes :
          // le reste du dossier (AlignStreamsModal, VfUpgradeButton,
          // MediaAudioSection...) n'appartient qu'a la fiche detail et doit
          // rester charge a la demande.
          if (SHARED_MEDIA.some((name) => id.includes(`/frontend/src/components/media/${name}.vue`))) return 'ui';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['frontend/src/**/*.{test,spec}.{js,ts}'],
    globals: false,
    setupFiles: ['frontend/src/testSetup.js'],
  },
}));
