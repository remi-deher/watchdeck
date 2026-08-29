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

// Les dialogues (ModalShell, DrawerShell, MobileMoreSheet...) se Teleport vers <body>
// pour que useBodyScrollLock puisse rendre le reste de l'app inert pendant qu'ils sont
// ouverts. Sans ce stub, wrapper.find() ne verrait plus leur contenu puisqu'il ne
// cherche pas hors du sous-arbre monté par @vue/test-utils.
import { config } from "@vue/test-utils";
config.global.stubs = { ...config.global.stubs, teleport: true };
