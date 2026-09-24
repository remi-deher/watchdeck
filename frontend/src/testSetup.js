// jsdom ne fournit pas IntersectionObserver : stub minimal pour les composants qui
// l'utilisent (ex. InfiniteScrollTrigger.vue), sans quoi leur montage lève une
// ReferenceError qui fait planter les tests qui les incluent indirectement (DiscoverView...).
if (typeof globalThis.IntersectionObserver === "undefined") {
  globalThis.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Les dialogues (ModalShell, DrawerShell, AppNavSheet...) se Teleport vers <body>
// pour que useBodyScrollLock puisse rendre le reste de l'app inert pendant qu'ils sont
// ouverts. Sans ce stub, wrapper.find() ne verrait plus leur contenu puisqu'il ne
// cherche pas hors du sous-arbre monté par @vue/test-utils.
import { afterEach } from "vitest";
import { config, enableAutoUnmount } from "@vue/test-utils";

/* Tout composant monte est demonte a la fin de son test. Sans cela, il survivait au
   test suivant avec ses ecouteurs sur `window`, ses minuteurs et ses ecritures dans le
   stockage local : un composant d'un test precedent pouvait reecrire une preference
   apres le nettoyage du suivant. C'etait la cause des echecs intermittents, plus
   frequents sous charge, de TorrentClientsTable.spec.js notamment. */
enableAutoUnmount(afterEach);
import PrimeVue from 'primevue/config';
/* Le bouchon par defaut (`teleport: true`) rend une balise vide pour les portails de
   Reka UI : leurs dialogues disparaissaient des tests. Celui-ci rend le contenu sur place. */
config.global.stubs = { ...config.global.stubs, teleport: { template: '<div class="teleport-stub"><slot /></div>' } };
config.global.plugins = [...(config.global.plugins || []), PrimeVue];
// Directive globale enregistree dans main.ts : sans elle, chaque liste animee avertit.
import { vListMotion } from '@/motion/vListMotion';
config.global.directives = { ...config.global.directives, 'list-motion': vListMotion };
