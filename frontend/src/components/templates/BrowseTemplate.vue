<template>
  <!-- Gabarit « Parcourir » : repond a « qu'est-ce qu'il y a d'interessant ? ». On ne
       regle rien : une banniere, puis des rangees thematiques. Le titre d'un rail est la
       porte vers la liste complete, deja reglee par l'adresse (gabarit Explorer), et le
       retour ramene ici. Repris de l'accueil d'Explorer et de la Bibliotheque en
       production :
         - `posters` : rail d'affiches (MediaPosterCollection en rail ; la carte de chaque
           element vient de la page, emplacement `item`) ;
         - `section` : rangee propre a la page (logos de plateformes, « Pour vous » et ses
           options…), emplacement `row-<cle>`, faite de composants communs ;
         - `collapsible` : section repliee, chargee a l'ouverture (`open-row`) -- les genres,
           pour ne pas couter un appel par rail a chaque affichage. -->
  <div class="browse">
    <MediaHeroBanner v-if="hero.length || heroLoading" :items="hero" :loading="heroLoading" :discover-context="heroDiscover" @open="emit('open', $event)" />

    <template v-for="row in rows" :key="row.key">
      <MediaPosterCollection
        v-if="row.kind === 'posters'"
        mode="rail"
        :title="row.title"
        :eyebrow="row.eyebrow"
        :more-to="row.moreTo || null"
        :clickable="row.clickable"
        :loading="row.loading"
        :error="row.error"
        :empty="!row.items.length"
        :empty-message="row.emptyMessage || 'Rien pour l’instant.'"
        :size="row.size || 'standard'"
        :aria-label="`${row.title}, ${row.items.length} médias`"
        @title-click="emit('title-click', row.key)"
        @retry="emit('retry', row.key)"
      >
        <template v-for="(item, index) in row.items" :key="itemKey(item, index)">
          <slot name="item" :item="item" :row="row.key" :index="index" />
        </template>
      </MediaPosterCollection>

      <section v-else-if="row.kind === 'section'" class="browse__section">
        <slot :name="`row-${row.key}`" />
      </section>

      <UiDisclosure v-else-if="row.kind === 'collapsible'" :title="row.title" :eyebrow="row.eyebrow" :storage-key="row.storageKey" @open="emit('open-row', row.key)">
        <slot :name="`row-${row.key}`" />
      </UiDisclosure>
    </template>
  </div>
</template>

<script setup lang="ts">
import MediaHeroBanner from '@/components/media/MediaHeroBanner.vue';
import MediaPosterCollection from '@/components/media/MediaPosterCollection.vue';
import UiDisclosure from '@/components/ui/UiDisclosure.vue';

export interface BrowsePosterRow {
  kind: 'posters';
  key: string;
  title: string;
  eyebrow?: string;
  items: any[];
  loading?: boolean;
  error?: string;
  emptyMessage?: string;
  /** La liste complete, deja reglee (gabarit Explorer). */
  moreTo?: string | Record<string, any> | null;
  /** Sans lien : le titre emet `title-click` (un tri a poser dans l'adresse…). */
  clickable?: boolean;
  size?: 'standard' | 'compact' | 'music';
}
export interface BrowseSectionRow { kind: 'section'; key: string }
export interface BrowseCollapsibleRow { kind: 'collapsible'; key: string; title: string; eyebrow?: string; storageKey?: string }
export type BrowseRow = BrowsePosterRow | BrowseSectionRow | BrowseCollapsibleRow;

withDefaults(
  defineProps<{
    rows: BrowseRow[];
    hero?: any[];
    heroLoading?: boolean;
    /** Banniere d'Explorer (demandes possibles) ou de la Bibliotheque. */
    heroDiscover?: boolean;
    itemKey?: (item: any, index: number) => string | number;
  }>(),
  { hero: () => [], heroLoading: false, heroDiscover: true, itemKey: (item: any, index: number) => item?.id ?? index },
);
const emit = defineEmits<{
  open: [item: any];
  'title-click': [rowKey: string];
  retry: [rowKey: string];
  /** Une section repliable s'ouvre : la page charge ses rails. */
  'open-row': [rowKey: string];
}>();
</script>

<style scoped lang="scss">
.browse { display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-5); min-width: 0; }
.browse__section { min-width: 0; }
</style>
