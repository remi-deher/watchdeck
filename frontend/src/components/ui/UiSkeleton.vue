<template>
  <div class="ui-skeleton" :class="`is-${variant}`" role="status" aria-live="polite">
    <span class="sr-only">{{ label }}</span>
    <div v-if="variant === 'cards' || variant === 'detail'" class="ui-skeleton__kpis" aria-hidden="true">
      <span v-for="n in (variant === 'cards' ? 4 : 3)" :key="n" class="ui-skeleton__block" />
    </div>
    <div v-if="variant === 'grid'" class="ui-skeleton__grid" aria-hidden="true">
      <span v-for="n in 12" :key="n" class="ui-skeleton__poster" />
    </div>
    <div v-else class="ui-skeleton__rows" aria-hidden="true">
      <div v-for="n in rows" :key="n" class="ui-skeleton__row">
        <span v-if="variant !== 'table'" class="ui-skeleton__thumb" />
        <div class="ui-skeleton__text">
          <span class="skeleton-line" />
          <span class="skeleton-line is-short" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/* Forme grise de la page en attendant ses donnees : l'ecran est « pret » tout de suite, le
   contenu se pose ensuite. Meme balayage que les autres squelettes (`skeleton-line`). Le texte
   masque annonce le chargement aux technologies d'assistance. */
/** `cards` : indicateurs puis liste ; `list` / `table` : lignes ; `grid` : affiches ; `detail` : fiche. */
withDefaults(defineProps<{
  variant?: 'cards' | 'list' | 'table' | 'grid' | 'detail';
  rows?: number;
  label?: string;
}>(), { variant: 'list', rows: 6, label: 'Chargement…' });
</script>

<style scoped lang="scss">
.ui-skeleton { display: grid; gap: var(--space-4); width: 100%; /* n'apparait qu'apres un court delai : un chargement bref ne clignote pas */
  animation: ui-skeleton-in var(--motion-duration-base, 200ms) var(--motion-ease-standard, ease) 120ms backwards; }
.ui-skeleton__kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--space-3); }
.ui-skeleton__block, .ui-skeleton__poster, .ui-skeleton__thumb {
  position: relative; display: block; overflow: hidden;
  background: color-mix(in srgb, var(--text) 8%, transparent);
}
.ui-skeleton__block { height: 84px; border-radius: var(--radius-lg); }
.ui-skeleton__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: var(--space-3); }
.ui-skeleton__poster { aspect-ratio: 2 / 3; border-radius: var(--radius-md); }
.ui-skeleton__rows { display: grid; gap: var(--space-3); }
.ui-skeleton__row { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-lg); }
.ui-skeleton.is-table .ui-skeleton__row { border-radius: var(--radius-md); }
.ui-skeleton__thumb { flex: none; width: 44px; height: 64px; border-radius: var(--radius-sm, 6px); }
.ui-skeleton__text { flex: 1; min-width: 0; }
.ui-skeleton__text .skeleton-line { margin-bottom: 8px; }
.ui-skeleton__text .skeleton-line:last-child { margin-bottom: 0; }
.ui-skeleton__block::after, .ui-skeleton__poster::after, .ui-skeleton__thumb::after {
  content: ""; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--text) 9%, transparent), transparent);
  animation: skeleton-sweep 1.4s var(--motion-ease-standard) infinite;
}
@keyframes ui-skeleton-in { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .ui-skeleton { animation: none; }
  .ui-skeleton__block::after, .ui-skeleton__poster::after, .ui-skeleton__thumb::after { animation: none; }
}
</style>
