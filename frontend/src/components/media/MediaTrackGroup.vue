<template>
  <UiCollapsible class="season-details" :unmount-on-hide="false" trigger-class="track-group-summary collapsible-trigger" content-class="collapsible-content">
    <template #trigger>
      <span>{{ title }} ({{ tracks.length }})</span>
      <ChevronDown :size="16" />
    </template>
    <div class="track-group-body">
      <article v-for="(track, index) in tracks" :key="index" class="detail-row track-row">
        <div>
          <strong>{{ track.lang ? track.lang.toUpperCase() : 'Inconnu' }} <span v-if="track.is_default" class="track-default-tag">(Par défaut)</span></strong>
          <span>{{ track.label || fallbackLabel }}</span>
        </div>
        <span class="badge" :class="highlightFr && track.is_fr ? 'available' : ''">{{ track.lang ? track.lang.toUpperCase() : '??' }}</span>
      </article>
    </div>
  </UiCollapsible>
</template>

<script setup lang="ts">
/* Groupe repliable de pistes d'un fichier (audio ou sous-titres) : langue, piste par
   defaut, libelle ; `highlightFr` met en avant les pistes francaises. */
import { ChevronDown } from '@lucide/vue';
import UiCollapsible from '@/components/ui/UiCollapsible.vue';

withDefaults(
  defineProps<{
    title: string;
    tracks: Array<{ lang?: string | null; label?: string | null; is_default?: boolean; is_fr?: boolean }>;
    fallbackLabel?: string;
    highlightFr?: boolean;
  }>(),
  { fallbackLabel: '', highlightFr: false }
);
</script>

<style scoped lang="scss">
/* Pistes en pastilles sur plusieurs colonnes (2 sur mobile) : dix sous-titres tiennent
   en quelques lignes au lieu d'une longue colonne. */
.track-group-body {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
  gap: 6px;
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  padding-left: 0.5rem;
  border-left: 2px solid var(--border);
}
/* Reste en ligne sur mobile (la regle globale des .detail-row les empile) : langue a
   gauche, pastille a droite, pour garder des cartes basses. */
.track-row {
  flex-direction: row;
  align-items: center;
  text-align: left;
  min-height: 0;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}
.track-default-tag {
  opacity: 0.8;
  font-weight: normal;
  font-size: var(--fs-sm);
}
</style>
