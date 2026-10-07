<template>
  <!-- En-tete de l'espace Administration sur telephone, la ou le dock de l'application se
       trouve ailleurs. Une administration se parcourt en profondeur : l'aperçu est la liste
       des zones, chaque zone une page, et le retour remonte d'un niveau. Le dock proposait
       au contraire les pages de l'application, qui ne menent nulle part d'ici. -->
  <div class="admin-header">
    <RouterLink class="admin-header__back" :to="backTo" :aria-label="backLabel">
      <ArrowLeft aria-hidden="true" />
      <!-- Sur l'aperçu, la destination du retour est nommee : on quitte l'espace. Dans une
           zone, la fleche suffit et le titre garde toute la largeur. -->
      <span v-if="overview">Watchdeck</span>
    </RouterLink>
    <strong class="admin-header__title" aria-hidden="true">{{ title }}</strong>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { ArrowLeft } from '@lucide/vue';

const props = withDefaults(
  defineProps<{
    /** Intitule de la zone affichee (« Administration » sur l'aperçu). */
    title: string;
    /** `true` sur l'aperçu : le retour quitte l'espace au lieu de remonter d'un niveau. */
    overview?: boolean;
    /** Derniere page de l'application visitee, que « Retour a Watchdeck » rejoint. */
    appPath?: string;
  }>(),
  { overview: false, appPath: '/' }
);

const backTo = computed(() => (props.overview ? props.appPath : '/settings'));
const backLabel = computed(() => (props.overview ? 'Retour à Watchdeck' : 'Retour à l’aperçu de l’administration'));
</script>

<style scoped lang="scss">
.admin-header {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: var(--z-bar);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2);
  height: calc(var(--app-admin-header-h) + var(--safe-top));
  padding: var(--safe-top) max(var(--space-2), var(--safe-right)) 0 max(var(--space-2), var(--safe-left));
  border-bottom: 1px solid var(--border);
  background: var(--bg);
}
.admin-header__back {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
  min-height: var(--touch-target);
  padding: 0 var(--space-2);
  border-radius: var(--radius-sm);
  color: var(--accent);
  font-size: var(--fs-md);
  font-weight: 650;
  text-decoration: none;
}
.admin-header__back svg { flex: none; width: 20px; height: 20px; }
.admin-header__back span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.admin-header__back:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.admin-header__title {
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-display);
  font-size: var(--fs-lg);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
