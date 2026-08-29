<!--
  Barre d'onglets mobile, stable sur toute l'application.

  Auparavant chaque espace remplacait le contenu de la barre du bas : les destinations
  changeaient d'une page a l'autre, ce qui privait l'utilisateur de son principal repere.
  Apple (HIG) comme Material demandent l'inverse -- une barre dont les destinations ne
  bougent pas. Elle partage desormais ses donnees avec le rail de bureau
  (`railDestinationsFor`), et le contexte de l'espace vit dans SpaceSubnav, en haut du
  contenu.
-->
<template>
  <nav class="mobile-nav-bar mobile-only" aria-label="Navigation principale">
    <RouterLink v-for="item in primary" :key="item.key" :to="item.to" @click="close">
      <component :is="item.icon" aria-hidden="true" /><span>{{ item.label }}</span>
    </RouterLink>
    <button
      type="button"
      class="more-nav-btn"
      :class="{ active: isOpen }"
      aria-label="Ouvrir le menu principal"
      :aria-controls="sheetId"
      :aria-expanded="isOpen"
      @click="isOpen = !isOpen"
    >
      <Menu aria-hidden="true" /><span>Plus</span>
    </button>
  </nav>

  <MobileMoreSheet :open="isOpen" :sheet-id="sheetId" title="Menu" @close="close">
    <div v-if="secondary.length" class="menu-section">
      <span class="menu-label">Naviguer</span>
      <RouterLink v-for="item in secondary" :key="item.key" :to="item.to" @click="close">
        <component :is="item.icon" aria-hidden="true" />{{ item.label }}
      </RouterLink>
    </div>

    <div class="menu-section">
      <span class="menu-label">Compte</span>
      <RouterLink to="/profile" @click="close"><UserRound aria-hidden="true" />Profil</RouterLink>
      <a href="/privacy"><ShieldCheck aria-hidden="true" />Confidentialité</a>
      <a href="/logout" @click="clearCache"><LogOut aria-hidden="true" />Déconnexion</a>
    </div>
  </MobileMoreSheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { LogOut, Menu, ShieldCheck, UserRound } from '@lucide/vue';
import { clearCache } from '@/cache';
import { railDestinationsFor } from '@/spaces';
import MobileMoreSheet from '@/components/layout/MobileMoreSheet.vue';

const props = withDefaults(
  defineProps<{
    isAdmin?: boolean;
    canModerate?: boolean;
  }>(),
  { isAdmin: false, canModerate: false }
);

const sheetId = 'mobile-more-menu';
const route = useRoute();
const isOpen = ref(false);

const destinations = computed(() => railDestinationsFor(props.isAdmin, props.canModerate));
// Quatre onglets au maximum : au-dela, les libelles deviennent illisibles sur un
// telephone etroit. Le reste passe dans la feuille « Plus ».
const primary = computed(() => destinations.value.slice(0, 4));
const secondary = computed(() => destinations.value.slice(4));

function close(): void {
  isOpen.value = false;
}

watch(() => route.fullPath, close);
</script>
